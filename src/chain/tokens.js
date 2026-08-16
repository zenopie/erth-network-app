import { UANML, UERTH } from "./config";

/**
 * Token metadata keyed by bank denom.
 *
 * On Secret these were SNIP-20 contracts that had to be looked up in an
 * on-chain registry and unlocked with a viewing key. On earth they are plain
 * bank denoms, so this is static display metadata and nothing more.
 */
export const TOKENS = {
  [UERTH]: { symbol: "ERTH", decimals: 6, logo: "/images/coin/ERTH.png" },
  [UANML]: { symbol: "ANML", decimals: 6, logo: "/images/coin/ANML.png" },
  uusdc: { symbol: "USDC", decimals: 6, logo: "/images/coin/USDC.png", coingeckoId: "usd-coin" },
  uatom: { symbol: "ATOM", decimals: 6, logo: "/images/coin/ATOM.png", coingeckoId: "cosmos" },
};

/**
 * Metadata for any denom. Unknown denoms (new dex pools, LP shares) still
 * render sensibly rather than breaking the UI.
 */
export function tokenInfo(denom) {
  if (TOKENS[denom]) return { denom, ...TOKENS[denom] };
  if (denom?.startsWith("dexlp/")) {
    return { denom, symbol: `LP #${denom.slice("dexlp/".length)}`, decimals: 6, logo: null };
  }
  // Convention: a "u"-prefixed micro denom, e.g. ufoo -> FOO.
  const symbol = denom?.startsWith("u") ? denom.slice(1).toUpperCase() : (denom ?? "?");
  return { denom, symbol, decimals: 6, logo: null };
}

export const symbolOf = (denom) => tokenInfo(denom).symbol;
export const decimalsOf = (denom) => tokenInfo(denom).decimals;

/** Base units (uerth) -> display units (ERTH). */
export function toMacro(amount, denom) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return n / 10 ** decimalsOf(denom);
}

/** Display units (ERTH) -> base units (uerth), floored to an integer. */
export function toMicro(amount, denom) {
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n * 10 ** decimalsOf(denom));
}

/** Minimum acceptable output for a swap given a slippage tolerance in percent. */
export function minimumReceived(outputAmount, slippagePercent) {
  const n = parseFloat(outputAmount);
  if (!Number.isFinite(n)) return 0;
  return (n * (100 - slippagePercent)) / 100;
}
