import { getOr, seg } from "./rest";
import { b64ToHex } from "./bytes";

/**
 * x/shieldedstaking — private staking.
 *
 * The shielded module is the only delegator besides validators' own self-bond.
 * A private staker holds `derth/<valoper>` notes, worth `rate_v` ERTH each;
 * rewards are compounded into the module's delegation at every epoch end, so
 * the rate rises instead of anyone being paid. Delegations, undelegations and
 * claims are batched at epoch end and made from the phone. Everything here is
 * per validator or per position, never per owner.
 */

/** The epoch in progress: { number, startTime, endTime } in unix seconds. */
export async function epoch() {
  const data = await getOr("/earth/shieldedstaking/v1/epoch", null);
  const e = data?.epoch;
  if (!e) return null;
  return {
    number: Number(e.number ?? 0),
    startTime: Number(e.start_time ?? 0),
    endTime: Number(e.end_time ?? 0),
  };
}

export async function params() {
  const data = await getOr("/earth/shieldedstaking/v1/params", null);
  const p = data?.params;
  if (!p) return null;
  return {
    epochSeconds: Number(p.epoch_seconds ?? 0),
    minPosition: p.min_position ?? "0",
    maxPositions: Number(p.max_positions ?? 0),
  };
}

/**
 * The module's book for one validator: the live rate (ERTH per derth), the
 * rate as of the last epoch end, derth supply, the ERTH backing it, and what
 * is queued to be delegated or undelegated at the next epoch end. A
 * validator the module has never staked with reads as an empty book; null
 * means the read failed.
 */
export async function validator(valoper) {
  const data = await getOr(seg`/earth/shieldedstaking/v1/validators/${valoper}`, null);
  if (!data) return null;
  const s = data.state ?? {};
  return {
    validator: s.validator ?? valoper,
    rate: Number(data.rate ?? 0),
    epochRate: Number(s.epoch_rate ?? 0),
    supply: data.supply ?? "0",
    backing: data.backing ?? "0",
    pendingDelegation: s.pending_delegation ?? "0",
    pendingUndelegation: s.pending_undelegation ?? "0",
  };
}

/** validator() for each operator, as a { valoper: book|null } map. */
export async function validatorBooks(valopers) {
  const books = await Promise.all(valopers.map((v) => validator(v)));
  return Object.fromEntries(valopers.map((v, i) => [v, books[i]]));
}

/**
 * Every Groundworks position. A position is derth locked in the module and
 * split across Groundworks options; its owner is a one-time key, so the split
 * and weight are public and the person behind it is not.
 */
export async function positions() {
  const out = [];
  let key = "";
  // Positions are capped by params.max_positions, so this terminates; the
  // page guard is belt and braces against a misbehaving next_key.
  for (let page = 0; page < 50; page++) {
    const q = `?pagination.limit=200${key ? `&pagination.key=${encodeURIComponent(key)}` : ""}`;
    const data = await getOr(`/earth/shieldedstaking/v1/positions${q}`, null);
    if (!data) return page === 0 ? null : out;
    for (const p of data.positions ?? []) {
      out.push({
        id: Number(p.id ?? 0),
        validator: p.validator ?? "",
        derth: p.derth ?? "0",
        weight: p.weight ?? "0",
        splits: (p.splits ?? []).map((w) => ({
          optionId: Number(w.option_id),
          percent: Number(w.percent),
        })),
        createdHeight: Number(p.created_height ?? 0),
      });
    }
    key = data.pagination?.next_key ?? "";
    if (!key) break;
  }
  return out;
}

/**
 * A proposal's stake-vote snapshot, taken when it entered voting: the note
 * root stake votes prove against and each validator's derth supply and rate
 * at that moment. Null before voting starts.
 */
export async function snapshot(proposalId) {
  const data = await getOr(seg`/earth/shieldedstaking/v1/snapshots/${proposalId}`, null);
  const s = data?.snapshot;
  if (!s) return null;
  return {
    proposalId: Number(s.proposal_id ?? proposalId),
    root: b64ToHex(s.root),
    treeSize: Number(s.tree_size ?? 0),
    height: Number(s.height ?? 0),
    validators: (s.validators ?? []).map((v) => ({
      validator: v.validator ?? "",
      supply: v.supply ?? "0",
      rate: Number(v.rate ?? 0),
    })),
  };
}
