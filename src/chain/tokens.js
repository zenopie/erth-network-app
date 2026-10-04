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
 * Metadata for any denom.
 *
 * Only denoms whose decimals the app knows (TOKENS, and the dex's own LP
 * shares) are `known`. Anything else (a new pool's token, an IBC asset) is
 * shown as the chain holds it: raw base units under the raw denom, decimals 0,
 * the way Keplr shows it. An amount can never be entered for it (toMicro
 * refuses it): guessing 6 decimals would sign an 18-decimal asset 10^12 off.
 */
export function tokenInfo(denom) {
  if (TOKENS[denom]) return { denom, ...TOKENS[denom], known: true };
  if (typeof denom === "string" && /^dexlp\/\d+$/.test(denom)) {
    return { denom, symbol: `LP #${denom.slice("dexlp/".length)}`, decimals: 6, logo: null, known: true };
  }
  return { denom, symbol: String(denom ?? "?"), decimals: 0, logo: null, known: false };
}

export const symbolOf = (denom) => tokenInfo(denom).symbol;
export const decimalsOf = (denom) => tokenInfo(denom).decimals;
/** Whether the app knows `denom`'s decimals, so an amount of it can be entered and signed. */
export const isKnownDenom = (denom) => tokenInfo(denom).known;

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
 * to 289999 — one base unit short, and further out past 2^53. Non-zero digits
 * beyond the denom's decimals are refused ("0"), not truncated: the amount
 * typed is never silently signed as a smaller one (amountNote says why).
 * Trailing zeros past them are harmless. Anything that is not a plain
 * non-negative decimal (a sign, an exponent, stray text), and any amount of a denom whose
 * decimals the app does not know, is "0", which every caller already treats
 * as nothing entered.
 */
export function toMicro(amount, denom) {
  if (!isKnownDenom(denom)) return "0";
  const m = /^(\d*)(?:\.(\d*))?$/.exec(String(amount ?? "").trim());
  if (!m || (m[1] === "" && !m[2])) return "0";
  const d = decimalsOf(denom);
  if (/[1-9]/.test((m[2] ?? "").slice(d))) return "0";
  const frac = (m[2] ?? "").slice(0, d).padEnd(d, "0");
  return BigInt((m[1] || "0") + frac).toString();
}

/**
 * Why a typed amount cannot be used, for the user to read next to the field,
 * or "" when there is nothing to say (empty, or fine). Today: more decimal
 * places than the denom has, which toMicro refuses.
 */
export function amountNote(typed, denom) {
  const m = /^\d*\.(\d*)$/.exec(String(typed ?? "").trim());
  if (!m || !isKnownDenom(denom)) return "";
  const d = decimalsOf(denom);
  if (!/[1-9]/.test(m[1].slice(d))) return "";
  return `${symbolOf(denom)} has at most ${d} decimal places; remove the extra digits.`;
}

/**
 * Whether a typed amount is positive and, given `maxBase` (base units), within
 * it: decided on toMicro's result, exactly what will be signed. parseFloat
 * accepted "1e3" (and a browser-normalised number input) and enabled a button
 * that then signed 0.
 */
export function amountOk(typed, denom, maxBase) {
  const v = BigInt(toMicro(typed, denom));
  return v > 0n && (maxBase === undefined || v <= toBigInt(maxBase));
}

/** A typed amount as a float, for estimates only: the amount toMicro will sign, so the estimate is of that. */
export function typedFloat(typed, denom) {
  return toMacro(toMicro(typed, denom), denom);
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

// --- exact integer math for chain amounts and weights --------------------
//
// Chain amounts and Groundworks weights arrive as decimal strings of any size
// (a weight is rate x derth, so it outgrows 2^53 long before an amount
// does). Number() rounds them silently; these stay in BigInt until the one
// step that has to produce a float or a display string.

/** A non-negative integer (decimal string, bigint or safe integer) as a BigInt; anything else 0n. */
export function toBigInt(v) {
  if (typeof v === "bigint") return v < 0n ? 0n : v;
  if (typeof v === "number" && !Number.isSafeInteger(v)) return 0n;
  const s = String(v ?? "").trim();
  if (!/^\d+$/.test(s)) return 0n;
  return BigInt(s);
}

/** The sum of integer strings, exactly. */
export function sumBig(values) {
  let t = 0n;
  for (const v of values) t += toBigInt(v);
  return t;
}

/** Sort comparator for integer strings, largest first. */
export function byBigDesc(a, b) {
  const x = toBigInt(a), y = toBigInt(b);
  return x > y ? -1 : x < y ? 1 : 0;
}

/**
 * part / total x 100 as a decimal string with `digits` places, rounded half
 * up, computed exactly; null when total is 0.
 */
export function percentString(part, total, digits = 1) {
  const p = toBigInt(part), t = toBigInt(total);
  if (t === 0n) return null;
  const scale = 10n ** BigInt(digits);
  const q = (p * 100n * scale * 2n + t) / (2n * t);
  if (!digits) return q.toString();
  const s = q.toString().padStart(digits + 1, "0");
  return `${s.slice(0, -digits)}.${s.slice(-digits)}`;
}

/** part / total as a float, the division done exactly and rounded once; 0 when total is 0. */
export function ratio(part, total) {
  const t = toBigInt(total);
  if (t === 0n) return 0;
  const SCALE = 10n ** 15n;
  return Number((toBigInt(part) * SCALE) / t) / 1e15;
}

let decimalSeparator;
function decimalSep() {
  if (decimalSeparator === undefined) {
    try {
      decimalSeparator = new Intl.NumberFormat().formatToParts(1.1).find((x) => x.type === "decimal")?.value ?? ".";
    } catch {
      decimalSeparator = ".";
    }
  }
  return decimalSeparator;
}

/**
 * Base units as a grouped display-unit string, exact at any size: the integer
 * part is a BigInt, the fraction is truncated to `maxFraction` digits (what
 * Number#toLocaleString shows by default).
 */
export function formatMacro(amount, denom, maxFraction = 3) {
  const [i, f = ""] = formatUnits(toBigInt(amount).toString(), denom).split(".");
  const frac = f.slice(0, maxFraction).replace(/0+$/, "");
  const int = BigInt(i).toLocaleString();
  return frac ? `${int}${decimalSep()}${frac}` : int;
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
