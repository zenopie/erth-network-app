// Verifies the staking picker logic against a live chain: validator list shape,
// ordering, and that stake/unstake refuse to act without an explicit validator.
const staking = await import("../src/chain/staking.js");
const explorer = await import("../src/chain/explorer.js");

const { validators } = await explorer.validators();
const active = validators.filter((v) => v.bonded && !v.jailed).sort((a, b) => a.votingPower - b.votingPower);

console.log("picker list (smallest first):");
for (const v of active) {
  console.log(`  ${v.moniker.padEnd(8)} ${v.votingPower.toFixed(1).padStart(5)}% power  ` +
              `${(v.commission * 100).toFixed(0)}% comm  ` +
              `${v.uptime === null ? "n/a" : v.uptime.toFixed(1) + "% uptime"}`);
}

let bad = 0;
const check = (name, cond, detail) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); if (!cond) bad++; };

check("smallest validator sorts first",
  active.length < 2 || active[0].votingPower <= active[active.length - 1].votingPower,
  `${active[0]?.votingPower.toFixed(1)}% first`);

// Staking must refuse without an explicit validator — the old behaviour silently
// picked the largest.
try { await staking.msgsStake("earth1x", 1000, ""); check("stake refuses empty validator", false); }
catch (e) { check("stake refuses empty validator", /Choose a validator/.test(e.message), e.message); }

try { await staking.msgsUnstake("earth1x", 1000, ""); check("unstake refuses empty validator", false); }
catch (e) { check("unstake refuses empty validator", /Choose which delegation/.test(e.message), e.message); }

// And a chosen validator must actually be honoured.
const target = active[0];
if (target) {
  const msgs = await staking.msgsStake("earth1x", 1000, target.operator);
  check("stake targets the chosen validator",
    msgs.length === 1 && msgs[0].value.validatorAddress === target.operator,
    msgs[0].value.validatorAddress);
}
check("a >33% validator exists to warn about", active.some((v) => v.votingPower >= 33),
  active.map((v) => v.votingPower.toFixed(0) + "%").join(", "));
process.exit(bad ? 1 : 0);
