// Verifies the staking chain layer.
//
// Offline: the operator-only message builders. Only a validator's own operator
// may delegate transparently on this chain, so every builder derives the
// validator from the signing account rather than taking one — a builder that
// could target another validator would build a tx the ante handler refuses.
//
// Live (when VITE_EARTH_LCD points at a node): the validator list and each
// validator's private-staking book from x/shieldedstaking.
const staking = await import("../src/chain/staking.js");
const shieldedStaking = await import("../src/chain/shieldedStaking.js");
const explorer = await import("../src/chain/explorer.js");

let bad = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) bad++;
};

const { toBech32 } = await import("@cosmjs/encoding");
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

process.exit(bad ? 1 : 0);
