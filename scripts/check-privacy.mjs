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
    state: { validator: "earthvaloper1v", pending_delegation: "5", pending_undelegation: "0", epoch_rate: "1.010000000000000000", derth_supply: "1000" },
    rate: "1.020000000000000000", supply: "1000", backing: "1020",
  },
  // derth is no coin: a node that leaves out the top-level supply still has the book entry.
  "/earth/shieldedstaking/v1/validators/earthvaloper1w": {
    state: { validator: "earthvaloper1w", derth_supply: "77", epoch_rate: "1" }, rate: "1", backing: "77",
  },
  "/earth/shieldedstaking/v1/stake_tree": { size: "12", root: b64([0xab, 0xcd]) },
  "/earth/shieldedstaking/v1/positions": { positions: [{ id: "1", validator: "earthvaloper1v", derth: "10", weight: "11", splits: [{ option_id: "3", percent: "100" }], owner_tag: b64([0x0a, 0x0b]), split_epoch: "2" }], pagination: { next_key: null } },
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
check("no referrer lookup left (handles replace it)", !("referrer" in personhood));
const pp = await personhood.params();
check("zero params fall back to chain defaults", pp.caretakerVoteSeconds === 365 * 86400 && pp.identityRootWindowSeconds === 3600 &&
  pp.handleLeaseSeconds === 365 * 86400 && pp.handleRenewalSeconds === 30 * 86400);

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
check("derth supply from the staking book", book.supply === "1000" && (await ss.validator("earthvaloper1w")).supply === "77");
check("stake tree", (await ss.stakeTree()).size === 12 && (await ss.stakeTree()).root === "abcd");
check("a failed book read is null", (await ss.validator("earthvaloper1x")) === null);
const pos = await ss.positions();
check("positions", pos.length === 1 && pos[0].splits[0].optionId === 3 && pos[0].ownerTag === "0a0b");
check("position carries its split epoch and the query's live weight", pos[0].splitEpoch === 2 && pos[0].weight === "11");
check("params: no max_positions", !("maxPositions" in ((await ss.params()) ?? {})));

// Groundworks: one weighted voter per validator, key "gwpos/" || val bytes,
// queried as that key's bech32 under the account prefix.
const alloc = await import("../src/chain/allocation.js");
const { fromBech32, toBech32 } = await import("@cosmjs/encoding");
const val = toBech32("earthvaloper", new Uint8Array(20).fill(5));
const vaddr = alloc.validatorVoterAddress(val);
const vkey = fromBech32(vaddr, 90);
check("validator voter key is earth-prefixed \"gwpos/\" || 20 val bytes (26 bytes)",
  vkey.prefix === "earth" && vkey.data.length === 26 &&
  new TextDecoder().decode(vkey.data.slice(0, 6)) === "gwpos/" && vkey.data.slice(6).every((b) => b === 5));
routes[`/earth/allocation/v1/voter/STREAM_ID_GROUNDWORKS/${vaddr}`] = {
  voter: { percentages: [], weight: "303", epoch: "2", option_weights: [{ option_id: "3", weight: "202" }, { option_id: "4", weight: "101" }] },
};
const vv = await alloc.validatorVoter(val);
check("validator voter: absolute weight per option, weight their sum",
  vv.weight === "303" && vv.epoch === 2 && vv.splits.length === 0 &&
  vv.optionWeights.map((w) => `${w.optionId}:${w.weight}`).join() === "3:202,4:101", JSON.stringify(vv));
const none = await alloc.validatorVoter(toBech32("earthvaloper", new Uint8Array(20).fill(6)));
check("a validator with no live positions reads as zero weight", none.weight === "0" && none.optionWeights.length === 0);
// A validator that has never set a split: the voter query 404s, and the weight
// it would vote with is its self-bond, not zero (else it could never vote).
{
  const acct = toBech32("earth", new Uint8Array(20).fill(8));
  const ownVal = toBech32("earthvaloper", new Uint8Array(20).fill(8));
  routes[`/cosmos/staking/v1beta1/validators/${ownVal}/delegations/${acct}`] = {
    delegation_response: { balance: { denom: "uerth", amount: "5000000" } },
  };
  const gv = await alloc.groundworksVoter(acct, { streamEpoch: 3 });
  check("no voter yet: weight from self-bond, not zero", !gv.exists && !gv.stale && gv.weight === "5000000" && gv.splits.length === 0,
    JSON.stringify(gv));
  routes[`/earth/allocation/v1/voter/STREAM_ID_GROUNDWORKS/${acct}`] = {
    voter: { percentages: [{ option_id: "3", percent: "100" }], weight: "0", epoch: "2" },
  };
  const st = await alloc.groundworksVoter(acct, { streamEpoch: 3 });
  check("voter epoch < stream epoch: stale split kept, weight from self-bond",
    st.exists && st.stale && st.epoch === 2 && st.splits[0].optionId === 3 && st.weight === "5000000", JSON.stringify(st));
  routes[`/earth/allocation/v1/voter/STREAM_ID_GROUNDWORKS/${acct}`].voter.weight = "4000000";
  routes[`/earth/allocation/v1/voter/STREAM_ID_GROUNDWORKS/${acct}`].voter.epoch = "3";
  const cur = await alloc.groundworksVoter(acct, { streamEpoch: 3 });
  check("current voter: its own weight", cur.exists && !cur.stale && cur.weight === "4000000");
  const nobody = await alloc.groundworksVoter(toBech32("earth", new Uint8Array(20).fill(9)));
  check("no voter and no validator: zero", nobody.weight === "0" && !nobody.exists);
}
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

// Groundworks weights are integer strings past 2^53 (rate x derth): the page
// math stays in BigInt. 2^53 + 1 is the first integer Number() cannot hold.
const tk = await import("../src/chain/tokens.js");
{
  const big = "9007199254740993"; // 2^53 + 1
  const w = ["123456789012345678901234567890", "1"];
  check("toBigInt keeps 2^53 + 1 exact; junk is 0", tk.toBigInt(big) === 9007199254740993n &&
    tk.toBigInt("1.5") === 0n && tk.toBigInt("-3") === 0n && tk.toBigInt(undefined) === 0n && tk.toBigInt(1e21) === 0n);
  check("sumBig is exact past 2^53", tk.sumBig([big, big, "1"]) === 18014398509481987n &&
    tk.sumBig(w) === 123456789012345678901234567891n);
  check("Number would have lost it", Number(big) + Number(big) + 1 !== 18014398509481987);
  check("byBigDesc orders weights Number() ties", [big, "9007199254740992", "9007199254740994"].sort(tk.byBigDesc).join() ===
    "9007199254740994,9007199254740993,9007199254740992");
  check("percentString: exact share of a huge total, rounded half up",
    tk.percentString(w[1], w[0]) === "0.0" && tk.percentString(1, 3) === "33.3" && tk.percentString(2, 3) === "66.7" &&
    tk.percentString("50000000000000000000000000001", "100000000000000000000000000000", 4) === "50.0000" &&
    tk.percentString(1, 8, 2) === "12.50" && tk.percentString(5, 0) === null && tk.percentString(3, 3, 0) === "100");
  check("ratio divides exactly before the float", tk.ratio("1", "4") === 0.25 && tk.ratio(big, big) === 1 && tk.ratio(1, 0) === 0 &&
    Math.abs(tk.ratio("123456789012345678901234567890", "246913578024691357802469135780") - 0.5) < 1e-15);
  const fm = tk.formatMacro("123456789012345678901234567", "uerth");
  check("formatMacro: every integer digit of a weight past 2^53", fm.replace(/\D/g, "") === "123456789012345678901" + "234",
    fm);
  check("formatMacro: small amounts as toLocaleString shows them",
    tk.formatMacro("1500000", "uerth") === (1.5).toLocaleString() && tk.formatMacro("0", "uerth") === "0" &&
    tk.formatMacro("1", "uerth") === "0");
}

// Explorer route params reach CometBFT query strings: only their exact shape passes.
{
  const ex = await import("../src/chain/explorer.js");
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    asked.push(decodeURIComponent(String(url)));
    return { ok: true, json: async () => ({ tx_responses: [], txs: [] }) };
  };
  const acct = toBech32("earth", new Uint8Array(20).fill(8));
  const inj = `${acct}' OR tx.height>0 AND message.sender='x`;
  check("txsForAddress refuses a quote-injected address without querying",
    (await ex.txsForAddress(inj)).length === 0 && asked.length === 0, asked.join(" | "));
  await ex.txsForAddress(acct.toUpperCase());
  check("txsForAddress quotes only the canonical address",
    asked.length === 2 && asked.every((u) => u.includes(`='${acct}'`)), asked.join(" | "));
  asked.length = 0;
  check("txsAtHeight refuses junk, signs and > int64",
    (await ex.txsAtHeight("5 OR tx.height>0")).length === 0 && (await ex.txsAtHeight("-1")).length === 0 &&
    (await ex.txsAtHeight("9223372036854775808")).length === 0 && asked.length === 0);
  await ex.txsAtHeight("9223372036854775807");
  check("txsAtHeight accepts int64 max", asked.length === 1 && asked[0].includes("tx.height=9223372036854775807"));
  asked.length = 0;
  check("txByHash refuses a non-hash without querying",
    (await ex.txByHash("../../bank/v1beta1/supply")) === null && (await ex.txByHash("ab")) === null && asked.length === 0);
  check("block refuses a non-height", (await ex.block("1/../../x")) === null && asked.length === 0);
  globalThis.fetch = realFetch;
}

// LCD strings that are not integers do not throw out of the page math.
{
  const tk2 = await import("../src/chain/tokens.js");
  check("toBigInt guards LCD junk", tk2.toBigInt("12.5") === 0n && tk2.toBigInt("1e9") === 0n && tk2.toBigInt(null) === 0n);
  const st = await import("../src/chain/staking.js");
  let threw = "";
  try { st.msgCancelSelfUnbonding(toBech32("earth", new Uint8Array(20).fill(8)), { balance: "1", creationHeight: "12x" }); }
  catch (e) { threw = e.message; }
  check("cancel-unbonding refuses a junk creation height with a readable error", /Unreadable/.test(threw), threw);
}

// The note layer: Poseidon2, pc/cm, erthz addresses, note ciphertexts, MsgShield.
const { run: runNotes } = await import("./check-notes.mjs");
await runNotes(check);

process.exit(bad ? 1 : 0);
