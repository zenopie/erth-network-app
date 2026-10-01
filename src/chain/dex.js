import { getOr, seg } from "./rest";
import { UERTH, lpDenom } from "./config";

/**
 * x/dex — a spoke-and-wheel AMM hubbed on ERTH. Every pool pairs ERTH (the hub)
 * with one spoke token, so any token can be routed to any other through ERTH.
 * LP shares are the ordinary bank denom `dexlp/{poolId}`.
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

/** How long withdrawn LP shares are escrowed before they pay out, in seconds. */
export async function lpUnbondingSeconds() {
  const data = await getOr("/earth/dex/v1/params", null);
  return Number(data?.params?.lp_unbonding_seconds ?? 0);
}

/**
 * Withdrawals this address has waiting, as [{ poolId, shares, completionTime }]
 * with `shares` in base units and `completionTime` in unix seconds.
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
 * Constant-product output for one hop, net of the swap fee.
 * Mirrors the chain's AMM so the UI can quote before broadcasting.
 */
export function quoteHop(amountIn, reserveIn, reserveOut, feePercent) {
  const aIn = Number(amountIn);
  const rIn = Number(reserveIn);
  const rOut = Number(reserveOut);
  if (!aIn || !rIn || !rOut) return 0;
  const afterFee = aIn * (1 - feePercent / 100);
  return (afterFee * rOut) / (rIn + afterFee);
}

/**
 * Quotes a swap of `amountIn` of `denomIn` into `denomOut` (base units).
 * ERTH is the hub, so a token->token swap is two hops through ERTH.
 */
export async function quoteSwap(amountIn, denomIn, denomOut) {
  const fee = await swapFeePercent();
  const all = await pools();

  if (denomIn === UERTH) {
    const p = all.find((x) => x.tokenDenom === denomOut);
    return p ? quoteHop(amountIn, p.erthReserve, p.tokenReserve, fee) : 0;
  }
  if (denomOut === UERTH) {
    const p = all.find((x) => x.tokenDenom === denomIn);
    return p ? quoteHop(amountIn, p.tokenReserve, p.erthReserve, fee) : 0;
  }
  const pIn = all.find((x) => x.tokenDenom === denomIn);
  const pOut = all.find((x) => x.tokenDenom === denomOut);
  if (!pIn || !pOut) return 0;
  const erthOut = quoteHop(amountIn, pIn.tokenReserve, pIn.erthReserve, fee);
  return quoteHop(erthOut, pOut.erthReserve, pOut.tokenReserve, fee);
}

// --- exact AMM maths (x/dex keeper/amm.go) ---
//
// quoteHop above is floating point, fine for a display and for a floor taken
// with slippage. These reproduce the chain's integer arithmetic exactly, for
// anything that must name the very amount the chain will pay.
//
// They price against the reserves the LCD shows. The chain first compounds
// any pending LP rewards into the ERTH reserve (settlePoolRewards, at every
// touch of the pool), which the pool query does not reflect, so an exact
// quote is exact only for a pool with nothing pending.

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
 * feeOf: LegacyDec(amount).Mul(fee).Quo(100).TruncateInt(). Mul is exact for
 * an integer amount; Quo rounds half to even at 18 decimals; then truncate.
 */
export function exactFee(amount, swapFee) {
  const f = typeof swapFee === "bigint" ? swapFee : parseDec18(swapFee);
  const num = toBig(amount) * f;
  let q = num / 100n;
  const r = num % 100n;
  if (2n * r > 100n || (2n * r === 100n && q % 2n === 1n)) q += 1n;
  return q / 10n ** 18n;
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
 * Transparent pools only. Withdrawing from the ANML pool pays the ANML leg as
 * a note, so the chain requires `pc` there (and refuses it elsewhere), and
 * the note's value is only known at maturity — TODO(dex-notes), see
 * msgBuyAnml for why the web cannot name a findable pc for it yet.
 */
export function msgRemoveLiquidity(creator, poolId, shares) {
  return {
    typeUrl: "/earth.dex.v1.MsgRemoveLiquidity",
    value: {
      creator,
      poolId: Number(poolId),
      shares: { denom: lpDenom(poolId), amount: String(shares) },
    },
  };
}

/**
 * MsgBuyAnml: `amountIn` of `denomIn` (ERTH, or any token with a pool, routed
 * through ERTH) from `creator`, swapped for ANML that is minted as a note to
 * `pc`. ANML never sits in an account, so this is how an ERTH holder buys it.
 *
 * TODO(dex-notes): no page offers this. It needs a note the recipient's
 * wallet can find, and a web signer cannot make one with today's formats: the chain decides the note's value when
 * the msg runs (the swap output; a withdrawal is priced at maturity), the
 * canonical ciphertext's key is bound to cm and so to that exact value, and
 * an empty-ciphertext note is only found by its owner if pc is one of their
 * self-mint pcs, which needs nk. An exact min_amount_out does not rescue it:
 * the chain compounds pending LP rewards into the ERTH reserve before pricing
 * (the LCD's reserves omit them), so an exact quote fails whenever rewards are pending, and a
 * favourable move in between pays more than was encrypted — a note nobody
 * can find. Unblock with either (a) the app exporting a one-time self-mint pc
 * (a "receive an unknown amount" code; its sync already matches self-mint pcs
 * by public amount), sent here with an empty ciphertext, or (b) a chain
 * change making the minted amount exact (an exact-out MsgBuyAnml refunding
 * unused input). Withdrawals need (a).
 */
export function msgBuyAnml(creator, denomIn, amountIn, minAmountOut, pc, ciphertext = new Uint8Array(0)) {
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
