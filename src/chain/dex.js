import { getOr, seg } from "./rest";
import { UANML, UERTH, lpDenom } from "./config";
import { blindNotePayment, checkBlindCiphertext } from "./noteCipher";
import { supplyOrNull } from "./bank";
import { minimumReceived } from "./tokens";

/**
 * x/dex — a spoke-and-wheel AMM hubbed on ERTH. Every pool pairs ERTH (the hub)
 * with one spoke token, so any token can be routed to any other through ERTH.
 * LP shares are the bank denom `dexlp/{poolId}`. A transparent deposit
 * (MsgAddLiquidity) pays them to the signer's account; a shielded deposit
 * (MsgAddLiquidityShielded, phone only) mints them as a private note, so no
 * holder of those is visible and they leave only through
 * MsgRemoveLiquidityShielded. Pool-level figures (reserves, total shares =
 * bank supply) stay public; per-holder shares here are this account's
 * transparent balance only.
 */

/** All pools: { id, erthReserve, tokenDenom, tokenReserve, volumeErth }. */
export async function pools() {
  const data = await getOr("/earth/dex/v1/pool", { pool: [] });
  return (data.pool ?? []).map(toPool);
}

/** A single pool by id, or null. */
export async function pool(poolId) {
  const data = await getOr(seg`/earth/dex/v1/pool/${poolId}`, null);
  return data?.pool ? toPool(data.pool) : null;
}

/** The pool pairing ERTH with `tokenDenom`, or null if there is none. */
export async function poolForToken(tokenDenom) {
  return (await pools()).find((p) => p.tokenDenom === tokenDenom) ?? null;
}

function toPool(p) {
  return {
    id: Number(p.pool_id),
    lpDenom: lpDenom(p.pool_id),
    erthReserve: p.reserve_erth.amount,
    tokenDenom: p.reserve_token.denom,
    tokenReserve: p.reserve_token.amount,
    // 14-day-weighted swap volume in real uerth, weighted and de-scaled by the
    // chain. Storage keeps a different figure (volume_weight, scaled by a
    // chain-wide index that grows forever); queries return PoolView, which does
    // not carry it. Nothing here ages this — see chain/apr.js.
    volumeErth: p.volume_erth ?? "0",
    lastTradedDay: Number(p.last_traded_day ?? 0),
  };
}

/** Swap fee as a percent number (e.g. 0.3 for 0.3%). */
export async function swapFeePercent() {
  const data = await getOr("/earth/dex/v1/params", null);
  return Number(data?.params?.swap_fee ?? 0);
}

/** The swap fee exactly as the chain holds it (a decimal string), or null. */
export async function swapFeeDec() {
  const data = await getOr("/earth/dex/v1/params", null);
  return data?.params?.swap_fee ?? null;
}

/** How long withdrawn LP shares are escrowed before they pay out, in seconds. */
export async function lpUnbondingSeconds() {
  const data = await getOr("/earth/dex/v1/params", null);
  return Number(data?.params?.lp_unbonding_seconds ?? 0);
}

/**
 * Withdrawals this address has waiting, as [{ poolId, shares, completionTime }]
 * with `shares` in base units and `completionTime` in unix seconds.
 * Transparent ones only: a private withdrawal is keyed by a nullifier, not an
 * address, and never shows here.
 *
 * Between submitting a withdrawal and it landing there is nothing in the balance
 * to show for it — the shares have left and the assets have not arrived — so
 * without this the wait looks like the funds went nowhere.
 *
 * The escrowed liquidity keeps working for the pool, so the position keeps
 * earning fees and LP rewards for the whole period and is priced at maturity.
 * Nothing has to be signed to collect it; the chain sweeps it out on its own.
 */
export async function lpUnbondings(address) {
  const data = await getOr(seg`/earth/dex/v1/unbondings/${address}`, { unbondings: [] });
  return (data.unbondings ?? []).map((u) => ({
    poolId: Number(u.pool_id ?? 0),
    shares: u.shares?.amount ?? "0",
    sharesDenom: u.shares?.denom ?? lpDenom(u.pool_id ?? 0),
    completionTime: Number(u.completion_time ?? 0),
  }));
}

// --- genesis liquidity auction ---

/** Auction lifecycle, as the chain's AuctionStatus enum names it. */
export const AUCTION_PENDING = "AUCTION_STATUS_PENDING";
export const AUCTION_OPEN = "AUCTION_STATUS_OPEN";
export const AUCTION_SETTLED = "AUCTION_STATUS_SETTLED";

/**
 * The one-shot genesis liquidity auction, or null when the chain has none.
 *
 * Two thirds of the pre-mine sits on the dex module account: half is paid to
 * bidders pro rata, half is paired with everything they bid to open the pool. The
 * two halves being equal is what makes the pool open at exactly the price the
 * auction cleared at, so there is no gap to arbitrage on the first block.
 *
 * `bidDenom` is chosen by governance when the window opens rather than fixed at
 * genesis — the intended denominator is IBC USDC, which does not exist on the
 * chain until IBC is enabled — so nothing here may assume it.
 */
export async function liquidityAuction() {
  const data = await getOr("/earth/dex/v1/liquidity_auction", null);
  const a = data?.auction;
  if (!a) return null;
  return {
    status: a.status ?? "AUCTION_STATUS_UNSPECIFIED",
    bidDenom: a.bid_denom ?? "",
    endTime: Number(a.end_time ?? 0),
    erthForBidders: a.erth_for_bidders?.amount ?? "0",
    erthForPool: a.erth_for_pool?.amount ?? "0",
    totalRaised: a.total_raised ?? "0",
    poolId: Number(a.pool_id ?? 0),
    claimed: a.claimed ?? "0",
  };
}

/**
 * One bidder's cumulative contribution and what they can take right now.
 *
 * `claimable` is the chain's own pro-rata arithmetic rather than a figure
 * recomputed here — the last claimant is paid the remainder instead of a
 * truncated share, which a client dividing on its own would get wrong.
 */
export async function auctionBid(bidder) {
  const data = await getOr(seg`/earth/dex/v1/liquidity_auction/bid/${bidder}`, null);
  return {
    amount: data?.bid?.amount ?? "0",
    claimed: Boolean(data?.bid?.claimed),
    claimable: data?.claimable?.amount ?? "0",
  };
}

/**
 * Every live protocol-owned-liquidity retirement schedule, keyed by pool id.
 *
 * Protocol-owned liquidity is not permanent: the module account cannot sign a
 * MsgRemoveLiquidity, so its position is retired on a straight line instead —
 * `sharesRemaining` of `totalShares` left, finishing `durationSeconds` after
 * `startTime`. A finished schedule is deleted, so a pool with no entry holds no
 * protocol liquidity that is still being retired.
 */
export async function polBurns() {
  const data = await getOr("/earth/dex/v1/pol_burns", { pol_burns: [] });
  return (data.pol_burns ?? []).map((b) => ({
    poolId: Number(b.pool_id ?? 0),
    totalShares: b.total_shares ?? "0",
    sharesRemaining: b.shares_remaining ?? "0",
    startTime: Number(b.start_time ?? 0),
    durationSeconds: Number(b.duration_seconds ?? 0),
    burnToken: Boolean(b.burn_token),
  }));
}

/**
 * x/dex SimulateSwapExactIn: what swapping `amountIn` (base units) of
 * `denomIn` for `denomOut` pays at the current state, computed by the chain's
 * own swap (ERTH-hub routing, each pool's pending LP rewards settled into its
 * reserve first) and discarded. Resolves to { out, fee, burn } as BigInts
 * (fee in uerth over every hop, burn the half destroyed), or null when the
 * node does not serve the query or refuses the swap: callers fall back to the
 * local maths below, which cannot see pending rewards.
 */
export async function simulateSwapExactIn(amountIn, denomIn, denomOut) {
  let amount;
  try {
    amount = toBig(amountIn);
  } catch {
    return null;
  }
  if (amount <= 0n) return null;
  const q = new URLSearchParams({ offer_denom: denomIn, offer_amount: amount.toString(), ask_denom: denomOut });
  const data = await getOr(`/earth/dex/v1/simulate_swap_exact_in?${q}`, null);
  try {
    const out = BigInt(data?.token_out?.amount ?? "0");
    if (out <= 0n || data.token_out.denom !== denomOut) return null;
    return { out, fee: BigInt(data.fee?.amount ?? "0"), burn: BigInt(data.erth_burned ?? "0") };
  } catch {
    return null;
  }
}

/**
 * Quotes a swap of `amountIn` of `denomIn` into `denomOut` (base units): the
 * chain's SimulateSwapExactIn when the node serves it, else the chain's
 * integer constant-product maths over the pools' reserves. ERTH is the hub,
 * so a token->token swap is two hops through ERTH. Resolves to a BigInt (0n:
 * no quote).
 */
export async function quoteSwap(amountIn, denomIn, denomOut) {
  const sim = await simulateSwapExactIn(amountIn, denomIn, denomOut);
  if (sim) return sim.out;
  // The chain's own integer maths over the reserves (fee rounded up, taken
  // from the ERTH side of each hop), not a floating-point estimate.
  let a;
  try {
    a = toBig(amountIn);
  } catch {
    return 0n;
  }
  if (a <= 0n) return 0n;
  const [fee, all] = await Promise.all([swapFeeDec(), pools()]);
  if (fee == null) return 0n;
  const live = (p) => p && BigInt(p.erthReserve) > 0n && BigInt(p.tokenReserve) > 0n;
  const pIn = all.find((x) => x.tokenDenom === denomIn);
  const pOut = all.find((x) => x.tokenDenom === denomOut);
  let erth = a;
  if (denomIn !== UERTH) {
    if (!live(pIn)) return 0n;
    erth = exactTokenToHub(pIn.erthReserve, pIn.tokenReserve, a, fee).out;
  }
  if (denomOut === UERTH) return erth;
  if (!live(pOut) || erth <= 0n) return 0n;
  return exactHubToToken(pOut.erthReserve, pOut.tokenReserve, erth, fee).out;
}

// --- exact AMM maths (x/dex keeper/amm.go) ---
//
// These reproduce the chain's integer arithmetic exactly (BigInt, never a
// float), for quotes and for the floors taken from them.
//
// They price against the reserves the LCD shows. The chain first compounds
// any pending LP rewards into the ERTH reserve (settlePoolRewards, at every
// touch of the pool), which the pool query does not reflect, so a quote is
// exact only for a pool with nothing pending; floors take a slippage margin.

/** A cosmos LegacyDec string ("0.3", "0.300000000000000000") scaled by 1e18. */
export function parseDec18(s) {
  const m = /^(\d+)(?:\.(\d{0,18}))?$/.exec(String(s ?? "").trim());
  if (!m) throw new RangeError(`not a decimal: ${s}`);
  return BigInt(m[1]) * 10n ** 18n + BigInt((m[2] ?? "").padEnd(18, "0") || "0");
}

const toBig = (v) => {
  const x = BigInt(String(v));
  if (x < 0n) throw new RangeError("negative amount");
  return x;
};

/**
 * feeOf: LegacyDec(amount).Mul(fee).Quo(100).Ceil().TruncateInt() (chain
 * 203d3b2, audit 5 L-DX4: rounded up, so a small swap cannot pay nothing).
 * Mul is exact for an integer amount; Quo rounds half to even at 18
 * decimals; then any fraction left rounds the fee up.
 */
export function exactFee(amount, swapFee) {
  const f = typeof swapFee === "bigint" ? swapFee : parseDec18(swapFee);
  const num = toBig(amount) * f;
  let q = num / 100n;
  const r = num % 100n;
  if (2n * r > 100n || (2n * r === 100n && q % 2n === 1n)) q += 1n;
  const one = 10n ** 18n;
  return (q + one - 1n) / one;
}

/** splitFee: the burn takes the odd unit. */
const burnOf = (fee) => (fee + 1n) / 2n;

/** swapHubForToken: ERTH in, token out; the fee is taken from the input. */
export function exactHubToToken(reserveErth, reserveToken, erthIn, swapFee) {
  const [rE, rT, a] = [toBig(reserveErth), toBig(reserveToken), toBig(erthIn)];
  const fee = exactFee(a, swapFee);
  const eff = a - fee;
  const out = rE + eff > 0n ? (rT * eff) / (rE + eff) : 0n;
  return { out, fee, burn: burnOf(fee) };
}

/** swapTokenForHub: token in, ERTH out; the fee is taken from the output. */
export function exactTokenToHub(reserveErth, reserveToken, tokenIn, swapFee) {
  const [rE, rT, a] = [toBig(reserveErth), toBig(reserveToken), toBig(tokenIn)];
  const gross = rT + a > 0n ? (rE * a) / (rT + a) : 0n;
  const fee = exactFee(gross, swapFee);
  return { out: gross - fee, fee, burn: burnOf(fee) };
}

// --- messages ---

export function msgSwap(creator, denomIn, amountIn, denomOut, minAmountOut) {
  return {
    typeUrl: "/earth.dex.v1.MsgSwap",
    value: {
      creator,
      tokenIn: { denom: denomIn, amount: String(amountIn) },
      denomOut,
      minAmountOut: String(minAmountOut),
    },
  };
}

/**
 * Shares a deposit is expected to mint, in base units as an integer string.
 *
 * Mirrors the chain: shares are priced against the reserves as they stand when
 * the message executes, and the deposit is taken in the pool ratio, so the
 * lesser of the two sides is what gets minted —
 * `min(erthIn * total / reserveErth, tokenIn * total / reserveToken)`, floored.
 *
 * Every argument is a base-unit integer (string, number or bigint), and the
 * arithmetic is done on BigInt so nothing is lost to floating point. Returns
 * "0" when there is nothing to price against — no shares outstanding, an empty
 * reserve, or an argument that is not an integer — and a caller must read that
 * as "no floor can be set", never as a floor of zero.
 */
export function quoteAddLiquidity(erthIn, tokenIn, erthReserve, tokenReserve, totalShares) {
  let e, t, rE, rT, total;
  try {
    [e, t, rE, rT, total] = [erthIn, tokenIn, erthReserve, tokenReserve, totalShares].map(
      (v) => BigInt(String(v ?? "")),
    );
  } catch {
    return "0";
  }
  if (e <= 0n || t <= 0n || rE <= 0n || rT <= 0n || total <= 0n) return "0";
  const byErth = (e * total) / rE;
  const byToken = (t * total) / rT;
  return (byErth < byToken ? byErth : byToken).toString();
}

/**
 * A deposit's other leg for `amount` of one side, against that side's reserve
 * `from` and the other's `to`: ceil(amount * to / from), as an integer string.
 *
 * x/dex mints shares = min(floor(in_e * S / R_e), floor(in_t * S / R_t)) and
 * pulls each leg rounded UP, ceil(shares * R / S) (audit 4, C2). A leg rounded
 * up here never makes the other side the binding one, so the typed side buys
 * every share it can and the pull never exceeds either leg. "0" for an empty
 * pool or anything that is not an integer.
 */
export function depositLeg(amount, from, to) {
  let a, f, t;
  try {
    [a, f, t] = [amount, from, to].map((v) => BigInt(String(v ?? "")));
  } catch {
    return "0";
  }
  if (a <= 0n || f <= 0n || t < 0n) return "0";
  return ((a * t + f - 1n) / f).toString();
}

/**
 * What x/dex mints and pulls for a deposit of `erthIn` and `tokenIn` into
 * reserves (`re`, `rt`) with `supply` shares out: { shares, erth, token } as
 * BigInt, each leg ceil(shares * R / S); null when it mints nothing
 * (ErrZeroShares) or the pool cannot price it.
 */
export function depositPull(erthIn, tokenIn, re, rt, supply) {
  let e, t, rE, rT, s;
  try {
    [e, t, rE, rT, s] = [erthIn, tokenIn, re, rt, supply].map((v) => BigInt(String(v ?? "")));
  } catch {
    return null;
  }
  if (s <= 0n || rE <= 0n || rT <= 0n || e < 0n || t < 0n) return null;
  const byE = (e * s) / rE;
  const byT = (t * s) / rT;
  const shares = byE < byT ? byE : byT;
  if (shares <= 0n) return null;
  const up = (r) => (shares * r + s - 1n) / s;
  const erth = up(rE);
  const token = up(rT);
  if (erth > e || token > t) return null;
  return { shares, erth, token };
}

/** x/dex ErrPoolCap (codespace dex, code 1120): a reserve, share supply or input past 2^120. */
export const POOL_CAP = 1n << 120n;

/**
 * @param minShares base-unit floor on the shares minted, as a string. Sending
 *   "" is no floor — which is what this did before the field existed, and what
 *   left every deposit open to being sandwiched: a trade landing between
 *   signing and execution moves the ratio the shares are priced at, and the
 *   deposit takes whatever it lands on. `MsgSwap` has always had
 *   `min_amount_out` for the same reason.
 */
export function msgAddLiquidity(creator, poolId, denomA, amountA, denomB, amountB, minShares = "") {
  return {
    typeUrl: "/earth.dex.v1.MsgAddLiquidity",
    value: {
      creator,
      poolId: Number(poolId),
      amountA: { denom: denomA, amount: String(amountA) },
      amountB: { denom: denomB, amount: String(amountB) },
      minShares: String(minShares),
    },
  };
}

/**
 * Starts a withdrawal of `shares` (base units) from `poolId`. For the ANML
 * pool the chain pays the ANML leg as a note and requires `pc` (refusing it
 * on any other pool); use removeLiquidityToShielded there.
 */
export function msgRemoveLiquidity(creator, poolId, shares, pc = new Uint8Array(0), ciphertext = new Uint8Array(0)) {
  // With pc (the ANML pool) the chain requires a 32-byte pc and the 177-byte
  // v2 ciphertext; without, neither. A pc of any other length is refused
  // here rather than signed into a tx the chain rejects.
  if (!(pc instanceof Uint8Array)) throw new TypeError("pc must be bytes");
  if (pc.length) {
    if (pc.length !== 32) throw new RangeError("pc must be 32 bytes");
    checkBlindCiphertext(ciphertext);
  } else if (ciphertext.length) throw new RangeError("a ciphertext without a pc");
  return {
    typeUrl: "/earth.dex.v1.MsgRemoveLiquidity",
    value: {
      creator,
      poolId: Number(poolId),
      shares: { denom: lpDenom(poolId), amount: String(shares) },
      pc,
      ciphertext,
    },
  };
}

/** The most one withdrawal pays as notes per leg: 32 notes of 2^63 - 1 (x/dex maxWithdrawalNoteLeg, MaxSplitNotes / 4). */
export const MAX_WITHDRAWAL_NOTE_LEG = ((1n << 63n) - 1n) * 32n;

/**
 * Why x/dex would refuse to start a withdrawal of `shares` whose token leg
 * is paid as notes (the ANML pool), or null: at the pool as it stands, a
 * leg of floor(shares * reserve / supply) above MAX_WITHDRAWAL_NOTE_LEG is
 * refused at start (chain 203d3b2, checkWithdrawalNoteLegs). A leg past a
 * note's u64 is otherwise paid as several notes at maturity.
 */
export function withdrawalNoteLegProblem(shares, tokenReserve, totalShares) {
  let s, r, t;
  try {
    [s, r, t] = [shares, tokenReserve, totalShares].map((v) => BigInt(String(v)));
  } catch {
    return null;
  }
  if (t <= 0n || s < 0n || r < 0n) return null;
  return (s * r) / t > MAX_WITHDRAWAL_NOTE_LEG
    ? "This withdrawal's ANML leg is more than one withdrawal can pay as notes (16 notes of 2^64 - 1 units). Withdraw in smaller parts."
    : null;
}

/**
 * MsgRemoveLiquidity for the ANML pool: the ERTH leg is paid to `creator`,
 * the ANML leg as a note to the shielded `address`. The payout is priced
 * when the escrow matures, so the note carries the value-blind (v2)
 * ciphertext; the owner's wallet completes it from the amount the chain
 * publishes then. A leg past a note's u64 is paid as several notes, all to
 * this one pc and ciphertext at their own positions, each with its own
 * public amount (chain 203d3b2, MintNoteSplit). Note: a second withdrawal from the same pool in the same
 * block must name the same pc, so it is refused — submit them apart.
 */
export function removeLiquidityToShielded(creator, poolId, shares, address, { memo = "" } = {}) {
  const { pc, ciphertext } = blindNotePayment(address, { memo });
  return msgRemoveLiquidity(creator, poolId, shares, pc, ciphertext);
}

/**
 * MsgBuyAnml: `amountIn` of `denomIn` (ERTH, or any token with a pool, routed
 * through ERTH) from `creator`, swapped for ANML that is minted as a note to
 * `pc`. ANML never sits in an account, so this is how an ERTH holder buys it.
 * Use buyAnmlTo to pay a shielded address.
 */
export function msgBuyAnml(creator, denomIn, amountIn, minAmountOut, pc, ciphertext) {
  checkBlindCiphertext(ciphertext);
  return {
    typeUrl: "/earth.dex.v1.MsgBuyAnml",
    value: {
      creator,
      tokenIn: { denom: denomIn, amount: String(amountIn) },
      minAmountOut: String(minAmountOut),
      pc,
      ciphertext,
    },
  };
}

/**
 * Buys ANML with `erthIn` uerth for the shielded `address`. The output is
 * whatever the pool pays when the msg runs (at least `minOut`), so the note
 * carries the value-blind (v2) ciphertext and the recipient's wallet takes
 * the value from the chain's mint event.
 */
export function buyAnmlTo(creator, address, erthIn, minOut, { memo = "" } = {}) {
  const { pc, ciphertext } = blindNotePayment(address, { memo });
  return msgBuyAnml(creator, UERTH, erthIn, minOut, pc, ciphertext);
}

/**
 * Exact ANML out for `erthIn` uerth (a BigInt; 0n when there is no pool):
 * the chain's SimulateSwapExactIn when the node serves it, else the integer
 * AMM over the ANML pool as the LCD shows it. Pending LP rewards compound
 * into the ERTH reserve first on chain, which only the simulation sees and
 * which can only lower the real output; either way take the floor with a
 * slippage tolerance (tokens.minimumReceived).
 */
export async function quoteBuyAnml(erthIn) {
  const sim = await simulateSwapExactIn(erthIn, UERTH, UANML);
  if (sim) return sim.out;
  const [p, fee] = await Promise.all([poolForToken(UANML), swapFeeDec()]);
  if (!p || fee === null) return 0n;
  return exactHubToToken(p.erthReserve, p.tokenReserve, erthIn, fee).out;
}

// How long a buy-ANML quote may back a signature. Older, it is re-asked.
export const QUOTE_TTL_MS = 20_000;

/**
 * A buy-ANML quote bound to what it was computed for: { micro, out, at }.
 * Built only from quoteBuyAnml's answer for exactly `micro`.
 */
export async function boundBuyAnmlQuote(micro, now = Date.now) {
  const out = await quoteBuyAnml(micro);
  return { micro: String(micro), out, at: now() };
}

/**
 * The minimum ANML a purchase of `micro` uerth may sign for, from `quote`:
 * "0" (nothing may be signed) unless the quote was computed for exactly this
 * amount, is positive, and is younger than QUOTE_TTL_MS. A quote for an
 * earlier amount (a slow or hung quote request after the amount changed, the
 * audit-4 stale-quote finding) never becomes another amount's floor.
 */
export function buyAnmlFloor(quote, micro, slippage, now = Date.now()) {
  if (!quote || quote.micro !== String(micro) || typeof quote.out !== "bigint" || quote.out <= 0n) return "0";
  if (!(now - quote.at >= 0 && now - quote.at <= QUOTE_TTL_MS)) return "0";
  return minimumReceived(quote.out.toString(), slippage);
}

/**
 * The min_shares floor for depositing (erthMicro, tokenMicro) into `poolId`,
 * priced against reserves and share supply read now, not the ones a page
 * loaded earlier (which a trade, a compounding or another deposit has since
 * moved). "0" when either read fails: the caller refuses rather than send an
 * unprotected deposit.
 */
export async function addLiquidityFloor(poolId, erthMicro, tokenMicro, slippagePercent) {
  const [p, total] = await Promise.all([pool(poolId), supplyOrNull(lpDenom(poolId))]);
  if (!p || total === null) return "0";
  const expected = BigInt(quoteAddLiquidity(erthMicro, tokenMicro, p.erthReserve, p.tokenReserve, total));
  return ((expected * BigInt(100 - slippagePercent)) / 100n).toString();
}

/** Bids are additive and cannot be withdrawn — this adds to any earlier bid. */
export function msgBidLiquidityAuction(bidder, denom, amount) {
  return {
    typeUrl: "/earth.dex.v1.MsgBidLiquidityAuction",
    value: { bidder, amount: { denom, amount: String(amount) } },
  };
}

/** Takes this bidder's whole share of the bidder earmark. Once only. */
export function msgClaimLiquidityAuction(bidder) {
  return {
    typeUrl: "/earth.dex.v1.MsgClaimLiquidityAuction",
    value: { bidder },
  };
}
