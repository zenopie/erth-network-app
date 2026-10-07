// Handles (src/chain/handles.js): the directory reader, verifying it against
// the chain, and paying a handle. Stubbed; no chain required.
//
// What this guards: a lookup that names one handle (the server learns who
// pays whom), a directory read that trusts an out-of-order, short, oversized
// or shifting snapshot, an address shown, copied or paid that the backend
// says a handle names but the chain does not, a lapsed handle being paid, and
// the handle leaking into a URL or a Referer.
import { check, done, rejects } from "./lib.mjs";
import { x25519 } from "@noble/curves/ed25519.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import V from "../fixtures/privacy-vectors.json";

const h = await import("../../src/chain/handles.js");
const shielded = await import("../../src/chain/shielded.js");
const nc = await import("../../src/chain/noteCipher.js");
const pv = await import("../../src/chain/privacy.js");

const unhex = (s) => Uint8Array.from(s.match(/../g).map((b) => parseInt(b, 16)));

// ---- handle format -----------------------------------------------------------
check("valid handles", ["abc", "a-b", "alice-01", "x".repeat(32)].every(h.validHandle));
check("invalid handles", ["ab", "-ab", "ab-", "Alice", "a_b", "x".repeat(33), "", "a b"].every((s) => !h.validHandle(s)));
check("parse drops @ and lowercases", h.parseHandle(" @Alice ") === "alice" && h.parseHandle("@a") === null);
check("looksLikeHandle", h.looksLikeHandle("@x") && h.looksLikeHandle("alice") && !h.looksLikeHandle("earth1abc") && !h.looksLikeHandle("erthz1abc"));
check("truncate", h.truncateAddress("erthz1" + "q".repeat(110)) === "erthz1qqqqqqqq…qqqqqqqq");

// ---- a fake chain + backend --------------------------------------------------
const C = V.chain_cipher;
const alice = C.address; // a real erthz address whose ek is known (vectors)
let now = 1_800_000_000;
const mk = (handle, address, expiresAt, status = "live") => ({ handle, address, status, expiresAt, renewalUntil: expiresAt + 30 * 86400 });

function world(entries) {
  const asked = [];
  const state = { entries: [...entries].sort((a, b) => (a.handle < b.handle ? -1 : 1)), height: 100, shiftOnce: false, forge: null };
  const chainPage = async (start, limit) => {
    asked.push(`chain:start=${start}`);
    const after = state.entries.filter((e) => e.handle > start);
    const page = after.slice(0, limit);
    return { handles: page, next: after.length > page.length ? page[page.length - 1].handle : "" };
  };
  const streamPage = async (from, limit) => {
    asked.push(`stream:from=${from}`);
    if (from % limit !== 0) throw new Error("400 not aligned");
    const height = state.height;
    if (state.shiftOnce && from > 0) {
      state.shiftOnce = false;
      state.height++;
    }
    const all = state.entries.map((e) => (state.forge ? { ...e, address: state.forge } : e));
    const rows = all.slice(from, from + limit);
    return { handles: rows, height: from > 0 ? state.height : height, size: all.length, fromIndex: from, lastPage: from + limit >= all.length };
  };
  return { asked, state, chainPage, streamPage };
}

// 2,500 handles: three backend pages, three chain pages.
const many = Array.from({ length: 2500 }, (_, i) => mk(`h${String(i).padStart(5, "0")}`, alice, now + 1000));
{
  const w = world([...many, mk("alice", alice, now + 86400)]);
  const dir = h.createHandleDirectory({ fetchChainPage: w.chainPage, fetchStreamPage: w.streamPage, now: () => now });
  const all = await dir.all();
  check("the whole directory, from the backend stream", all.size === 2501 && w.asked.every((a) => a.startsWith("stream:")),
    `${all.size} ${w.asked.join(",")}`);
  check("aligned pages from 0", w.asked.join(",") === "stream:from=0,stream:from=1000,stream:from=2000");
  w.asked.length = 0;
  await dir.lookup("alice");
  check("a lookup within the cache asks nothing", w.asked.length === 0);
  // Two minutes on: the cached copy is too old to pay from.
  now += 120;
  const r = await dir.resolveForPayment("@Alice");
  check("a payment reads fresh copies of both directories, whole", r.ok && r.entry.address === alice &&
    w.asked.some((a) => a === "stream:from=0") && w.asked.some((a) => a === "chain:start="), w.asked.join(","));
  check("never a per-handle URL", w.asked.every((a) => /^(stream:from=\d+|chain:start=.*)$/.test(a)) && !w.asked.some((a) => a.includes("alice") && a.startsWith("stream")));
  // chain pages start at "" and then at the previous page's last handle only
  check("chain pages follow next", w.asked.filter((a) => a.startsWith("chain")).every((a, i, xs) => i === 0 ? a === "chain:start=" : xs[i] > xs[i - 1]));
}

// A snapshot that moves between pages is read again from 0.
{
  const w = world(many);
  w.state.shiftOnce = true;
  const dir = h.createHandleDirectory({ fetchChainPage: w.chainPage, fetchStreamPage: w.streamPage, now: () => now });
  const all = await dir.all();
  check("restart when the height moves", all.size === 2500 && w.asked.filter((a) => a === "stream:from=0").length === 2, w.asked.join(","));
}

// Out of order, a bad status, a short snapshot: refused (stream) — the chain's pages are used instead.
for (const [name, mutate] of [
  ["out of order", (rows) => [rows[1], rows[0], ...rows.slice(2)]],
  ["bad status", (rows) => [{ ...rows[0], status: "mine" }, ...rows.slice(1)]],
  ["not a handle", (rows) => [{ ...rows[0], handle: "../x" }, ...rows.slice(1)]],
]) {
  const rows = mutate([mk("aaa", alice, now + 9), mk("bbb", alice, now + 9), mk("ccc", alice, now + 9)]);
  await (async () => {
    let threw = false;
    try {
      await h.readStreamDirectory(async (from) => ({ handles: rows, height: 1, size: rows.length, fromIndex: from, lastPage: true }));
    } catch {
      threw = true;
    }
    check(`stream refused: ${name}`, threw);
  })();
}
// Spec §4g: times no lease has, or more than 1,000,000 rows, refuse the whole directory.
for (const [name, e] of [
  ["expires_at 0", { ...mk("aaa", alice, now), expiresAt: 0 }],
  ["renewal_until before expires_at", { ...mk("aaa", alice, now), renewalUntil: now - 1 }],
  ["renewal_until past now + 10 years", mk("aaa", alice, now + 10 * 365 * 86400)],
]) {
  check(`stream refused: ${name}`, await rejects(h.readStreamDirectory(async (from) => ({ handles: [e], height: 1, size: 1, fromIndex: from, lastPage: true }), now)));
  check(`chain refused: ${name}`, await rejects(h.readChainDirectory(async () => ({ handles: [e], next: "" }), now)));
}
check("renewal_until at exactly now + 10 years is accepted",
  (await h.readChainDirectory(async () => ({ handles: [{ ...mk("aaa", alice, now), renewalUntil: now + 10 * 365 * 86400 }], next: "" }), now)).size === 1);
{
  let asked = 0;
  const huge = async (from) => { asked++; return { handles: [mk("aaa", alice, now + 9)], height: 1, size: h.MAX_ROWS + 1, fromIndex: from, lastPage: false }; };
  check("a stream whose page 0 claims more than 1,000,000 rows is refused before page 1", await rejects(h.readStreamDirectory(huge, now)) && asked === 1);
  check("the row cap is 1,000,000", h.MAX_ROWS === 1_000_000);
}
check("stream refused: size mismatch", await rejects(h.readStreamDirectory(async (from) => ({ handles: [mk("aaa", alice, 1)], height: 1, size: 2, fromIndex: from, lastPage: true }))));
check("stream refused: wrong page", await rejects(h.readStreamDirectory(async () => ({ handles: [], height: 1, size: 0, fromIndex: 5, lastPage: true }))));
check("chain refused: next is not the last handle", await rejects(h.readChainDirectory(async () => ({ handles: [mk("aaa", alice, 1)], next: "zzz" }))));
{
  const w = world([mk("aaa", alice, now + 9)]);
  const brokenStream = async () => { throw new Error("CORS"); };
  const dir = h.createHandleDirectory({ fetchChainPage: w.chainPage, fetchStreamPage: brokenStream, now: () => now });
  check("no backend: the chain's own pages", (await dir.all()).size === 1);
}

// A backend naming another address for a handle is caught by the chain's directory.
{
  const w = world([mk("alice", alice, now + 86400)]);
  // Another valid erthz address (the vectors' android one).
  w.state.forge = V.android_cipher.address;
  const dir = h.createHandleDirectory({ fetchChainPage: w.chainPage, fetchStreamPage: w.streamPage, now: () => now });
  const r = await dir.resolveForPayment("alice");
  check("forged backend entry is not paid", !r.ok && /changed on chain/.test(r.reason), r.reason);
}

// What the Handles page and the Shield preview show goes through
// verifiedAll(): a backend row that disagrees with the chain is marked,
// never verified, so it is never shown as payable or copied.
{
  const w = world([mk("alice", alice, now + 86400), mk("bob", alice, now + 86400), mk("zed", alice, now + 86400)]);
  const forged = V.android_cipher.address;
  // The stream forges alice, drops zed, and adds a handle the chain lacks.
  const stream = async (from) => {
    const rows = [
      { ...w.state.entries[0], address: forged },
      w.state.entries[1],
      mk("carol", forged, now + 86400),
      mk("dave", "erthz1notanaddress", now + 86400),
    ];
    return { handles: rows, height: 5, size: rows.length, fromIndex: from, lastPage: true };
  };
  w.state.entries.push(mk("dave", "erthz1notanaddress", now + 86400));
  w.state.entries.sort((a, b) => (a.handle < b.handle ? -1 : 1));
  const dir = h.createHandleDirectory({ fetchChainPage: w.chainPage, fetchStreamPage: stream, now: () => now });
  const v = await dir.verifiedAll();
  const a = v.get("alice");
  check("a forged backend address is never verified (Copy and Pay disabled)", a && a.verified === false && /something else/.test(a.problem), a?.problem);
  check("a matching entry is verified", v.get("bob")?.verified === true && v.get("bob").address === alice);
  check("a handle the chain lacks is unverified", v.get("carol")?.verified === false && /no such handle/.test(v.get("carol").problem));
  check("a handle the copy omits comes from the chain, verified", v.get("zed")?.verified === true && v.get("zed").address === alice);
  check("an address that does not decode is never verified, chain or not", v.get("dave")?.verified === false && /not a payable/.test(v.get("dave").problem), v.get("dave")?.problem);
  check("verifiedLookup agrees", (await dir.verifiedLookup("alice")).verified === false && (await dir.verifiedLookup("bob")).verified === true);
  check("rows in handle order", [...v.keys()].join() === "alice,bob,carol,dave,zed", [...v.keys()].join());
  check("addressProblem", h.addressProblem(alice) === "" && h.addressProblem("erthz1x") !== "" && h.addressProblem(forged) === "");
  const r = await dir.resolveForPayment("@alice");
  check("the payment path still refuses it", !r.ok && /changed on chain/.test(r.reason), r.reason);
}

// The pages use it: the table's Copy and Pay only for a verified row, the
// Shield preview labelled until Review. (Source checks; run from the app root.)
{
  const { readFileSync } = await import("node:fs");
  const page = readFileSync("src/pages/Handles.jsx", "utf8");
  const shield = readFileSync("src/pages/Shield.jsx", "utf8");
  check("Handles page reads verifiedAll and gates Copy and Pay on it",
    page.includes("handleDirectory\n      .verifiedAll()") && page.includes("disabled={!ok}") && page.includes("st === LIVE && ok &&") &&
      page.includes("const ok = e.verified === true;"));
  check("a review counts only for the recipient it was asked for",
    shield.includes("storedReview?.for === recipient") && shield.includes("if (recipientRef.current !== asked) return;"));
  const headers = readFileSync("security-headers.conf", "utf8");
  const html = readFileSync("index.html", "utf8");
  check("Pay carries the handle in the fragment, Shield reads only the fragment",
    page.includes('hash: `#to=${encodeURIComponent(`@${e.handle}`)}`') && !page.includes("?to=") &&
      !shield.includes("useSearchParams") && shield.includes('new URLSearchParams(hash.replace(/^#/, ""))'));
  check("Referrer-Policy no-referrer (header and meta)",
    /add_header Referrer-Policy "no-referrer" always;/.test(headers) && !/strict-origin/.test(headers) &&
      html.includes('<meta name="referrer" content="no-referrer" />'));
  check("Shield preview is labelled unverified and decoded", shield.includes("(unverified until Review)") && shield.includes("addressProblem(e.address)"));
}

// Lapsed, renewal, unknown: not payable.
{
  const w = world([mk("old", alice, now - 10), mk("ren", alice, now - 10, "renewal"), mk("live", alice, now + 10)]);
  const dir = h.createHandleDirectory({ fetchChainPage: w.chainPage, fetchStreamPage: w.streamPage, now: () => now });
  check("served live but expired by our clock: not payable", !(await dir.resolveForPayment("old")).ok);
  check("renewal period: not payable", !(await dir.resolveForPayment("ren")).ok);
  check("unclaimed: not payable", !(await dir.resolveForPayment("nobody")).ok);
  check("not a handle: not payable", !(await dir.resolveForPayment("a_b")).ok);
  check("statusAt demotes by the clock", h.statusAt(mk("x", alice, now - 1), now) === "renewal" &&
    h.statusAt(mk("x", alice, now - 40 * 86400), now) === "free");
  // Paying it: MsgShield whose note the handle's owner opens.
  const r = await dir.resolveForPayment("live");
  const { msg } = shielded.shieldTo("earth1sender", r.entry.address, "1234567");
  const ct = msg.value.ciphertext;
  const epk = ct.slice(0, 32);
  const pt = chacha20poly1305(nc.blindNoteKey(x25519.getSharedSecret(unhex(C.ek), epk), epk), new Uint8Array(12)).decrypt(ct.slice(32));
  const owner = pv.ownerPk(BigInt(C.nk));
  const pc = pv.pc(owner, pv.fieldFromBytes(pt.slice(1, 33)), pv.fieldFromBytes(pt.slice(33, 65)));
  check("a handle payment: a 177-byte blind note its owner opens, pc to its owner_pk",
    ct.length === 177 && pt[0] === 2 && Buffer.from(pv.fieldToBytes(pc)).equals(Buffer.from(msg.value.pc)) && msg.value.amount.amount === "1234567");
}

check("validBase", h.validBase("/privacy/earth-1/0123456789abcdef", "earth-1", "0123456789abcdef", "earth-1") &&
  !h.validBase("/privacy/earth-1/0123456789abcdef/..", "earth-1", "0123456789abcdef", "earth-1") &&
  !h.validBase("https://evil/privacy/earth-1/0123456789abcdef", "earth-1", "0123456789abcdef", "earth-1") &&
  !h.validBase("/privacy/earth-2/0123456789abcdef", "earth-2", "0123456789abcdef", "earth-1"));

done();
