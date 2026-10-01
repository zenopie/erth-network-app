import { fromBase64, toHex } from "@cosmjs/encoding";

/**
 * Byte fields come off the LCD as base64 (grpc-gateway's JSON for `bytes`),
 * while the chain's own query paths and every explorer convention want hex.
 */
export function b64ToHex(b64) {
  if (!b64) return "";
  try {
    return toHex(fromBase64(b64));
  } catch {
    return "";
  }
}

/** True when every byte of a base64 field is zero (or it is empty). */
export function isZeroB64(b64) {
  if (!b64) return true;
  try {
    return fromBase64(b64).every((b) => b === 0);
  } catch {
    return true;
  }
}

/**
 * The ISO 3166-1 alpha-2 code inside a zk/privacy.CountryField element: a
 * 32-byte big-endian field whose last two bytes are the code in ASCII ("DE" =
 * 0x4445). Zero means none. Returns "" for none or anything unparseable.
 */
export function countryFromField(b64) {
  if (isZeroB64(b64)) return "";
  try {
    const b = fromBase64(b64);
    const code = String.fromCharCode(b[b.length - 2], b[b.length - 1]);
    return /^[A-Z]{2}$/.test(code) ? code : "";
  } catch {
    return "";
  }
}

/** A hex string with an optional 0x, lowercased, or null if it is not hex. */
export function normalizeHex(s) {
  const h = String(s ?? "").trim().replace(/^0x/i, "").toLowerCase();
  return /^[0-9a-f]+$/.test(h) && h.length % 2 === 0 ? h : null;
}
