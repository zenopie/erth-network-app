import { bech32m } from "@scure/base";
import { x25519 } from "@noble/curves/ed25519.js";
import { fieldFromBytes, fieldToBytes } from "./privacy";

/**
 * Shielded addresses, as the chain's zk/privacy/address.go defines them:
 *
 *   bech32m(hrp "erthz", 8-to-5-bit(0x01 || owner_pk (32, BE) || ek_pub (32)))
 *
 * 65 payload bytes, always 116 characters. BIP-173's 90-character cap is not
 * applied (as with Zcash unified addresses); the limit passed to the decoder
 * is the address's exact length instead, so nothing longer is ever parsed.
 * owner_pk is what a note's pc commits to; ek_pub is the X25519 key its
 * ciphertext is encrypted to. The Earth Wallet app shows the address on its
 * Receive screen.
 */

export const SHIELDED_HRP = "erthz";
export const SHIELDED_VERSION = 0x01;
export const SHIELDED_ADDRESS_LENGTH = 116;

/** The canonical text form of { ownerPk: bigint, ekPub: Uint8Array(32) }. */
export function encodeShieldedAddress({ ownerPk, ekPub }) {
  if (!(ekPub instanceof Uint8Array) || ekPub.length !== 32) throw new RangeError("ek_pub is not 32 bytes");
  const payload = new Uint8Array(65);
  payload[0] = SHIELDED_VERSION;
  payload.set(fieldToBytes(ownerPk), 1);
  payload.set(ekPub, 33);
  return bech32m.encode(SHIELDED_HRP, bech32m.toWords(payload), SHIELDED_ADDRESS_LENGTH);
}

/**
 * Parses a shielded address: hrp "erthz", a valid bech32m checksum (a
 * bech32/BIP-173 checksum is refused), one case, version 0x01, exactly 65
 * payload bytes with zero padding bits, owner_pk below the BN254
 * modulus, and an ek_pub that is not a low-order X25519 point. Surrounding whitespace is ignored. Throws an Error whose message
 * is fit to show.
 */
export function decodeShieldedAddress(input) {
  const s = String(input ?? "").trim();
  if (/^earth1/i.test(s)) {
    throw new Error("That is a transparent earth1… address. Paste the shielded erthz1… address from the Earth Wallet app.");
  }
  if (!/^erthz1/i.test(s)) throw new Error("A shielded address starts with erthz1.");
  if (s.length !== SHIELDED_ADDRESS_LENGTH) {
    throw new Error(`A shielded address is ${SHIELDED_ADDRESS_LENGTH} characters; this is ${s.length}.`);
  }
  let prefix, words;
  try {
    ({ prefix, words } = bech32m.decode(s, SHIELDED_ADDRESS_LENGTH));
  } catch {
    throw new Error("Not a valid shielded address (checksum or character error). Copy it again from the app.");
  }
  if (prefix !== SHIELDED_HRP) throw new Error("A shielded address starts with erthz1.");
  let payload;
  try {
    payload = bech32m.fromWords(words);
  } catch {
    throw new Error("Not a valid shielded address (bad padding).");
  }
  if (payload.length !== 65) throw new Error("Not a valid shielded address (wrong length).");
  if (payload[0] !== SHIELDED_VERSION) {
    throw new Error(`Unsupported shielded address version ${payload[0]}. Update this page or the app.`);
  }
  let ownerPk;
  try {
    ownerPk = fieldFromBytes(payload.slice(1, 33));
  } catch {
    throw new Error("Not a valid shielded address (owner key out of range).");
  }
  const ekPub = payload.slice(33, 65);
  if (!isUsableEkPub(ekPub)) {
    throw new Error("Not a valid shielded address (its encryption key is a low-order point; nothing sent to it could be read).");
  }
  return { ownerPk, ekPub };
}

// A clamped X25519 scalar is a multiple of the cofactor 8, so ANY such scalar
// times a small-order point (all-zero, u=1, and the other members of the
// order-8 subgroup, canonical or not) is the all-zero shared secret. One fixed
// scalar therefore decides it: an address whose ek_pub fails this is refused
// at decode, before a payment to it is even offered (seal() refuses it again).
const PROBE_SCALAR = new Uint8Array(32).map((_, i) => i + 1);
function isUsableEkPub(ekPub) {
  try {
    return !x25519.getSharedSecret(PROBE_SCALAR, ekPub).every((b) => b === 0);
  } catch {
    return false;
  }
}

/** True iff `s` decodes. */
export function isShieldedAddress(s) {
  try {
    decodeShieldedAddress(s);
    return true;
  } catch {
    return false;
  }
}
