import { getOr } from "./rest";
import { UERTH, lpDenom } from "./config";

/**
 * x/dex — a spoke-and-wheel AMM hubbed on ERTH. Every pool pairs ERTH (the hub)
 * with one spoke token, so any token can be routed to any other through ERTH.
 * LP shares are the ordinary bank denom `dexlp/{poolId}`.
 */

/** All pools: { id, erthReserve, tokenDenom, tokenReserve, volume }. */
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
    volume: p.volume ?? "0",
    // Needed to reapply the chain's daily decay client-side — see chain/apr.js.
    lastVolumeDay: Number(p.last_volume_day ?? 0),
  };
}

/** Swap fee as a percent number (e.g. 0.3 for 0.3%). */
export async function swapFeePercent() {
  const data = await getOr("/earth/dex/v1/params", null);
  return Number(data?.params?.swap_fee ?? 0);
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
