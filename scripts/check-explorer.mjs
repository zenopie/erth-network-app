import { fromBase64, toBech32 } from "@cosmjs/encoding";
import { sha256 } from "@noble/hashes/sha2.js";

// Self-consistent stub: derive each validator's consensus address the same way
// the chain does, so the staking<->slashing join under test actually resolves.
const valcons = (pk) => toBech32("earthvalcons", sha256(fromBase64(pk)).slice(0, 20));
const PK = {
  healthy: "2ehyWPPhiRNArHaNXE8mq/uUg/j1+WO45WKIXSk/3O8=",
  degraded: "pctWfL2A3TST4C7f8gciR+J+Rst4Cs5IFXblqyiELTE=",
  jailed:   "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
};

// Shapes copied from the live 3-validator run.
const routes = {
  "/cosmos/slashing/v1beta1/params": {
    params: { signed_blocks_window: "100", min_signed_per_window: "0.500000000000000000",
              downtime_jail_duration: "600s", slash_fraction_double_sign: "0.050000000000000000",
              slash_fraction_downtime: "0.010000000000000000" },
  },
  "/cosmos/staking/v1beta1/validators": {
    validators: [
      { operator_address: "earthvaloper1healthy", description: { moniker: "healthy" }, tokens: "300000000",
        status: "BOND_STATUS_BONDED", jailed: false, consensus_pubkey: { key: PK.healthy },
        commission: { commission_rates: { rate: "0.1", max_rate: "0.2" } } },
      { operator_address: "earthvaloper1degraded", description: { moniker: "degraded" }, tokens: "100000000",
        status: "BOND_STATUS_BONDED", jailed: false, consensus_pubkey: { key: PK.degraded },
        commission: { commission_rates: { rate: "0.1", max_rate: "0.2" } } },
      // The case that motivated the fix: x/slashing zeroes the counter on jailing.
      { operator_address: "earthvaloper1jailed", description: { moniker: "jailed" }, tokens: "49500000",
        status: "BOND_STATUS_UNBONDING", jailed: true, consensus_pubkey: { key: PK.jailed },
        commission: { commission_rates: { rate: "0.1", max_rate: "0.2" } } },
    ],
  },
  "/cosmos/slashing/v1beta1/signing_infos": {
    info: [
      { address: valcons(PK.healthy),  missed_blocks_counter: "0",  tombstoned: false, jailed_until: "1970-01-01T00:00:00Z" },
      { address: valcons(PK.degraded), missed_blocks_counter: "13", tombstoned: false, jailed_until: "1970-01-01T00:00:00Z" },
      { address: valcons(PK.jailed),   missed_blocks_counter: "0",  tombstoned: false, jailed_until: "2026-08-16T03:39:35Z" },
    ],
  },
};
globalThis.fetch = async (url) => {
  const path = String(url).replace(/^.*?(\/cosmos)/, "$1").split("?")[0];
  const body = routes[path];
  if (!body) throw new Error("unstubbed route " + path);
  return { ok: true, json: async () => body };
};

const ex = await import("../src/chain/explorer.js");
const { validators, totalBonded } = await ex.validators();
const by = Object.fromEntries(validators.map((v) => [v.moniker, v]));

let bad = 0;
const check = (name, cond, detail) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); if (!cond) bad++; };

check("healthy validator reports 100%", by.healthy.uptime === 100, `got ${by.healthy.uptime}`);
check("degraded validator reports 87%", by.degraded.uptime === 87, `got ${by.degraded.uptime}`);
check("JAILED validator reports unknown, not 100%", by.jailed.uptime === null, `got ${by.jailed.uptime}`);
check("jailed flag surfaces for the status pill", by.jailed.jailed === true);
check("jailedUntil surfaces", Boolean(by.jailed.jailedUntil));
check("totalBonded excludes the jailed validator", totalBonded === 400000000, `got ${totalBonded}`);
check("voting power recomputed without jailed stake", by.healthy.votingPower === 75, `got ${by.healthy.votingPower}`);

// The block-range query identifies the proposer by hex, while the LCD's
// sdk_block bech32-encodes the same 20 bytes. If the two disagree, blocks
// fetched over RPC silently lose their proposer moniker — which reads as
// missing data rather than a bug, so it gets its own check.
const consHex = Buffer.from(sha256(fromBase64(PK.healthy)).slice(0, 20)).toString("hex").toUpperCase();
check(
  "hex proposer address converts to the same valcons as the LCD",
  ex.valconsFromHex(consHex) === valcons(PK.healthy),
  `${ex.valconsFromHex(consHex)} vs ${valcons(PK.healthy)}`,
);
check("a non-hex proposer is passed through untouched", ex.valconsFromHex("") === "");

process.exit(bad ? 1 : 0);
