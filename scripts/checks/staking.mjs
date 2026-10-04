// Staking: the operator-only builders (src/chain/staking.js) and the private
// staking reads (src/chain/shieldedStaking.js), against a stubbed LCD.
//
// Only a validator's own operator may delegate transparently on this chain,
// so every builder derives the validator from the signing account rather
// than taking one: a builder that could target another validator would build
// a tx the ante handler refuses. derth is no coin, so its supply is the
// staking book's, never x/bank's.
//
// With VITE_EARTH_LCD pointing at a node, it also reads the live validator
// list and each validator's private-staking book:
//
//   VITE_EARTH_LCD=http://127.0.0.1:1317 npm run check:staking
//
// (the chain repo's ./scripts/testnet-3val.sh gives more than one validator).
import { check, done, b64, stubLcd } from "./lib.mjs";
import { toBech32 } from "@cosmjs/encoding";

const staking = await import("../../src/chain/staking.js");
const shieldedStaking = await import("../../src/chain/shieldedStaking.js");
const explorer = await import("../../src/chain/explorer.js");

// ---- operator builders --------------------------------------------------------------
const acct = toBech32("earth", new Uint8Array(20).fill(1));
const valoper = staking.valoperOf(acct);
check("valoperOf keeps the account bytes", valoper?.startsWith("earthvaloper1"), valoper);

const bond = staking.msgSelfBond(acct, 1000);
check("self-bond targets the operator's own validator",
  bond.value.delegatorAddress === acct && bond.value.validatorAddress === valoper);
const unbond = staking.msgSelfUnbond(acct, 1000);
check("self-unbond targets the operator's own validator", unbond.value.validatorAddress === valoper);
try {
  staking.msgSelfBond("cosmos1notours", 1);
  check("self-bond refuses a non-earth address", false);
} catch {
  check("self-bond refuses a non-earth address", true);
}
const cancel = staking.msgCancelSelfUnbonding(acct, { balance: "5", creationHeight: "42" });
check("cancel carries creation height as int64", cancel.value.creationHeight === 42n);
{
  let threw = "";
  try { staking.msgCancelSelfUnbonding(toBech32("earth", new Uint8Array(20).fill(8)), { balance: "1", creationHeight: "12x" }); }
  catch (e) { threw = e.message; }
  check("cancel-unbonding refuses a junk creation height with a readable error", /Unreadable/.test(threw), threw);
}

check("LegacyDec atomics", staking.decAtomics("0.1") === "100000000000000000" &&
  staking.decAtomics("1") === "1000000000000000000", staking.decAtomics("0.1"));

const key = Buffer.alloc(32, 7).toString("base64");
const cv = staking.msgCreateValidator(acct, {
  moniker: "m", consensusPubkey: key, selfBond: "1000000",
  commissionRate: "0.05", commissionMaxRate: "0.2", commissionMaxChangeRate: "0.01",
});
check("create-validator encodes an ed25519 Any",
  cv.value.pubkey.typeUrl === "/cosmos.crypto.ed25519.PubKey" && cv.value.pubkey.value.length === 34);
try {
  staking.msgCreateValidator(acct, { moniker: "m", consensusPubkey: "AAAA", selfBond: "1",
    commissionRate: "0", commissionMaxRate: "0", commissionMaxChangeRate: "0" });
  check("create-validator refuses a short key", false);
} catch (e) {
  check("create-validator refuses a short key", /32-byte/.test(e.message), e.message);
}

// ---- private staking reads (stubbed) -----------------------------------------------
const realFetch = globalThis.fetch;
const realWarn = console.warn;
{
  stubLcd({
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
  });
  console.warn = () => {};
  const ss = shieldedStaking;
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
  check("no snapshot before voting", (await ss.snapshot(3)) === null);
}
globalThis.fetch = realFetch;
console.warn = realWarn;

// ---- live, when VITE_EARTH_LCD points at a node --------------------------------------
if (process.env.VITE_EARTH_LCD) {
  const { validators } = await explorer.validators();
  const books = await shieldedStaking.validatorBooks(validators.map((v) => v.operator));
  for (const v of validators) {
    const b = books[v.operator];
    console.log(`  ${v.moniker.padEnd(10)} ${v.votingPower.toFixed(1).padStart(5)}%  ` +
      (b ? `rate ${b.rate.toFixed(6)} derth ${b.supply} backing ${b.backing}` : "no private stake"));
  }
  check("validators load", validators.length > 0);
  check("rates parse", Object.values(books).every((b) => b === null || Number.isFinite(b.rate)));
  const ep = await shieldedStaking.epoch();
  check("epoch parses", ep !== null && ep.endTime > ep.startTime, JSON.stringify(ep));
}

done();
