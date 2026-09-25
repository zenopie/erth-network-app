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
  uusdc: { symbol: "USDC", decimals: 6, logo: "/images/coin/USDC.png" },
  uatom: { symbol: "ATOM", decimals: 6, logo: "/images/coin/ATOM.png" },
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

/**
 * Display units (ERTH) -> base units (uerth), as an integer string.
 *
 * Parsed as a decimal string rather than through parseFloat: `0.29 * 1e6` is
 * 289999.99999999994 in floating point, so the float route floored a typed 0.29
 * to 289999 — one base unit short, and further out past 2^53. Digits beyond the
 * denom's decimals are truncated. Anything that is not a plain non-negative
 * decimal (a sign, an exponent, stray text) is "0", which every caller already
 * treats as nothing entered.
 */
export function toMicro(amount, denom) {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(String(amount ?? "").trim());
  if (!m || (m[1] === "" && !m[2])) return "0";
  const d = decimalsOf(denom);
  const frac = (m[2] ?? "").slice(0, d).padEnd(d, "0");
  return BigInt((m[1] || "0") + frac).toString();
}

/**
 * Base units -> an exact display-unit decimal string, trailing zeros dropped.
 * The inverse of toMicro, for anything that is fed back into an input (a Max
 * button) where toMacro's float could come back a unit off.
 */
export function formatUnits(amount, denom) {
  let v;
  try {
    v = BigInt(String(amount ?? "0"));
  } catch {
    return "0";
  }
  if (v < 0n) return "0";
  const d = decimalsOf(denom);
  const s = v.toString().padStart(d + 1, "0");
  const frac = s.slice(s.length - d).replace(/0+$/, "");
  return s.slice(0, s.length - d) + (frac ? "." + frac : "");
}

/** Slippage tolerance bounds, in percent. The input's own min/max are advisory. */
export const SLIPPAGE_MIN = 0.1;
export const SLIPPAGE_MAX = 50;
export const SLIPPAGE_DEFAULT = 1;

/**
 * A slippage tolerance forced into [SLIPPAGE_MIN, SLIPPAGE_MAX]. Blank or
 * unparseable is the default, not zero — and never above the max, where a
 * typed 100 (or 150) used to turn the swap's floor into zero or a negative.
 */
export function clampSlippage(percent) {
  const n = parseFloat(percent);
  if (!Number.isFinite(n)) return SLIPPAGE_DEFAULT;
  return Math.min(SLIPPAGE_MAX, Math.max(SLIPPAGE_MIN, n));
}

/**
 * Minimum acceptable output for a swap, in base units as an integer string.
 *
 * `outputMicro` is the quoted output in base units. The tolerance is clamped and
 * applied in whole basis points on integers, so the floor is exact and rounds
 * down only once.
 */
export function minimumReceived(outputMicro, slippagePercent) {
  let out;
  try {
    out = BigInt(String(outputMicro ?? "0"));
  } catch {
    return "0";
  }
  if (out <= 0n) return "0";
  const bps = BigInt(Math.round(clampSlippage(slippagePercent) * 100));
  return ((out * (10000n - bps)) / 10000n).toString();
}
