import { getOr } from "./rest";
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
  const data = await getOr(`/earth/dex/v1/pool/${poolId}`, null);
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
  const data = await getOr(`/earth/dex/v1/unbondings/${address}`, { unbondings: [] });
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
  const data = await getOr(`/earth/dex/v1/liquidity_auction/bid/${bidder}`, null);
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

export function msgAddLiquidity(creator, poolId, denomA, amountA, denomB, amountB) {
  return {
    typeUrl: "/earth.dex.v1.MsgAddLiquidity",
    value: {
      creator,
      poolId: Number(poolId),
      amountA: { denom: denomA, amount: String(amountA) },
      amountB: { denom: denomB, amount: String(amountB) },
    },
  };
}

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
