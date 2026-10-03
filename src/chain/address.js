import { fromBech32, toBech32 } from "@cosmjs/encoding";
import { ADDRESS_PREFIX } from "./config";

/**
 * The canonical (lowercase) encoding of a transparent bech32 address, or null
 * when `input` is not a valid address under `prefix` (default earth).
 *
 * The chain refuses any other spelling of an address it binds: a passport
 * proof binds the affiliate's bytes, and an address keyed state (referrers,
 * accounts) is stored under its canonical string. bech32 itself allows an
 * all-uppercase spelling of the same bytes, so input is decoded and
 * re-encoded rather than trusted as typed. Mixed case is invalid bech32.
 */
export function canonicalAddress(input, prefix = ADDRESS_PREFIX) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  try {
    const { prefix: hrp, data } = fromBech32(s, 90);
    if (hrp !== prefix) return null;
    return toBech32(prefix, data, 90);
  } catch {
    return null;
  }
}
