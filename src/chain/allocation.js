import { fromBech32, toBech32 } from "@cosmjs/encoding";
import { get, getOr, seg, text as str } from "./rest";
import { valoperOf } from "./staking";
import { ADDRESS_PREFIX } from "./config";

/**
 * x/allocation — both vote-directed emission streams, over one engine.
 *
 * Every read and message names a stream. The two streams share the option
 * mechanics and share no state: option ids, totals and epochs are per stream.
 *
 *   CARETAKER   — one human, one vote. Splits are cast anonymously from the
 *                 mobile app (x/personhood MsgSetCaretaker, a membership
 *                 proof) and filed under a nullifier, not an address, so
 *                 there is no per-voter read here; each split lapses after
 *                 R days unless the app refreshes it.
 *   GROUNDWORKS — weighted by stake. Most of that weight is Groundworks
 *                 positions (locked private derth, see ./shieldedStaking.js),
 *                 weighed per validator: all of one validator's positions are
 *                 ONE weighted voter (validatorVoter) carrying an absolute
 *                 weight per option, trunc(rate x sum(derth x percent) / 100).
 *                 The rest is validators' own self-bond, which an operator can
 *                 still direct transparently with MsgSetAllocations.
 */

/**
 * Stream ids as the chain's protobuf enum numbers them. Messages carry these
 * values; the LCD wants the *name* in the URL path (see streamPath).
 */
export const STREAM_CARETAKER = 1;
export const STREAM_GROUNDWORKS = 2;

/**
 * The LCD spells the stream out in full — grpc-gateway parses the enum by name
 * and rejects the short form the CLI accepts. `/options/human` returns
 * "type mismatch, parameter: stream".
 */
function streamPath(stream) {
  switch (stream) {
    case STREAM_CARETAKER:
      return "STREAM_ID_CARETAKER";
    case STREAM_GROUNDWORKS:
      return "STREAM_ID_GROUNDWORKS";
    default:
      throw new Error(`unknown allocation stream: ${stream}`);
  }
}

// Pages walked before a stream's option list is called partial: 100 options a
// page (the chain's MaxOptionsPageSize), so 100 000 options. Adding an
// ADDRESS option is permissionless (for a fee), so this is a guard against an
// unbounded read, not a size the list is expected to reach.
export const MAX_OPTION_PAGES = 1000;

/**
 * A stream's options plus its aggregates: { options, totalWeight, epoch,
 * partial }, or null when the first read fails. `kind` is INTEGRATED
 * (resolved every block by a protocol handler, e.g. LP rewards) or ADDRESS
 * (accrues ERTH claimable to a fixed recipient). Options are paged on chain
 * (adding an ADDRESS option is permissionless), so pages are walked until
 * next_key is empty. `partial` is true when a later page failed, a page key
 * repeated, or MAX_OPTION_PAGES was hit: the options are then not all of
 * them, and shares must be taken against `totalWeight` (the chain's sum over
 * every live option), never the sum of the options loaded (audit 6 L-6).
 */
export async function streamView(stream, { maxPages = MAX_OPTION_PAGES } = {}) {
  const options = [];
  let totalWeight = "0";
  let epoch = 0;
  let key = "";
  const seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    const q = `?pagination.limit=100${key ? `&pagination.key=${encodeURIComponent(key)}` : ""}`;
    const data = await getOr(seg`/earth/allocation/v1/options/${streamPath(stream)}` + q, null);
    if (!data) return page === 0 ? null : { options, totalWeight, epoch, partial: true };
    options.push(...(data.options ?? []).map(toOption));
    // The aggregates describe the whole stream; the first page's are kept so
    // a later page cannot move them under options already read.
    if (page === 0) {
      totalWeight = /^\d+$/.test(String(data.total_weight ?? "")) ? String(data.total_weight) : "0";
      epoch = Number(data.epoch ?? 0);
    }
    key = data.pagination?.next_key ?? "";
    if (!key) return { options, totalWeight, epoch, partial: false };
    if (seen.has(key)) return { options, totalWeight, epoch, partial: true };
    seen.add(key);
  }
  return { options, totalWeight, epoch, partial: true };
}

/** Just the options of a stream ([] when unreadable). */
export async function allocationOptions(stream) {
  return (await streamView(stream))?.options ?? [];
}

function toVoter(v) {
  return {
    splits: (v?.percentages ?? []).map((w) => ({
      optionId: Number(w.option_id),
      percent: Number(w.percent),
    })),
    // A weighted voter (a validator's positions) puts an absolute weight on
    // each option instead of a percentage split; weight is their sum.
    optionWeights: (v?.option_weights ?? []).map((w) => ({
      optionId: Number(w.option_id),
      weight: w.weight ?? "0",
    })),
    weight: v?.weight ?? "0",
    epoch: Number(v?.epoch ?? 0),
  };
}

/**
 * An address's Groundworks split as [{ optionId, percent }] and the weight it
 * carries (its bonded stake — on this chain, a validator's self-bond).
 * Caretaker splits are keyed by nullifier and cannot be read this way.
 *
 * { splits, weight, epoch, exists, stale }:
 *   exists — the chain has a voter record. The LCD 404s for an address that
 *            has never voted; that is not zero weight, it is a validator yet to
 *            set its first split, so the weight it would vote with is read
 *            from its self-bond.
 *   stale  — the record was filed before the stream's current epoch
 *            (`streamEpoch`, from streamView): its split no longer counts
 *            until set again, so it is shown as stale and the weight is again
 *            the self-bond it would be re-cast with.
 * Any other read failure throws rather than passing for "no weight".
 */
export async function groundworksVoter(address, { streamEpoch = 0 } = {}) {
  let voter = null;
  try {
    const data = await get(seg`/earth/allocation/v1/voter/${streamPath(STREAM_GROUNDWORKS)}/${address}`);
    voter = data?.voter ?? null;
  } catch (err) {
    if (!/LCD 404/.test(err?.message ?? "")) throw err;
  }
  const v = toVoter(voter);
  const exists = voter !== null;
  const stale = exists && Number(streamEpoch) > 0 && v.epoch < Number(streamEpoch);
  if (exists && !stale) return { ...v, exists, stale };
  return { ...v, weight: await selfBond(address), exists, stale };
}

/** The account's bond to its own validator (uerth string), "0" when it runs none. */
async function selfBond(address) {
  const valoper = valoperOf(address);
  if (!valoper) return "0";
  const d = await getOr(seg`/cosmos/staking/v1beta1/validators/${valoper}/delegations/${address}`, null);
  const amt = String(d?.delegation_response?.balance?.amount ?? "0").split(".")[0];
  return /^\d+$/.test(amt) ? amt : "0";
}

/** x/shieldedstaking's voter key prefix (types.ValidatorVoterPrefix). */
const VALIDATOR_VOTER_PREFIX = new TextEncoder().encode("gwpos/");

/**
 * The voter key, as the bech32 string the Voter query takes, under which
 * x/allocation weighs all of `valoper`'s Groundworks positions together:
 * "gwpos/" || the validator's address bytes (26 or 38 bytes, never an
 * account's 20 or 32).
 */
export function validatorVoterAddress(valoper) {
  const { data } = fromBech32(valoper, 90);
  const key = new Uint8Array(VALIDATOR_VOTER_PREFIX.length + data.length);
  key.set(VALIDATOR_VOTER_PREFIX, 0);
  key.set(data, VALIDATOR_VOTER_PREFIX.length);
  return toBech32(ADDRESS_PREFIX, key, 90);
}

/**
 * One validator's positions as the Groundworks stream weighs them: the
 * weighted voter's absolute weight per option ([{ optionId, weight }]), their
 * sum and the stream epoch it was filed in. Zero weights when the validator
 * has no live positions (the LCD 404s, as it does for any unknown voter).
 */
export async function validatorVoter(valoper) {
  const data = await getOr(
    seg`/earth/allocation/v1/voter/${streamPath(STREAM_GROUNDWORKS)}/${validatorVoterAddress(valoper)}`,
    null,
  );
  return { validator: valoper, ...toVoter(data?.voter) };
}

/** validatorVoter() for each operator, as a { valoper: voter } map. */
export async function validatorVoters(valopers) {
  const vs = await Promise.all(valopers.map((v) => validatorVoter(v).catch(() => null)));
  return Object.fromEntries(valopers.map((v, i) => [v, vs[i]]));
}

// --- messages ---

/**
 * ts-proto emits `number` for uint64, not bigint — passing BigInt breaks
 * encoding. Everything numeric here goes through Number().
 */
// x/allocation MaxVoterOptions: the most options one split may name.
export const MAX_SPLIT_OPTIONS = 20;

/** A split entry's percent as typed: an integer 1..100, else null. */
export function splitPercent(v) {
  const s = String(v ?? "").trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 100 ? n : null;
}

/**
 * Why x/allocation ValidateSplit would refuse this non-empty split, or null:
 * each entry an integer share of 1..100 % (no zero, no negative), distinct
 * options, at most MAX_SPLIT_OPTIONS of them, summing to exactly 100
 * (audit 6 L-7). Refused before signing rather than for a fee.
 */
export function splitProblem(weights) {
  if (!weights.length) return "Add at least one option.";
  if (weights.length > MAX_SPLIT_OPTIONS) return `A split names at most ${MAX_SPLIT_OPTIONS} options.`;
  const ids = new Set();
  let sum = 0;
  for (const w of weights) {
    const p = splitPercent(w.percent);
    if (p === null) return "Each option's share must be a whole percent from 1 to 100.";
    if (ids.has(String(w.optionId))) return "An option appears twice.";
    ids.add(String(w.optionId));
    sum += p;
  }
  return sum === 100 ? null : "Total allocation must equal 100%.";
}

// Groundworks only: the chain refuses a caretaker split from an address.
export function msgSetAllocations(creator, stream, weights) {
  if (Number(stream) !== STREAM_GROUNDWORKS) {
    throw new Error("Caretaker splits are cast privately from the mobile app.");
  }
  const problem = splitProblem(weights);
  if (problem) throw new Error(problem);
  return {
    typeUrl: "/earth.allocation.v1.MsgSetAllocations",
    value: {
      creator,
      stream: Number(stream),
      percentages: weights.map((w) => ({
        optionId: Number(w.optionId),
        percent: Number(w.percent),
      })),
    },
  };
}

export function msgClaimAllocation(creator, stream, optionId) {
  return {
    typeUrl: "/earth.allocation.v1.MsgClaimAllocation",
    value: { creator, stream: Number(stream), optionId: Number(optionId) },
  };
}

function toOption(o) {
  return {
    id: Number(o.id),
    stream: str(o.stream),
    description: str(o.description),
    kind: str(o.kind),
    recipient: str(o.recipient),
    handler: str(o.handler),
    claimer: str(o.claimer),
    removed: Boolean(o.removed),
    amountAllocated: o.amount_allocated ?? "0",
    accumulated: o.accumulated ?? "0",
  };
}
