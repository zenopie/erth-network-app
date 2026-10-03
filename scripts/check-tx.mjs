// broadcast() after the tx may have reached the node: a transient LCD error
// is "submitted, status unknown" with the hash, never "failed", and the
// account cannot send again until that hash resolves. Port of the audit-3
// PoC (waitfortx.mjs): a 'Failed to fetch' on the first confirmation poll
// used to reject broadcast() with the tx already in the mempool, and the
// user's retry paid twice.
//
// Keplr and the LCD are stubbed; timers run immediately. No chain required.
import { webcrypto } from "node:crypto";
import { Secp256k1 } from "@cosmjs/crypto";
import { sha256 } from "@noble/hashes/sha2.js";
import { fromBase64, toHex } from "@cosmjs/encoding";
import { TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";

globalThis.crypto ??= webcrypto;
globalThis.setTimeout = (fn) => (queueMicrotask(fn), 0);
console.warn = () => {};
console.error = () => {};

const kp = await Secp256k1.makeKeypair(new Uint8Array(32).fill(7));
const pub = Secp256k1.compressPubkey(kp.pubkey);
let address = "earth1xxxx";
globalThis.window = {
  keplr: {
    experimentalSuggestChain: async () => {},
    enable: async () => {},
    getOfflineSigner: () => ({
      getAccounts: async () => [{ address, pubkey: pub, algo: "secp256k1" }],
      signDirect: async (_a, doc) => ({ signed: doc, signature: { signature: Buffer.alloc(64).toString("base64") } }),
    }),
    getKey: async () => ({ name: "t" }),
  },
};

// Scenario knobs, reset per case.
let height = 100;
let heightRaw = null; // overrides the LCD's height string when set
let posted = [];
let post = () => ({ ok: true, json: async () => ({ tx_response: { code: 0, txhash: "IGNORED" } }) });
let lookup = () => ({ ok: false, status: 404, text: async () => "tx not found" });
const res404 = { ok: false, status: 404, text: async () => "tx not found" };
const res530 = { ok: false, status: 530, text: async () => "cf 530" };
// The LCD answers about the hash asked for (txhash echoed), unless a case says otherwise.
const found = (code = 0, txhash) => (q) => ({ ok: true, json: async () => ({ tx_response: { code, txhash: txhash ?? q, raw_log: "boom" } }) });

globalThis.fetch = async (url, opts) => {
  url = String(url);
  if (opts?.method === "POST") {
    posted.push(JSON.parse(opts.body).tx_bytes);
    return post();
  }
  if (url.includes("/auth/")) return { ok: true, json: async () => ({ account: { account_number: "1", sequence: "0" } }) };
  if (url.includes("/blocks/latest")) return { ok: true, json: async () => ({ block: { header: { height: heightRaw ?? String(height) } } }) };
  if (url.includes("/cosmos/tx/v1beta1/txs/")) return lookup(url.split("/").pop());
  return res530;
};

const tx = await import("../src/chain/tx.js");
const sh = await import("../src/chain/shielded.js");
await tx.connectKeplr();
const G = "erthz1qy4m4lwe79wu4p4gs6vqrtdhcngph2phnll9x5t296jdd9m5z4p0gpar0j7pggynezm4thqmzr5xedpxxa9dz64g20kshh7qk2ux68rudaur8p";
const send = () => tx.broadcast([sh.shieldTo(address, G, "1000000").msg]);
const hashOf = (b64) => toHex(sha256(fromBase64(b64))).toUpperCase();

let bad = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? " — " + detail : ""}`);
  if (!cond) bad++;
};
const outcome = async (p) => {
  try {
    return { ok: await p };
  } catch (e) {
    return { err: e };
  }
};

// 1. The PoC: a dropped connection, then a proxy 530, then the tx.
{
  let polls = 0;
  posted = [];
  lookup = (q) => {
    polls++;
    if (polls === 1) throw new TypeError("Failed to fetch");
    if (polls === 2) return res530;
    return found(0)(q);
  };
  const r = await outcome(send());
  check("transient poll errors are retried, not reported as failure", r.ok && posted.length === 1 && polls === 3, r.err?.message);
  check("a landed tx clears the pending hash", tx.pendingTx() === null);
  const body = TxBody.decode(TxRaw.decode(fromBase64(posted[0])).bodyBytes);
  check("the signed body carries a timeout height", body.timeoutHeight === 150n, String(body.timeoutHeight));
}

// 2. The LCD never answers: status unknown, with the hash of what was sent.
{
  posted = [];
  lookup = () => {
    throw new TypeError("Failed to fetch");
  };
  const r = await outcome(send());
  const h = posted[0] && hashOf(posted[0]);
  check("an unreadable outcome is TxStatusUnknownError, not a failure",
    r.err instanceof tx.TxStatusUnknownError && r.err.hash === h && /status unknown/i.test(r.err.message), r.err?.message);
  check("the hash stays pending", tx.pendingTx()?.hash === h);

  // 3. Resubmission while it is unresolved (LCD still down, then 404 within the timeout).
  const r2 = await outcome(send());
  check("resubmission is refused while the LCD cannot say", r2.err instanceof tx.TxStatusUnknownError && posted.length === 1, r2.err?.message);
  lookup = () => res404;
  const r3 = await outcome(send());
  check("resubmission is refused while not indexed and within its timeout",
    r3.err instanceof tx.TxStatusUnknownError && r3.err.hash === h && posted.length === 1, r3.err?.message);
  check("resolvePendingTx: pending", (await tx.resolvePendingTx())?.status === "pending");

  // 4. The hash lands: unblocked.
  lookup = (q) => (q === h ? found(0)(q) : res404);
  check("resolvePendingTx: confirmed, then cleared", (await tx.resolvePendingTx())?.status === "confirmed" && tx.pendingTx() === null);
}

// 5. The POST itself is lost: unknown; past the timeout height it expires.
{
  posted = [];
  post = () => {
    throw new TypeError("Failed to fetch");
  };
  lookup = () => res404;
  const r = await outcome(send());
  check("a lost broadcast response is status unknown with the precomputed hash",
    r.err instanceof tx.TxStatusUnknownError && r.err.hash === hashOf(posted[0]), r.err?.message);
  post = () => res530;
  const r2 = await outcome(send());
  check("still blocked before the timeout height", r2.err instanceof tx.TxStatusUnknownError && posted.length === 1);
  height = 100 + 51;
  check("resolvePendingTx: expired past the timeout height", (await tx.resolvePendingTx())?.status === "expired" && tx.pendingTx() === null);
  const r3 = await outcome(send());
  check("a 5xx on broadcast is status unknown too", r3.err instanceof tx.TxStatusUnknownError && posted.length === 2);
  height = 1000;
  await tx.resolvePendingTx();
}

// 6. Real rejections are still errors and leave nothing pending.
{
  posted = [];
  post = () => ({ ok: true, json: async () => ({ tx_response: { code: 5, raw_log: "insufficient funds" } }) });
  const r = await outcome(send());
  check("a CheckTx rejection is a plain error", r.err && !(r.err instanceof tx.TxStatusUnknownError) && tx.pendingTx() === null, r.err?.message);
  post = () => ({ ok: true, json: async () => ({ tx_response: { code: 0 } }) });
  lookup = found(11);
  const r2 = await outcome(send());
  check("a deliver failure is a plain error and clears the hash",
    /failed \(code 11\)/.test(r2.err?.message ?? "") && !(r2.err instanceof tx.TxStatusUnknownError) && tx.pendingTx() === null, r2.err?.message);
}

// 7. Audit 4 (poc-pending-overwrite): one record per account. Another Keplr
// account sending in the same browser must not erase A's unresolved hash.
{
  const A = address;
  const B = "earth1yyyy";
  posted = [];
  post = () => res530;
  lookup = () => res404;
  height = 2000;
  const r = await outcome(send());
  const hA = posted[0] && hashOf(posted[0]);
  check("A: status unknown, pending", r.err instanceof tx.TxStatusUnknownError && tx.pendingTx(A)?.hash === hA);
  address = B;
  await tx.connectKeplr();
  post = () => ({ ok: true, json: async () => ({ tx_response: { code: 0 } }) });
  lookup = (q) => (q === hA ? res404 : found(0)(q));
  const rb = await outcome(send());
  check("B sends while A is unresolved", rb.ok && posted.length === 2 && tx.pendingTx(B) === null, rb.err?.message);
  check("A's pending hash survives B's send", tx.pendingTx(A)?.hash === hA);
  address = A;
  await tx.connectKeplr();
  const ra = await outcome(send());
  check("A's resend is still refused", ra.err instanceof tx.TxStatusUnknownError && ra.err.hash === hA && posted.length === 2, ra.err?.message);

  // 8. A tx_response about another hash neither confirms nor clears A's.
  lookup = (q) => found(0, "AB".repeat(32))(q);
  check("resolvePendingTx: a mismatched txhash is unknown", (await tx.resolvePendingTx(A))?.status === "unknown" && tx.pendingTx(A)?.hash === hA);
  const w = await outcome(tx.waitForTx(hA, { attempts: 3, address: A }));
  check("waitForTx ignores an answer about another hash", w.err instanceof tx.TxStatusUnknownError && tx.pendingTx(A)?.hash === hA, w.err?.message);

  // 9. latestHeight guard: junk or absurd heights never expire a pending tx.
  lookup = () => res404;
  for (const junk of ["99999999999999999999", "1e9", "-5", "0", ""]) {
    heightRaw = junk;
    const s = (await tx.resolvePendingTx(A))?.status;
    check(`height ${JSON.stringify(junk)} does not expire the pending tx`, s === "unknown" && tx.pendingTx(A)?.hash === hA, s);
  }
  heightRaw = null;
  height = 3000;
  check("a real height past the timeout expires it", (await tx.resolvePendingTx(A))?.status === "expired" && tx.pendingTx(A) === null);
}

process.exit(bad ? 1 : 0);
