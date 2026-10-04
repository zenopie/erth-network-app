import { getOr, seg } from "./rest";
import { b64ToHex } from "./bytes";

/**
 * x/shieldedstaking — private staking.
 *
 * The shielded module is the only delegator besides validators' own self-bond.
 * A private staker holds `derth/<valoper>` stake notes, worth `rate_v` ERTH
 * each. derth is not a coin and not a shielded-pool asset: stake notes live in
 * the module's own owner-locked stake tree (non-transferable), and the supply
 * is a book entry (ValidatorState.derth_supply), so it is read from the
 * Validator query, never from x/bank. Rewards are compounded into the
 * module's delegation at every epoch end, so the rate rises instead of anyone
 * being paid. Delegations and undelegations are batched at epoch end and made
 * from the phone; a matured undelegation is paid out by the chain itself.
 * Everything here is per validator or per position, never per owner.
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
    // Positions are uncapped (max_positions is gone); min_position is the
    // least derth one may lock.
    minPosition: p.min_position ?? "0",
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
    // derth outstanding (stake notes + positions). `supply` is the query's
    // figure; state.derth_supply is the same book entry.
    supply: data.supply ?? s.derth_supply ?? "0",
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
 * split across Groundworks options. Its owner is known only by `owner_tag`
 * (H(owner_pk, salt), proven by the stake circuit), so the split and weight
 * are public and the person behind it is not. The tag is per position and
 * links nothing.
 *
 * The stream does not weigh positions one by one: all of a validator's
 * positions are one weighted voter (allocation.validatorVoter). A position's
 * `weight` is not stored; the query fills it in as derth x its validator's
 * epoch rate while its split is live, and 0 when the split is from before a
 * Groundworks reset (`splitEpoch` older than the stream's epoch; the owner
 * votes again from the app). Summed, positions' weights can exceed their
 * validator voter's by a few uerth (the voter truncates once per option).
 */
export async function positions() {
  const out = [];
  let key = "";
  // Positions are uncapped; the page guard (1,000 x 200) only stops a
  // misbehaving next_key.
  for (let page = 0; page < 1000; page++) {
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
        splitEpoch: Number(p.split_epoch ?? 0),
        ownerTag: b64ToHex(p.owner_tag),
      });
    }
    key = data.pagination?.next_key ?? "";
    if (!key) break;
  }
  return out;
}

/**
 * A proposal's stake-vote snapshot, taken when it entered voting: the note
 * stake-tree root stake votes prove against and each validator's derth supply and rate
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

/**
 * The stake note tree (derth notes): leaf count and latest root
 * (hex, "" before the first note). Null when the read fails.
 */
export async function stakeTree() {
  const data = await getOr("/earth/shieldedstaking/v1/stake_tree", null);
  if (!data) return null;
  return { size: Number(data.size ?? 0), root: b64ToHex(data.root) };
}
