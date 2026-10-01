// The note layer the web app signs with (Poseidon2, asset ids, pc/cm, the
// erthz shielded address, the note ciphertext) against golden vectors taken
// from the chain's zk/privacy and zk/poseidon2 tests and from the Android
// wallet's (which are generated from the chain). Any byte of difference means
// a note the recipient's wallet cannot find, so every vector is exact.
//
// Run from check-privacy.mjs: `npm run check:privacy`.
import { x25519 } from "@noble/curves/ed25519.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { bech32, bech32m } from "@scure/base";

import V from "./fixtures/privacy-vectors.json";
import { P, poseidon2 } from "../src/chain/poseidon2.js";
import * as pv from "../src/chain/privacy.js";
import * as addr from "../src/chain/shieldedAddress.js";
import * as nc from "../src/chain/noteCipher.js";
import * as dex from "../src/chain/dex.js";
import * as shielded from "../src/chain/shielded.js";
import { registry } from "../src/chain/tx.js";

const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (h) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));
const fhex = (e) => hex(pv.fieldToBytes(e));
const big = (h) => BigInt("0x" + h);
const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

// Opens a ciphertext as the recipient's wallet would (test-only: the app
// itself never decrypts).
function decrypt(ct, cmField, ek) {
  const epk = ct.slice(0, 32);
  const shared = x25519.getSharedSecret(ek, epk);
  const key = nc.noteKey(shared, epk, cmField);
  return chacha20poly1305(key, new Uint8Array(12)).decrypt(ct.slice(32));
}

export async function run(check) {
  // ---- Poseidon2 ------------------------------------------------------------
  for (const c of V.poseidon2_noir) {
    const ins = c.in === "64x1" ? Array(64).fill(1n) : c.in.map(BigInt);
    const got = poseidon2(ins).toString();
    check(`poseidon2 noir ${c.in === "64x1" ? "64x1" : JSON.stringify(c.in)}`, got === c.out, got);
  }
  let pOk = 0;
  for (const c of V.poseidon2) {
    const got = fhex(poseidon2(c.in.map(big)));
    if (got === c.out) pOk++;
    else check(`poseidon2 arity ${c.in.length}`, false, got);
  }
  check(`poseidon2 arity 0..12 incl. p-1 inputs (${pOk}/${V.poseidon2.length})`, pOk === V.poseidon2.length);
  check("poseidon2 refuses a non-canonical input", throws(() => poseidon2([P])));

  // ---- tags, asset ids, pc, cm ----------------------------------------------
  check("tags", fhex(pv.TAG_OWNER) === V.tags.owner && fhex(pv.TAG_PC) === V.tags.pc &&
    fhex(pv.TAG_CM) === V.tags.cm && fhex(pv.TAG_ASSET) === V.tags.asset);
  for (const [denom, want] of Object.entries(V.asset_ids)) {
    const got = fhex(pv.assetId(denom));
    check(`asset id ${denom || '""'}`.slice(0, 60), got === want, got);
  }
  const d = V.derive;
  const opk = pv.ownerPk(big(d.nk));
  check("owner_pk", fhex(opk) === d.owner_pk);
  const pcF = pv.pc(opk, big(d.rho), big(d.rcm));
  check("pc", fhex(pcF) === d.pc);
  check("cm (uanml, 1000000)", fhex(pv.cm(pv.assetId("uanml"), 1_000_000n, pcF)) === d.cm);
  check("field bytes refuse >= p", throws(() => pv.fieldFromBytes(pv.fieldToBytes(P - 1n).map(() => 0xff))));
  check("u64 refuses 2^64", throws(() => pv.u64(1n << 64n)) && pv.u64("18446744073709551615") === (1n << 64n) - 1n);
  const r1 = pv.randomField();
  const r2 = pv.randomField();
  check("randomField is canonical and fresh", r1 < P && r2 < P && r1 !== r2);

  // ---- shielded address -------------------------------------------------------
  const C = V.chain_cipher;
  const ek = unhex(C.ek);
  const ekPub = x25519.getPublicKey(ek);
  check("X25519 RFC 7748 §6.1", hex(x25519.getPublicKey(unhex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a"))) ===
    "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a");
  check("chain golden ek_pub", hex(ekPub) === C.ek_pub);
  const chainOwner = { ownerPk: pv.ownerPk(BigInt(C.nk)), ekPub };
  const enc = addr.encodeShieldedAddress(chainOwner);
  check("chain golden address encodes", enc === C.address && enc.length === 116, enc);
  for (const s of [C.address, C.address.toUpperCase(), `  ${C.address}\n`]) {
    const dec = addr.decodeShieldedAddress(s);
    check(`address round trip${s === C.address ? "" : s.trim() === s ? " (upper case)" : " (whitespace)"}`,
      dec.ownerPk === chainOwner.ownerPk && hex(dec.ekPub) === C.ek_pub);
  }
  const A = V.android_cipher;
  const ad = addr.decodeShieldedAddress(A.address);
  check("android golden address = owner_pk(nk) || ek_pub",
    ad.ownerPk === pv.ownerPk(big(A.nk)) && hex(ad.ekPub) === A.ek_pub);
  check("android golden address re-encodes", addr.encodeShieldedAddress(ad) === A.address);

  // Refusals, mirroring chain TestShieldedAddressRefusals.
  const payload = new Uint8Array(65);
  payload[0] = 1;
  payload.set(pv.fieldToBytes(chainOwner.ownerPk), 1);
  payload.set(ekPub, 33);
  const encWith = (hrp, p, coder = bech32m) => coder.encode(hrp, coder.toWords(p), false);
  const flip = C.address.slice(0, 20) + (C.address[20] === "q" ? "p" : "q") + C.address.slice(21);
  const v2 = payload.slice();
  v2[0] = 2;
  const nonCanon = payload.slice();
  nonCanon.fill(0xff, 1, 33);
  const refusals = {
    checksum: flip,
    "mixed case": C.address.slice(0, 10) + C.address.slice(10).toUpperCase(),
    "bech32 (BIP-173) checksum": encWith("erthz", payload, bech32),
    "transparent hrp": encWith("earth", payload),
    "other hrp": encWith("erthx", payload),
    version: encWith("erthz", v2),
    short: encWith("erthz", payload.slice(0, 64)),
    long: encWith("erthz", Uint8Array.from([...payload, 0])),
    "non-canonical owner_pk": encWith("erthz", nonCanon),
    "transparent address": "earth1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5yvhcg4",
    empty: "",
    "over-long": C.address + "q".repeat(400),
  };
  for (const [name, bad] of Object.entries(refusals)) {
    check(`address refuses ${name}`, !addr.isShieldedAddress(bad));
  }
  // BIP-350's bech32m vectors through the same codec the address uses.
  const valid = ["A1LQFN3A", "a1lqfn3a", "abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx",
    "an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6",
    "split1checkupstagehandshakeupstreamerranterredcaperredlc445v", "?1v759aa"];
  const invalid = ["qyrz8wqd2c9m", "1qyrz8wqd2c9m", "y1b0jsk6g", "lt1igcx5c0", "in1muywd", "mm1crxm3i",
    "au1s5cgom", "M1VUXWEZ", "16plkw9", "1p2gdwpf", "a12uel5l", "abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw"];
  check("BIP-350 valid vectors", valid.every((s) => !throws(() => bech32m.decode(s, 90))));
  check("BIP-350 invalid vectors", invalid.every((s) => throws(() => bech32m.decode(s, 90))));

  // ---- note ciphertext ---------------------------------------------------------
  const chainNote = { assetId: pv.assetId(C.denom), value: BigInt(C.value), rho: BigInt(C.rho), rcm: BigInt(C.rcm), memo: C.memo };
  const chainCm = pv.cm(chainNote.assetId, chainNote.value, pv.pc(chainOwner.ownerPk, chainNote.rho, chainNote.rcm));
  check("chain golden cm", fhex(chainCm) === C.cm);
  const chainCt = nc.encryptNote(chainNote, chainCm, ekPub, unhex(C.esk));
  check("chain golden ciphertext (217 bytes, byte for byte)", hex(chainCt) === C.ct && chainCt.length === 217);
  const viaPayment = nc.notePayment(C.address, C.denom, C.value, {
    memo: C.memo, rand: { rho: chainNote.rho, rcm: chainNote.rcm, esk: unhex(C.esk) },
  });
  check("notePayment reproduces the chain golden", hex(viaPayment.ciphertext) === C.ct && viaPayment.cm === C.cm &&
    hex(viaPayment.pc) === fhex(pv.pc(chainOwner.ownerPk, chainNote.rho, chainNote.rcm)));
  const pt = decrypt(chainCt, chainCm, ek);
  check("recipient opens it to the exact plaintext", hex(pt) === hex(nc.notePlaintext(chainNote)) &&
    pt[0] === 1 && new TextDecoder().decode(pt.slice(105, 116)) === "golden memo" && pt.slice(116).every((b) => b === 0));
  check("bound to its cm", throws(() => decrypt(chainCt, 1n, ek)));
  const tampered = chainCt.slice();
  tampered[100] ^= 1;
  check("tampered ciphertext refused", throws(() => decrypt(tampered, chainCm, ek)));
  check("wrong key refused", throws(() => decrypt(chainCt, chainCm, Uint8Array.from({ length: 32 }, (_, i) => (i ? 0 : 9)))));
  check("low-order ek_pub refused", throws(() => nc.encryptNote(chainNote, chainCm, new Uint8Array(32), unhex(C.esk))));
  check("memo over 64 bytes refused", throws(() => nc.memoBytes("x".repeat(65))));

  const rho7 = poseidon2([7n]);
  const rcm8 = poseidon2([8n]);
  const and = nc.notePayment(A.address, A.denom, A.value, { memo: A.memo, rand: { rho: rho7, rcm: rcm8, esk: unhex(A.esk) } });
  check("android golden cm", and.cm === A.cm, and.cm);
  check("android golden ciphertext (byte for byte)", hex(and.ciphertext) === A.ct);

  const fresh1 = nc.notePayment(C.address, "uerth", 5n);
  const fresh2 = nc.notePayment(C.address, "uerth", 5n);
  check("fresh payments differ in pc, epk and ct", hex(fresh1.pc) !== hex(fresh2.pc) &&
    hex(fresh1.ciphertext.slice(0, 32)) !== hex(fresh2.ciphertext.slice(0, 32)));
  const fpt = decrypt(fresh1.ciphertext, big(fresh1.cm), ek);
  const frho = pv.fieldFromBytes(fpt.slice(41, 73));
  const frcm = pv.fieldFromBytes(fpt.slice(73, 105));
  check("a fresh payment opens and recomputes its pc and cm",
    fhex(pv.pc(chainOwner.ownerPk, frho, frcm)) === hex(fresh1.pc) &&
    fhex(pv.cm(pv.assetId("uerth"), 5n, pv.pc(chainOwner.ownerPk, frho, frcm))) === fresh1.cm);

  // ---- MsgShield encodes ---------------------------------------------------------
  const m = shielded.msgShield("earth1sender", "uerth", "5", fresh1.pc, fresh1.ciphertext);
  const bytes = registry.encode(m);
  const back = registry.decode({ typeUrl: m.typeUrl, value: bytes });
  check("MsgShield round-trips pc and ciphertext", hex(back.pc) === hex(fresh1.pc) &&
    hex(back.ciphertext) === hex(fresh1.ciphertext) && back.amount.amount === "5");
  const sp = shielded.shieldTo("earth1sender", C.address, "1234567", { memo: "hi" });
  check("shieldTo builds a MsgShield for uerth with a 217-byte ciphertext",
    sp.msg.typeUrl === "/earth.shielded.v1.MsgShield" && sp.msg.value.amount.denom === "uerth" &&
    sp.msg.value.ciphertext.length === 217 && sp.msg.value.pc.length === 32);
  check("shieldTo refuses a transparent recipient", throws(() => shielded.shieldTo("earth1sender", "earth1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5yvhcg4", "1")));
  check("shieldTo refuses zero and non-integers", throws(() => shielded.shieldTo("earth1s", C.address, "0")) &&
    throws(() => shielded.shieldTo("earth1s", C.address, "1.5")));

  // ---- exact AMM maths (x/dex amm.go) --------------------------------------------
  // feeOf truncates amount * fee% ; burn takes the odd unit; out = rT*eff/(rE+eff).
  const hop = dex.exactHubToToken("1000000000", "500000000", "1000000", "0.3");
  // fee = 3000, eff = 997000, out = floor(500000000*997000 / 1000997000) = 498003
  check("exact ERTH->token hop", hop.out === 498003n && hop.fee === 3000n && hop.burn === 1500n, JSON.stringify(hop, (_, v) => (typeof v === "bigint" ? String(v) : v)));
  const odd = dex.exactHubToToken("1000000000", "500000000", "1001", "0.3");
  // fee = trunc(3.003) = 3, burn = 2 (takes the odd unit)
  check("exact hop: fee truncates, burn rounds up", odd.fee === 3n && odd.burn === 2n);
  const back2 = dex.exactTokenToHub("1000000000", "500000000", "1000000", "0.3");
  // gross = 1e9*1e6/(5e8+1e6) = 1996007 ; fee = trunc(5988.021) = 5988 ; out = 1990019
  check("exact token->ERTH hop", back2.out === 1990019n && back2.fee === 5988n, String(back2.out));
  check("swap fee parses chain decimals", dex.parseDec18("0.300000000000000000") === 300000000000000000n &&
    dex.parseDec18("1") === 10n ** 18n && throws(() => dex.parseDec18("abc")));
}
