// Runs the privacy-chain read layer (personhood, assembly, shielded,
// shieldedstaking, gov) against stubbed LCD responses shaped like the chain's
// grpc-gateway JSON, then the note layer's golden vectors (check-notes.mjs).
// No chain and no test runner required.
//
// The failure this guards against is a field-name or encoding drift reading
// as a plausible zero: bytes arrive base64 and are shown hex, uint64 arrives
// as a string, and a CountryField is a 32-byte big-endian element whose last
// two bytes are the ISO code.
import { webcrypto } from "node:crypto";

// Node 18 has no global WebCrypto in ES modules; the browser always does.
globalThis.crypto ??= webcrypto;

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const field = (cc) => {
  const b = new Uint8Array(32);
  if (cc) [b[30], b[31]] = [cc.charCodeAt(0), cc.charCodeAt(1)];
  return b64(b);
};

const routes = {
  "/earth/personhood/v1/registration_count": { count: "12" },
  "/earth/personhood/v1/caretaker_voter_count": { count: "7" },
  "/earth/personhood/v1/identity_tree": { size: "15", latest_root: b64([0xab, 0xcd]), window_seconds: "3600" },
  "/earth/personhood/v1/registration/0a0b": {
    registered: true, expired: false,
    registration: { nullifier: b64([10, 11]), leaf_index: "3", registered_at: "1700000000",
      activated_at: "1700000100", dsc_key: b64([1, 2, 3]), country: "DE" },
  },
  "/earth/personhood/v1/referrer/earth1abc": { live: true, expires_at: "1800000000" },
  "/earth/personhood/v1/params": { params: { caretaker_vote_seconds: "0", identity_root_window_seconds: "0" } },
  "/earth/assembly/v1/proposal_tally/4": { tally: { yes: "9", no: "2" }, approved: true },
  "/earth/assembly/v1/ballot_inputs": {
    scope: b64([1]), excluded_dsc: b64(new Uint8Array(32)), max_activation: "1700000000",
    round: "0", ballot_id: "4", excluded_country: field("FR"),
  },
  "/earth/assembly/v1/removal_ballots": { ballots: [{ option_id: "2", ballot_id: "9", closes_at: "1800000000", opened_at: "1700000000", tally: { yes: "1" } }] },
  "/earth/shielded/v1/tree": { tree_size: "40", root: "deadbeef", anchor: { root: b64([0xbe, 0xef]), height: "99", time: "1700000000", tree_size: "38" } },
  "/earth/shielded/v1/turnstiles": { turnstiles: [{ denom: "uanml", in: "5000000", out: "1000000" }] },
  "/earth/shielded/v1/assets": { assets: [{ denom: "uerth", asset_id: b64([1]) }, { denom: "uanml", asset_id: b64([2]) }] },
  "/earth/shieldedstaking/v1/epoch": { epoch: { number: "8", start_time: "100", end_time: "86500" } },
  "/earth/shieldedstaking/v1/validators/earthvaloper1v": {
    state: { validator: "earthvaloper1v", pending_delegation: "5", pending_undelegation: "0", epoch_rate: "1.010000000000000000" },
    rate: "1.020000000000000000", supply: "1000", backing: "1020",
  },
  "/earth/shieldedstaking/v1/positions": { positions: [{ id: "1", validator: "earthvaloper1v", derth: "10", weight: "11", splits: [{ option_id: "3", percent: "100" }] }], pagination: { next_key: null } },
  "/cosmos/gov/v1/proposals": { proposals: [
    { id: "3", title: "Old", status: "PROPOSAL_STATUS_PASSED", messages: [], total_deposit: [{ denom: "uerth", amount: "5" }], final_tally_result: { yes_count: "1" } },
    { id: "4", title: "New", status: "PROPOSAL_STATUS_VOTING_PERIOD", expedited: true, messages: [{ "@type": "/earth.pki.v1.MsgRevokeDsc" }], total_deposit: [] },
  ] },
};

globalThis.fetch = async (url) => {
  const path = String(url).replace(/^.*?(\/(cosmos|earth)\/)/, "$1").split("?")[0];
  const route = routes[path];
  const body = typeof route === "function" ? route(new URL(String(url), "http://lcd").searchParams) : route;
  if (!body) return { ok: false, status: 404, text: async () => "unstubbed " + path };
  return { ok: true, json: async () => body };
};
console.warn = () => {};

const personhood = await import("../src/chain/personhood.js");
const assembly = await import("../src/chain/assembly.js");
const shielded = await import("../src/chain/shielded.js");
const ss = await import("../src/chain/shieldedStaking.js");
const gov = await import("../src/chain/gov.js");
const bytes = await import("../src/chain/bytes.js");

let bad = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? " — " + detail : ""}`);
  if (!cond) bad++;
};

check("registration count", (await personhood.registrationCount()) === 12);
check("caretaker voter count", (await personhood.caretakerVoterCount()) === 7);
const tree = await personhood.identityTree();
check("identity tree root is hex", tree.size === 15 && tree.latestRoot === "abcd", JSON.stringify(tree));
const reg = await personhood.registrationByNullifier("0x0A0B");
check("registration by nullifier", reg.registered && reg.leafIndex === 3 && reg.dscKey === "010203" && reg.country === "DE", JSON.stringify(reg));
check("malformed nullifier is null", (await personhood.registrationByNullifier("xyz")) === null);
check("unknown failure reads as null, not unregistered", (await personhood.registrationByNullifier("ff")) === null);
const ref = await personhood.referrer("earth1abc");
check("referrer binding", ref.live && ref.expiresAt === 1800000000);
const pp = await personhood.params();
check("zero params fall back to chain defaults", pp.caretakerVoteSeconds === 30 * 86400 && pp.identityRootWindowSeconds === 3600);

const t = await assembly.proposalTally(4);
check("human tally", t.yes === 9 && t.no === 2 && t.approved);
const bi = await assembly.ballotInputs({ proposalId: 4 });
check("excluded country decodes from its field", bi.excludedCountry === "FR", bi.excludedCountry);
check("an all-zero excluded_dsc reads as none", bi.excludedDsc === "");
check("countryFromField of zero is none", bytes.countryFromField(field("")) === "");
const rb = await assembly.removalBallots();
check("removal ballot defaults a missing no to 0", rb[0].yes === 1 && rb[0].no === 0);

const st = await shielded.tree();
check("note tree", st.size === 40 && st.anchor.root === "beef" && st.anchor.height === 99);
const ts = await shielded.turnstiles();
check("turnstile held = in - out", ts[0].held === "4000000", ts[0].held);
check("assets", (await shielded.assets()).length === 2);

const ep = await ss.epoch();
check("epoch", ep.number === 8 && ep.endTime === 86500);
const book = await ss.validator("earthvaloper1v");
check("validator book", book.rate === 1.02 && book.epochRate === 1.01 && book.backing === "1020");
check("a failed book read is null", (await ss.validator("earthvaloper1x")) === null);
const pos = await ss.positions();
check("positions", pos.length === 1 && pos[0].splits[0].optionId === 3);
check("no snapshot before voting", (await ss.snapshot(3)) === null);

const ps = await gov.proposals();
check("proposals newest first", ps[0].id === 4 && ps[0].expedited && ps[0].messages[0] === "MsgRevokeDsc");
check("deposit picks uerth", ps[1].totalDeposit === "5");
const v = gov.msgVote("earth1abc", 4, gov.VOTE_YES);
check("gov v1 vote carries a bigint id", v.value.proposalId === 4n && v.typeUrl === "/cosmos.gov.v1.MsgVote");

// x/dex quotes: the chain's SimulateSwapExactIn when the node serves it,
// else the local maths over the pool reserves.
const dex = await import("../src/chain/dex.js");
routes["/earth/dex/v1/pool"] = { pool: [{ pool_id: "1", reserve_erth: { denom: "uerth", amount: "1000000" }, reserve_token: { denom: "uanml", amount: "1000000" } }] };
routes["/earth/dex/v1/params"] = { params: { swap_fee: "0.300000000000000000" } };
const localAnml = dex.exactHubToToken("1000000", "1000000", "10000", "0.3").out;
check("no simulation: buy-ANML quote is the local maths", (await dex.quoteBuyAnml("10000")) === localAnml, String(localAnml));
const localSwap = await dex.quoteSwap("10000", "uerth", "uanml");
check("no simulation: swap quote is the local maths", Math.abs(localSwap - Number(localAnml)) < 2, String(localSwap));
let asked;
routes["/earth/dex/v1/simulate_swap_exact_in"] = (q) => {
  asked = Object.fromEntries(q);
  return { token_out: { denom: q.get("ask_denom"), amount: "9950" }, fee: { denom: "uerth", amount: "30" }, erth_burned: "15" };
};
const sim = await dex.simulateSwapExactIn("10000", "uerth", "uanml");
check("simulation parsed", sim.out === 9950n && sim.fee === 30n && sim.burn === 15n, JSON.stringify(asked));
check("simulation query names offer and ask", asked.offer_denom === "uerth" && asked.offer_amount === "10000" && asked.ask_denom === "uanml");
check("buy-ANML quote is the chain's", (await dex.quoteBuyAnml("10000")) === 9950n);
check("swap quote is the chain's", (await dex.quoteSwap("10000", "uerth", "uanml")) === 9950);
check("a non-positive amount is not asked", (await dex.simulateSwapExactIn("0", "uerth", "uanml")) === null);
routes["/earth/dex/v1/simulate_swap_exact_in"] = () => ({ token_out: { denom: "uanml", amount: "0" }, fee: { denom: "uerth", amount: "0" } });
check("a zero simulation falls back", (await dex.quoteBuyAnml("10000")) === localAnml);

// The note layer: Poseidon2, pc/cm, erthz addresses, note ciphertexts, MsgShield.
const { run: runNotes } = await import("./check-notes.mjs");
await runNotes(check);

process.exit(bad ? 1 : 0);
