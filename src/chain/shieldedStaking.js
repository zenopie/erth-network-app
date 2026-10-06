import { getOr, seg, text as str } from "./rest";
import { b64ToHex } from "./bytes";

/**
 * x/shieldedstaking — private staking.
 *
 * The shielded module is the only delegator besides validators' own self-bond.
 * A private staker holds one `derth/<valoper>` stake note per validator, each
 * derth worth `rate_v` ERTH: every credit (a delegation, an unlocked
 * position, a redelegation's arrival) is merged into that one note. derth is
 * not a coin and not a shielded-pool asset: stake notes live in the module's
 * own owner-locked stake tree (non-transferable), and the supply is a book
 * entry (ValidatorState.derth_supply), so it is read from the Validators
 * query, never from x/bank. Rewards are compounded into the module's
 * delegation at every epoch end, so the rate rises instead of anyone being
 * paid. Delegations and undelegations are made from the phone and batched at
 * epoch end; a matured undelegation is paid out automatically, as a shielded
 * note to the address the undelegation named: there is nothing to claim.
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

// Query/Validators' largest page (keeper.MaxValidatorsPage).
const VALIDATORS_PAGE = 200;
// Walks of the whole list before giving up on reading it at one height.
const VALIDATORS_ATTEMPTS = 3;

/** One ValidatorQuote as the page uses it. */
function toQuote(q) {
  const s = q.book ?? {};
  const st = q.staking ?? {};
  const removed = !st.operator_address;
  return {
    validator: str(q.validator),
    // x/staking's record ({} once x/staking removed the validator, while its
    // book winds down).
    removed,
    staking: removed ? null : st,
    moniker: removed ? "" : str(st.description?.moniker),
    status: removed ? "" : str(st.status),
    bonded: !removed && st.status === "BOND_STATUS_BONDED",
    jailed: !removed && Boolean(st.jailed),
    tokens: removed ? "0" : intStr(st.tokens),
    tombstoned: Boolean(q.tombstoned),
    // Whether a delegation or a redelegation into it would be taken now, and
    // the chain's reason when not (undelegations, redelegations out and stake
    // votes do not depend on it).
    delegatable: Boolean(q.delegatable),
    refusal: str(q.refusal),
    rate: Number(q.rate ?? 0),
    epochRate: Number(s.epoch_rate ?? 0),
    // derth outstanding (stake notes + positions): the book's figure. derth
    // is not a coin, so never x/bank's.
    supply: intStr(q.supply ?? s.derth_supply),
    backing: intStr(q.backing),
    pendingDelegation: intStr(s.pending_delegation),
    pendingUndelegation: intStr(s.pending_undelegation),
  };
}

const intStr = (v) => (/^\d+$/.test(String(v ?? "")) ? String(v) : "0");

/**
 * Every validator as x/shieldedstaking quotes it (Query/Validators): its
 * x/staking record, whether it takes private delegations (and why not), and
 * its book: live rate, rate as of the last epoch end, derth supply, the ERTH
 * backing it and what is queued for the next epoch end. One paged list, so no
 * read names the validator someone is about to act on. The last page also
 * carries books whose validator x/staking removed (`removed`).
 *
 * { height, validators, partial } or null when the first page fails. Every
 * page must be of one state: the LCD takes a height only as the
 * x-cosmos-block-height request header, which the CORS preflight in front of
 * it refuses (see explorer.supplyAtHeight), so instead each page's `height`
 * is compared and the walk starts over when a block landed in between.
 * `partial` is true when a later page failed, a page key repeated, the page
 * guard was hit, or no walk read at one height.
 */
export async function validators({ maxPages = 100 } = {}) {
  let last = null;
  for (let attempt = 0; attempt < VALIDATORS_ATTEMPTS; attempt++) {
    const walk = await walkValidators(maxPages);
    if (!walk) return last;
    if (!walk.mixed) return { height: walk.height, validators: walk.validators, partial: walk.partial };
    last = { height: walk.height, validators: walk.validators, partial: true };
  }
  return last;
}

async function walkValidators(maxPages) {
  const out = [];
  let key = "";
  let height = null;
  let mixed = false;
  const seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    const q = `?pagination.limit=${VALIDATORS_PAGE}${key ? `&pagination.key=${encodeURIComponent(key)}` : ""}`;
    const data = await getOr(`/earth/shieldedstaking/v1/validators${q}`, null);
    if (!data) return page === 0 ? null : { height, validators: out, partial: true, mixed };
    const h = Number(data.height ?? 0);
    if (height === null) height = h;
    else if (h !== height) mixed = true;
    out.push(...(data.validators ?? []).map(toQuote));
    key = data.pagination?.next_key ?? "";
    if (!key) return { height, validators: out, partial: false, mixed };
    if (seen.has(key)) return { height, validators: out, partial: true, mixed };
    seen.add(key);
  }
  return { height, validators: out, partial: true, mixed };
}

/**
 * Plain words for a quote's refusal (the chain's error text stays available
 * as `refusal` for a tooltip), "" when it takes delegations.
 */
export function refusalReason(q) {
  if (!q || q.delegatable) return "";
  const r = q.refusal;
  if (q.removed || /not.*found|does not exist/i.test(r)) return "Removed from the chain";
  if (q.tombstoned || /tombstoned/.test(r)) return "Tombstoned (double-signed)";
  if (q.jailed || /jailed/.test(r)) return "Jailed";
  if (/slashed to nothing/.test(r)) return "Slashed to nothing";
  if (/settling/.test(r)) return "Settling until the epoch ends";
  return "Not taking delegations";
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
        // When the split stops counting (unix seconds; 0 without a split).
        // At that time the chain clears it; the owner re-casts in the app.
        splitExpiresAt: Number(p.split_expires_at ?? 0),
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
