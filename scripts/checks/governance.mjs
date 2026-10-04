// Governance and the funds: x/gov proposals and votes, the assembly (the
// human chamber), and x/allocation's two streams (src/chain/{gov,assembly,
// allocation}.js), against stubbed LCD answers shaped like the chain's
// grpc-gateway JSON, plus the pages that show them. No chain required.
//
// What this guards: a field-name or encoding drift reading as a plausible
// zero (bytes arrive base64 and are shown hex, uint64 arrives as a string, a
// CountryField is a 32-byte big-endian element whose last two bytes are the
// ISO code); a live human tally shown for a closed round (the chain keeps
// none after voting); an option list cut short and its shares taken against
// what was loaded; and a split the chain's ValidateSplit would refuse after
// taking the fee.
import { check, done, b64, stubLcd } from "./lib.mjs";
import { readFileSync } from "node:fs";
import { fromBech32, toBech32 } from "@cosmjs/encoding";

const field = (cc) => {
  const b = new Uint8Array(32);
  if (cc) [b[30], b[31]] = [cc.charCodeAt(0), cc.charCodeAt(1)];
  return b64(b);
};

const routes = stubLcd({
  "/earth/assembly/v1/proposal_tally/4": { tally: { yes: "9", no: "2" }, approved: true },
  "/earth/assembly/v1/ballot_inputs": {
    scope: b64([1]), excluded_dsc: b64(new Uint8Array(32)), max_activation: "1700000000",
    round: "0", ballot_id: "4", excluded_country: field("FR"),
  },
  "/earth/assembly/v1/removal_ballots": { ballots: [{ option_id: "2", ballot_id: "9", closes_at: "1800000000", opened_at: "1700000000", tally: { yes: "1" } }] },
  "/cosmos/gov/v1/proposals": { proposals: [
    { id: "3", title: "Old", status: "PROPOSAL_STATUS_PASSED", messages: [], total_deposit: [{ denom: "uerth", amount: "5" }], final_tally_result: { yes_count: "1" } },
    { id: "4", title: "New", status: "PROPOSAL_STATUS_VOTING_PERIOD", expedited: true, messages: [{ "@type": "/earth.pki.v1.MsgRevokeDsc" }], total_deposit: [] },
  ] },
});
console.warn = () => {};

const assembly = await import("../../src/chain/assembly.js");
const gov = await import("../../src/chain/gov.js");
const bytes = await import("../../src/chain/bytes.js");
const al = await import("../../src/chain/allocation.js");

// ---- the assembly ---------------------------------------------------------------
{
  const t = await assembly.proposalTally(4);
  check("human tally", t.yes === 9 && t.no === 2 && t.approved);
  const bi = await assembly.ballotInputs({ proposalId: 4 });
  check("excluded country decodes from its field", bi.excludedCountry === "FR", bi.excludedCountry);
  check("ballot bounds: activation unbounded from 4a663d5 on, predecessor read", bi.maxActivation === 1700000000 && bi.maxPredecessor === null);
  check("no bound reads as null", assembly.boundOf("9223372036854775807") === null && assembly.boundOf("1700000000") === 1700000000 && assembly.boundOf("x") === null);
  check("an all-zero excluded_dsc reads as none", bi.excludedDsc === "");
  check("countryFromField of zero is none", bytes.countryFromField(field("")) === "");
  const rb = await assembly.removalBallots();
  check("removal ballot defaults a missing no to 0", rb[0].yes === 1 && rb[0].no === 0);

  const prev = routes["/earth/assembly/v1/ballot_inputs"];
  routes["/earth/assembly/v1/ballot_inputs"] = { ...prev, round: "1" };
  check("a demoted expedited proposal reads round 1", (await assembly.ballotInputs({ proposalId: 4 })).round === 1);
  routes["/earth/assembly/v1/ballot_inputs"] = prev;
}

// ---- x/gov --------------------------------------------------------------------------
{
  const ps = await gov.proposals();
  check("proposals newest first", ps[0].id === 4 && ps[0].expedited && ps[0].messages[0] === "MsgRevokeDsc");
  check("deposit picks uerth", ps[1].totalDeposit === "5");
  const v = gov.msgVote("earth1abc", 4, gov.VOTE_YES);
  check("gov v1 vote carries a bigint id", v.value.proposalId === 4n && v.typeUrl === "/cosmos.gov.v1.MsgVote");
}

// ---- Groundworks voters: one weighted voter per validator, key "gwpos/" || val
// bytes, queried as that key's bech32 under the account prefix.
{
  const val = toBech32("earthvaloper", new Uint8Array(20).fill(5));
  const vaddr = al.validatorVoterAddress(val);
  const vkey = fromBech32(vaddr, 90);
  check("validator voter key is earth-prefixed \"gwpos/\" || 20 val bytes (26 bytes)",
    vkey.prefix === "earth" && vkey.data.length === 26 &&
    new TextDecoder().decode(vkey.data.slice(0, 6)) === "gwpos/" && vkey.data.slice(6).every((b) => b === 5));
  routes[`/earth/allocation/v1/voter/STREAM_ID_GROUNDWORKS/${vaddr}`] = {
    voter: { percentages: [], weight: "303", epoch: "2", option_weights: [{ option_id: "3", weight: "202" }, { option_id: "4", weight: "101" }] },
  };
  const vv = await al.validatorVoter(val);
  check("validator voter: absolute weight per option, weight their sum",
    vv.weight === "303" && vv.epoch === 2 && vv.splits.length === 0 &&
    vv.optionWeights.map((w) => `${w.optionId}:${w.weight}`).join() === "3:202,4:101", JSON.stringify(vv));
  const none = await al.validatorVoter(toBech32("earthvaloper", new Uint8Array(20).fill(6)));
  check("a validator with no live positions reads as zero weight", none.weight === "0" && none.optionWeights.length === 0);

  // A validator that has never set a split: the voter query 404s, and the weight
  // it would vote with is its self-bond, not zero (else it could never vote).
  const acct = toBech32("earth", new Uint8Array(20).fill(8));
  const ownVal = toBech32("earthvaloper", new Uint8Array(20).fill(8));
  routes[`/cosmos/staking/v1beta1/validators/${ownVal}/delegations/${acct}`] = {
    delegation_response: { balance: { denom: "uerth", amount: "5000000" } },
  };
  routes[`/cosmos/staking/v1beta1/validators/${ownVal}`] = { validator: { operator_address: ownVal, status: "BOND_STATUS_BONDED" } };
  const gv = await al.groundworksVoter(acct, { streamEpoch: 3 });
  check("no voter yet: weight from self-bond, not zero", !gv.exists && !gv.stale && gv.weight === "5000000" && gv.splits.length === 0,
    JSON.stringify(gv));
  routes[`/earth/allocation/v1/voter/STREAM_ID_GROUNDWORKS/${acct}`] = {
    voter: { percentages: [{ option_id: "3", percent: "100" }], weight: "0", epoch: "2" },
  };
  const st = await al.groundworksVoter(acct, { streamEpoch: 3 });
  check("voter epoch < stream epoch: stale split kept, weight from self-bond",
    st.exists && st.stale && st.epoch === 2 && st.splits[0].optionId === 3 && st.weight === "5000000", JSON.stringify(st));
  routes[`/earth/allocation/v1/voter/STREAM_ID_GROUNDWORKS/${acct}`].voter.weight = "4000000";
  routes[`/earth/allocation/v1/voter/STREAM_ID_GROUNDWORKS/${acct}`].voter.epoch = "3";
  const cur = await al.groundworksVoter(acct, { streamEpoch: 3 });
  check("current voter: its own weight", cur.exists && !cur.stale && cur.weight === "4000000");
  check("bonded validator reads as bonded", al.validatorBonded(cur) && cur.validatorStatus === "BOND_STATUS_BONDED");
  // Weight counts self-bond at Bonded validators only (chain fd79d39): a
  // jailed, unbonding or unbonded validator's operator has none, whatever its
  // self-bond or its record says, so Save stays off instead of failing with
  // ErrNoWeight at deliver.
  for (const status of ["BOND_STATUS_UNBONDING", "BOND_STATUS_UNBONDED"]) {
    routes[`/cosmos/staking/v1beta1/validators/${ownVal}`].validator.status = status;
    const off = await al.groundworksVoter(acct, { streamEpoch: 3 });
    check(`${status}: zero weight despite record and self-bond`,
      off.weight === "0" && off.validatorStatus === status && !al.validatorBonded(off), JSON.stringify(off));
    delete routes[`/earth/allocation/v1/voter/STREAM_ID_GROUNDWORKS/${acct}`];
    const fresh = await al.groundworksVoter(acct, { streamEpoch: 3 });
    check(`${status}: no voter yet, zero weight despite self-bond`, fresh.weight === "0" && !fresh.exists, JSON.stringify(fresh));
    routes[`/earth/allocation/v1/voter/STREAM_ID_GROUNDWORKS/${acct}`] = {
      voter: { percentages: [{ option_id: "3", percent: "100" }], weight: "4000000", epoch: "3" },
    };
  }
  routes[`/cosmos/staking/v1beta1/validators/${ownVal}`].validator.status = "BOND_STATUS_BONDED";
  const nobody = await al.groundworksVoter(toBech32("earth", new Uint8Array(20).fill(9)));
  check("no voter and no validator: zero", nobody.weight === "0" && !nobody.exists && nobody.validatorStatus === "");
}

// ---- options: paged until next_key is empty; a failed later page, a repeated
// key or the page guard marks the list partial; the stream total is the
// chain's, not the loaded sum.
{
  const P = "/earth/allocation/v1/options/STREAM_ID_GROUNDWORKS";
  const opt = (i) => ({ id: String(i), description: `o${i}`, amount_allocated: "1", kind: "ALLOCATION_KIND_ADDRESS" });
  let pages = 30, failAt = -1, loopAt = -1;
  routes[P] = (q) => {
    const at = Number(q.get("pagination.key") ? atob(q.get("pagination.key")) : "0");
    if (at === failAt) return null;
    const next = at + 1 < pages ? btoa(String(loopAt >= 0 && at >= loopAt ? loopAt : at + 1)) : null;
    return { options: Array.from({ length: 100 }, (_, i) => opt(at * 100 + i)), total_weight: "999999", epoch: "2", pagination: { next_key: next } };
  };
  let v = await al.streamView(al.STREAM_GROUNDWORKS);
  check("options past 2000 are read (3000 of 3000)", v.options.length === 3000 && v.partial === false && v.totalWeight === "999999" && v.epoch === 2);
  failAt = 25;
  v = await al.streamView(al.STREAM_GROUNDWORKS);
  check("a failed later page is partial, not complete", v.partial === true && v.options.length === 2500);
  failAt = -1; loopAt = 5;
  v = await al.streamView(al.STREAM_GROUNDWORKS);
  check("a repeated page key is partial", v.partial === true);
  loopAt = -1;
  v = await al.streamView(al.STREAM_GROUNDWORKS, { maxPages: 10 });
  check("the page guard is partial", v.partial === true && v.options.length === 1000);
  check("the guard is far above 2000 options", al.MAX_OPTION_PAGES * 100 >= 100000);
  failAt = 0;
  check("a failed first page is null", (await al.streamView(al.STREAM_GROUNDWORKS)) === null);
  delete routes[P];
}

// ---- splits: every entry an integer 1..100, distinct, summing to 100 --------------
{
  const sp = (...ps) => al.splitProblem(ps.map((p, i) => ({ optionId: i + 1, percent: p })));
  check("100 and 60/40 are accepted", sp(100) === null && sp("60", "40") === null);
  check("zero, negative, fractional, empty and >100 shares are refused",
    sp(100, 0) !== null && sp(150, -50) !== null && sp("50.5", "49.5") !== null && sp("", 100) !== null && sp(101) !== null && sp("1e2") !== null);
  check("a sum other than 100 is refused", sp(50, 49) !== null && sp() !== null);
  check("a duplicate option is refused", al.splitProblem([{ optionId: 1, percent: 50 }, { optionId: 1, percent: 50 }]) !== null);
  check("more than 20 options refused", al.splitProblem(Array.from({ length: 21 }, (_, i) => ({ optionId: i, percent: i ? 5 : 0 }))) !== null);
  let threw = false;
  try { al.msgSetAllocations("earth1x", al.STREAM_GROUNDWORKS, [{ optionId: 1, percent: 150 }, { optionId: 2, percent: -50 }]); } catch { threw = true; }
  check("msgSetAllocations refuses an invalid split", threw);
}

// ---- the pages (source checks; run from the app root) ------------------------------
{
  const govSrc = readFileSync("src/pages/Governance.jsx", "utf8");
  // The human tally is read only while the proposal is voting: a closed
  // round's ballot is gone and the query answers a zero tally.
  const tallyCalls = govSrc.match(/[^\n]*assembly\.proposalTally\([^\n]*/g) ?? [];
  check("proposalTally only under isVoting", tallyCalls.length === 1 && /isVoting \? assembly\.proposalTally/.test(tallyCalls[0]), tallyCalls.join(" | "));
  check("a closed proposal renders no live human tally", /isVoting \?\s*\(\s*<HumanTally/.test(govSrc) && /<ClosedHumanTally/.test(govSrc));
  const afSrc = readFileSync("src/components/AllocationFund.jsx", "utf8");
  check("Set Allocation is gated on splitProblem", /disabled=\{isSubmitting \|\| Boolean\(splitProblem\)/.test(afSrc) && !/parseInt\(value/.test(afSrc));
}

done();
