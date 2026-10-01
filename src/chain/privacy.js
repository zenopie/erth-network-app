import { P, poseidon2 } from "./poseidon2";

/**
 * The domain-tagged Poseidon2 derivations of the chain's zk/privacy, as far
 * as a sender needs them: a note's asset id, its owner commitment `pc` and
 * its commitment `cm`. Field elements are BigInts below P; on the wire they
 * are 32 bytes big-endian, and a 32-byte string at or above P is refused,
 * never reduced (the chain's FieldFromBytes does the same).
 */

export { P };

const tag = (s) => BigInt("0x" + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join(""));

// Tags are ASCII read big-endian ("earth.pc" -> 0x65617274682e7063).
export const TAG_OWNER = tag("earth.owner");
export const TAG_PC = tag("earth.pc");
export const TAG_CM = tag("earth.cm");
export const TAG_ASSET = tag("earth.asset");

/** Poseidon2 over the given elements (the circuits' Poseidon2::hash). */
export const H = (...xs) => poseidon2(xs);

const U64_MAX = (1n << 64n) - 1n;

/** A note value: a non-negative integer below 2^64, as a BigInt. */
export function u64(v) {
  const x = typeof v === "bigint" ? v : BigInt(String(v));
  if (x < 0n || x > U64_MAX) throw new RangeError("value does not fit in a u64");
  return x;
}

/** e as 32 big-endian bytes. */
export function fieldToBytes(e) {
  if (typeof e !== "bigint" || e < 0n || e >= P) throw new RangeError("not a field element");
  const out = new Uint8Array(32);
  let x = e;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Exactly 32 big-endian bytes holding a value below P, else throws. */
export function fieldFromBytes(b) {
  if (!(b instanceof Uint8Array) || b.length !== 32) throw new RangeError("not 32 bytes");
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  if (x >= P) throw new RangeError("not a canonical field element");
  return x;
}

/** Big-endian bytes (any length up to 31 here) as a field element. */
function bytesToBig(b) {
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x;
}

/** owner_pk = H(TAG_OWNER, nk). Senders never have nk; this is for tests. */
export const ownerPk = (nk) => H(TAG_OWNER, nk);

/** pc = H(TAG_PC, owner_pk, rho, rcm), the hidden-owner commitment. */
export const pc = (ownerPk_, rho, rcm) => H(TAG_PC, ownerPk_, rho, rcm);

/** cm = H(TAG_CM, asset_id, value, pc), the note commitment. */
export const cm = (assetId_, value, pc_) => H(TAG_CM, assetId_, u64(value), pc_);

/**
 * AssetID(denom) = H(TAG_ASSET, len(denom), c_0, ..., c_k), c_i the denom's
 * bytes in 31-byte big-endian chunks.
 */
export function assetId(denom) {
  const b = new TextEncoder().encode(denom);
  const chunks = [];
  for (let i = 0; i < b.length; i += 31) chunks.push(bytesToBig(b.subarray(i, i + 31)));
  return H(TAG_ASSET, BigInt(b.length), ...chunks);
}

/**
 * A uniformly random field element from the platform CSPRNG: 64 random
 * bytes reduced mod P (bias below 2^-250), the same width the wallet's
 * HMAC-SHA512 derivations reduce.
 */
export function randomField() {
  const b = new Uint8Array(64);
  globalThis.crypto.getRandomValues(b);
  return bytesToBig(b) % P;
}
