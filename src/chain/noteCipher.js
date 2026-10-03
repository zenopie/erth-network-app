import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";

import { assetId, cm as noteCm, fieldToBytes, pc as notePc, randomField, u64 } from "./privacy";
import { decodeShieldedAddress } from "./shieldedAddress";

/**
 * Note ciphertexts, sender side, as the chain's zk/privacy/notecipher.go
 * defines them. v1 ("earth note v1") is for a note whose value is fixed when
 * it is signed:
 *
 *   ct  = epk (32) || ChaCha20-Poly1305(key, nonce = 12 zero bytes, aad = none, pt)
 *   key = HKDF-SHA256(ikm = X25519(esk, ek_pub), salt = "earth.note.v1", info = epk || cm)
 *   pt  = 0x01 || asset_id (32) || value (u64 BE) || rho (32) || rcm (32) || memo (64)
 *
 * 217 bytes for every note. esk is fresh per note, so the fixed nonce never
 * repeats under one key. cm is in `info`, and cm commits to the value: a
 * ciphertext only opens for the exact note it was made for.
 *
 * v2 ("earth note v2", value-blind) is for a note whose asset and value the
 * chain decides when the msg runs — a swap's output, an LP withdrawal priced
 * at maturity:
 *
 *   ct  = epk (32) || ChaCha20-Poly1305(key, nonce = 12 zero bytes, aad = none, pt)
 *   key = HKDF-SHA256(ikm = X25519(esk, ek_pub), salt = "earth.note.v2", info = epk)
 *   pt  = 0x02 || rho (32) || rcm (32) || memo (64)
 *
 * 177 bytes. The recipient opens it, recomputes pc and cm from the asset and
 * amount the chain publishes for that note, and accepts only a matching cm.
 *
 * The web app never decrypts — it holds no shielded keys.
 */

export const NOTE_VERSION = 0x01;
export const NOTE_MEMO_BYTES = 64;
export const NOTE_PLAINTEXT_BYTES = 1 + 32 + 8 + 32 + 32 + NOTE_MEMO_BYTES; // 169
export const NOTE_CIPHERTEXT_BYTES = 32 + NOTE_PLAINTEXT_BYTES + 16; // 217

export const BLIND_NOTE_VERSION = 0x02;
export const BLIND_NOTE_PLAINTEXT_BYTES = 1 + 32 + 32 + NOTE_MEMO_BYTES; // 129
export const BLIND_NOTE_CIPHERTEXT_BYTES = 32 + BLIND_NOTE_PLAINTEXT_BYTES + 16; // 177

const NOTE_SALT = new TextEncoder().encode("earth.note.v1");
const BLIND_NOTE_SALT = new TextEncoder().encode("earth.note.v2");

/** A memo as its fixed 64 bytes: UTF-8, zero padded; longer is refused. */
export function memoBytes(memo = "") {
  const m = typeof memo === "string" ? new TextEncoder().encode(memo) : memo;
  if (m.length > NOTE_MEMO_BYTES) throw new RangeError(`memo is over ${NOTE_MEMO_BYTES} bytes`);
  const out = new Uint8Array(NOTE_MEMO_BYTES);
  out.set(m);
  return out;
}

/** The 169-byte plaintext of { assetId, value, rho, rcm, memo }. */
export function notePlaintext({ assetId: asset, value, rho, rcm, memo }) {
  const pt = new Uint8Array(NOTE_PLAINTEXT_BYTES);
  pt[0] = NOTE_VERSION;
  pt.set(fieldToBytes(asset), 1);
  let v = u64(value);
  for (let i = 40; i >= 33; i--) {
    pt[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  pt.set(fieldToBytes(rho), 41);
  pt.set(fieldToBytes(rcm), 73);
  pt.set(memoBytes(memo), 105);
  return pt;
}

/** HKDF-SHA256(shared, "earth.note.v1", epk || cm), 32 bytes. */
export function noteKey(shared, epk, cmField) {
  const info = new Uint8Array(64);
  info.set(epk, 0);
  info.set(fieldToBytes(cmField), 32);
  return hkdf(sha256, shared, NOTE_SALT, info, 32);
}

/**
 * Encrypts a note whose commitment is `cmField` to `ekPub` under the
 * ephemeral secret `esk` (32 bytes; fixed only in fixtures). A low-order
 * ek_pub (all-zero shared secret) is refused rather than encrypted to.
 */
export function encryptNote(note, cmField, ekPub, esk) {
  return seal(ekPub, esk, (shared, epk) => noteKey(shared, epk, cmField), notePlaintext(note));
}

/** HKDF-SHA256(shared, "earth.note.v2", epk), 32 bytes. */
export function blindNoteKey(shared, epk) {
  return hkdf(sha256, shared, BLIND_NOTE_SALT, epk, 32);
}

/** The 129-byte v2 plaintext of { rho, rcm, memo }. */
export function blindNotePlaintext({ rho, rcm, memo }) {
  const pt = new Uint8Array(BLIND_NOTE_PLAINTEXT_BYTES);
  pt[0] = BLIND_NOTE_VERSION;
  pt.set(fieldToBytes(rho), 1);
  pt.set(fieldToBytes(rcm), 33);
  pt.set(memoBytes(memo), 65);
  return pt;
}

/** Encrypts a note's secrets (v2, value-blind) to `ekPub` under `esk`. */
export function encryptBlindNote(note, ekPub, esk) {
  return seal(ekPub, esk, blindNoteKey, blindNotePlaintext(note));
}

// epk || ChaCha20-Poly1305(keyOf(shared, epk), 0^12, pt).
function seal(ekPub, esk, keyOf, pt) {
  if (!(esk instanceof Uint8Array) || esk.length !== 32) throw new RangeError("esk is not 32 bytes");
  const epk = x25519.getPublicKey(esk);
  let shared;
  try {
    shared = x25519.getSharedSecret(esk, ekPub);
  } catch {
    throw new Error("The address's encryption key is invalid.");
  }
  if (shared.every((b) => b === 0)) throw new Error("The address's encryption key is invalid.");
  const sealed = chacha20poly1305(keyOf(shared, epk), new Uint8Array(12)).encrypt(pt);
  const ct = new Uint8Array(32 + sealed.length);
  ct.set(epk, 0);
  ct.set(sealed, 32);
  return ct;
}

function freshSecrets(rand) {
  const rho = rand?.rho ?? randomField();
  const rcm = rand?.rcm ?? randomField();
  let esk = rand?.esk;
  if (!esk) {
    esk = new Uint8Array(32);
    globalThis.crypto.getRandomValues(esk);
  }
  return { rho, rcm, esk };
}

/**
 * Everything a signed msg needs to pay `value` of `denom` as a note to the
 * shielded `address`: { pc, ciphertext } as bytes for the msg, plus cm (hex)
 * to show. rho, rcm and esk are fresh from crypto.getRandomValues; pass
 * `rand` only in tests.
 *
 * v1 ciphertext: only for a note inside a private bundle (built on the
 * phone). Every note the chain mints — MsgShield's included — carries the v2
 * ciphertext instead (blindNotePayment).
 */
export function notePayment(address, denom, value, { memo = "", rand } = {}) {
  const { ownerPk, ekPub } = decodeShieldedAddress(address);
  const { rho, rcm, esk } = freshSecrets(rand);
  const asset = assetId(denom);
  const pcField = notePc(ownerPk, rho, rcm);
  const cmField = noteCm(asset, value, pcField);
  const ciphertext = encryptNote({ assetId: asset, value, rho, rcm, memo }, cmField, ekPub, esk);
  return {
    pc: fieldToBytes(pcField),
    ciphertext,
    cm: Array.from(fieldToBytes(cmField), (b) => b.toString(16).padStart(2, "0")).join(""),
  };
}

/**
 * Throws unless `ct` is an amount-blind v2 ciphertext's exact length (177
 * bytes): the chain requires one, and nothing else, on every note it mints
 * (MsgShield, MsgBuyAnml, an ANML-pool MsgRemoveLiquidity, MsgRegister).
 */
export function checkBlindCiphertext(ct, what = "ciphertext") {
  if (!(ct instanceof Uint8Array) || ct.length !== BLIND_NOTE_CIPHERTEXT_BYTES) {
    throw new RangeError(`${what} must be a ${BLIND_NOTE_CIPHERTEXT_BYTES}-byte amount-blind ciphertext`);
  }
  return ct;
}

/**
 * { pc, ciphertext } (bytes) paying a note the chain mints (MsgShield,
 * MsgBuyAnml's output, an ANML-pool withdrawal's ANML leg) to the shielded
 * `address`, with the v2 value-blind ciphertext. The chain's one
 * note-discovery rule: the recipient's wallet opens it and completes cm from
 * the asset and amount the chain publishes for the note.
 */
export function blindNotePayment(address, { memo = "", rand } = {}) {
  const { ownerPk, ekPub } = decodeShieldedAddress(address);
  const { rho, rcm, esk } = freshSecrets(rand);
  return {
    pc: fieldToBytes(notePc(ownerPk, rho, rcm)),
    ciphertext: encryptBlindNote({ rho, rcm, memo }, ekPub, esk),
  };
}
