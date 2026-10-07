// The explorer (src/chain/explorer.js, src/chain/address.js) against stubbed
// LCD responses. No chain required.
//
// What this guards: a jailed validator reporting 100% uptime because
// x/slashing zeroed its missed-block counter; a proposer that loses its
// moniker because the RPC names it by hex and the LCD by bech32; an address
// in another case searched as another account; and a route parameter (an
// address, height or hash from the URL) reaching a CometBFT query string in
// any shape but its exact one.
import { check, done } from "./lib.mjs";
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
// Two pages each for validators and signing infos: the walk must follow
// next_key (validator creation is permissionless, so one page can be flooded).
const pageReads = {};
for (const [path, field] of [["/cosmos/staking/v1beta1/validators", "validators"], ["/cosmos/slashing/v1beta1/signing_infos", "info"]]) {
  const all = routes[path][field];
  routes[path] = (q) => {
    pageReads[path] = (pageReads[path] ?? 0) + 1;
    return q.has("pagination.key")
      ? { [field]: all.slice(2), pagination: { next_key: null } }
      : { [field]: all.slice(0, 2), pagination: { next_key: "cGFnZTI=" } };
  };
}
globalThis.fetch = async (url) => {
  const [rawPath, query = ""] = String(url).replace(/^.*?(\/cosmos)/, "$1").split("?");
  const route = routes[rawPath];
  if (!route) throw new Error("unstubbed route " + rawPath);
  const body = typeof route === "function" ? route(new URLSearchParams(query)) : route;
  return { ok: true, json: async () => body };
};

const ex = await import("../../src/chain/explorer.js");
const { validators, totalBonded, partial } = await ex.validators();
const by = Object.fromEntries(validators.map((v) => [v.moniker, v]));

check("validators and signing infos: every page walked",
  validators.length === 3 && partial === false &&
  pageReads["/cosmos/staking/v1beta1/validators"] === 2 && pageReads["/cosmos/slashing/v1beta1/signing_infos"] === 2,
  JSON.stringify({ n: validators.length, partial, pageReads }));

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

// Canonical lowercase bech32: an all-uppercase spelling of an address is the
// same bytes, and is searched and queried as the lowercase one; mixed case,
// a wrong prefix or a bad checksum is not an address.
const addrMod = await import("../../src/chain/address.js");
const lower = toBech32("earth", new Uint8Array(20).fill(7));
check("canonicalAddress keeps a lowercase address", addrMod.canonicalAddress(lower) === lower);
check("canonicalAddress lowercases an all-uppercase address", addrMod.canonicalAddress(lower.toUpperCase()) === lower);
check("canonicalAddress refuses mixed case, other prefixes, bad checksums",
  addrMod.canonicalAddress(lower.slice(0, 10) + lower.slice(10).toUpperCase()) === null &&
  addrMod.canonicalAddress(toBech32("cosmos", new Uint8Array(20))) === null &&
  addrMod.canonicalAddress(lower.slice(0, -1) + (lower.endsWith("q") ? "p" : "q")) === null);
check("search routes an uppercase address to its canonical account",
  ex.classifySearch(lower.toUpperCase())?.value === lower && ex.classifySearch(lower)?.kind === "account");

// Route params reach CometBFT query strings: only their exact shape passes.
{
  const asked = [];
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
}

// Latest transactions: no range search (the public LCD refuses
// `tx.height>0`), one tx.height=N search per block with txs, older blocks
// over /blockchain only when the newest hold too few, completed blocks cached,
// and a bounded number of searches per load.
{
  const asked = [];
  const nTxs = { 100: 2, 98: 1, 80: 1, 79: 1, 60: 1, 45: 9 };
  const tx = (h, i) => ({ txhash: `${h}`.padStart(4, "0") + `${i}`.padStart(60, "0"), height: String(h), code: 0, timestamp: "" });
  let indexLag = 0; // the newest block's txs not yet in the index
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    asked.push(u.pathname + "?" + decodeURIComponent(u.search.slice(1)));
    if (u.pathname.endsWith("/blockchain")) {
      const min = Number(u.searchParams.get("minHeight")), max = Number(u.searchParams.get("maxHeight"));
      const metas = [];
      for (let h = max; h >= Math.max(min, max - 19); h--) metas.push({ header: { height: String(h) }, num_txs: String(nTxs[h] ?? 0) });
      return { ok: true, json: async () => ({ result: { block_metas: metas } }) };
    }
    const q = u.searchParams.get("query") ?? "";
    const m = /^tx\.height=(\d+)$/.exec(q);
    const h = m ? Number(m[1]) : 0;
    const n = Math.max(0, (nTxs[h] ?? 0) - (h === 100 ? indexLag : 0));
    return { ok: true, json: async () => ({ tx_responses: Array.from({ length: n }, (_, i) => tx(h, i)), txs: [] }) };
  };
  const recent = [];
  for (let h = 100; h > 90; h--) recent.push({ height: h, txCount: nTxs[h] ?? 0 });

  indexLag = 1;
  const first = await ex.recentTxs(10, recent);
  const searches = asked.filter((a) => a.includes("/cosmos/tx/v1beta1/txs?"));
  check("recentTxs never asks for a range search",
    searches.every((a) => /query=tx\.height=\d+&/.test(a)) && !asked.some((a) => a.includes(">")), asked.join(" | "));
  check("recentTxs reads older metas over /blockchain within the window",
    asked.some((a) => a.startsWith("/blockchain?minHeight=71&maxHeight=90")) &&
    asked.some((a) => a.startsWith("/blockchain?minHeight=51&maxHeight=70")) &&
    asked.some((a) => a.startsWith("/blockchain?minHeight=41&maxHeight=50")) &&
    asked.filter((a) => a.startsWith("/blockchain")).length === 3, asked.join(" | "));
  check("recentTxs searches only blocks with txs, newest first, at most 5",
    searches.map((a) => /tx\.height=(\d+)/.exec(a)[1]).join(",") === "100,98,80,79,60",
    searches.join(" | "));
  check("recentTxs returns newest first, capped at the limit, with the window",
    first.txs.length === 5 && first.txs[0].height === 100 && first.txs.at(-1).height === 60 && first.blocks === 60,
    JSON.stringify({ n: first.txs.length, blocks: first.blocks }));

  asked.length = 0;
  indexLag = 0;
  const second = await ex.recentTxs(10, recent);
  const again = asked.filter((a) => a.includes("/cosmos/tx/v1beta1/txs?")).map((a) => /tx\.height=(\d+)/.exec(a)[1]);
  check("a block the index had not caught up with is searched again; complete ones are cached",
    again.join(",") === "100,45" && second.txs.length === 10 && second.txs.filter((t) => t.height === 100).length === 2 &&
    second.txs.at(-1).height === 45,
    again.join(","));

  asked.length = 0;
  for (const h of [97, 96, 95, 94, 93, 92]) nTxs[h] = 1;
  const busy = [];
  for (let h = 100; h > 90; h--) busy.push({ height: h, txCount: nTxs[h] ?? 0 });
  await ex.recentTxs(10, busy);
  check("recentTxs makes at most 5 uncached searches per load",
    asked.filter((a) => a.includes("/cosmos/tx/v1beta1/txs?")).map((a) => /tx\.height=(\d+)/.exec(a)[1]).join(",") === "97,96,95,94,93",
    asked.join(" | "));
}

done();
