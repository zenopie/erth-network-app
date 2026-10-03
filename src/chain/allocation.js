import { fromBech32, toBech32 } from "@cosmjs/encoding";
import { getOr, seg } from "./rest";
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

/**
 * A stream's options plus its aggregates: { options, totalWeight, epoch }, or
 * null when the read fails. `kind` is INTEGRATED (resolved every block by a
 * protocol handler, e.g. LP rewards) or ADDRESS (accrues ERTH claimable to a
 * fixed recipient). Options are paged on chain (adding an ADDRESS option is
 * permissionless), so every page is walked.
 */
export async function streamView(stream) {
  const options = [];
  let totalWeight = "0";
  let epoch = 0;
  let key = "";
  for (let page = 0; page < 20; page++) {
    const q = `?pagination.limit=100${key ? `&pagination.key=${encodeURIComponent(key)}` : ""}`;
    const data = await getOr(seg`/earth/allocation/v1/options/${streamPath(stream)}` + q, null);
    if (!data) return page === 0 ? null : { options, totalWeight, epoch };
    options.push(...(data.options ?? []).map(toOption));
    totalWeight = data.total_weight ?? totalWeight;
    epoch = Number(data.epoch ?? epoch);
    key = data.pagination?.next_key ?? "";
    if (!key) break;
  }
  return { options, totalWeight, epoch };
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
 * carries (its bonded stake — on this chain, a validator's self-bond). The
 * LCD 404s for an address that has never voted. Caretaker splits are keyed by
 * nullifier and cannot be read this way.
 */
export async function groundworksVoter(address) {
  const data = await getOr(
    seg`/earth/allocation/v1/voter/${streamPath(STREAM_GROUNDWORKS)}/${address}`,
    null,
  );
  return toVoter(data?.voter);
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
// Groundworks only: the chain refuses a caretaker split from an address.
export function msgSetAllocations(creator, stream, weights) {
  if (Number(stream) !== STREAM_GROUNDWORKS) {
    throw new Error("Caretaker splits are cast privately from the mobile app.");
  }
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
    stream: o.stream ?? "",
    description: o.description ?? "",
    kind: o.kind ?? "",
    recipient: o.recipient ?? "",
    handler: o.handler ?? "",
    claimer: o.claimer ?? "",
    removed: Boolean(o.removed),
    amountAllocated: o.amount_allocated ?? "0",
    accumulated: o.accumulated ?? "0",
  };
}
