// Proof of personhood as the web app reads it (src/chain/personhood.js):
// registration counts and lookups, the identity tree, params, and the lease
// bounds a switched identity waits on. Stubbed LCD; no chain required.
//
// What this guards: a field-name or encoding drift reading as a plausible
// zero or as "not registered" (an unknown failure must read as unknown), and
// a switch wait explained from Params instead of the lease lengths the chain
// enforces, or from bounds outside what any lease can be.
import { check, done, b64, stubLcd } from "./lib.mjs";

const routes = stubLcd({
  "/earth/personhood/v1/registration_count": { count: "12" },
  "/earth/personhood/v1/caretaker_voter_count": { count: "7" },
  "/earth/personhood/v1/identity_tree": { size: "15", latest_root: b64([0xab, 0xcd]), window_seconds: "3600" },
  "/earth/personhood/v1/params": { params: { caretaker_vote_seconds: "0", identity_root_window_seconds: "0" } },
});
console.warn = () => {};

const personhood = await import("../../src/chain/personhood.js");

// ---- registrations ------------------------------------------------------------------
check("registration count", (await personhood.registrationCount()) === 12);
check("caretaker voter count", (await personhood.caretakerVoterCount()) === 7);
const tree = await personhood.identityTree();
check("identity tree root is hex", tree.size === 15 && tree.latestRoot === "abcd", JSON.stringify(tree));
check("no per-nullifier registration lookup (it would tie the asker's IP to a passport)",
  !("registrationByNullifier" in personhood));
check("no referrer lookup left (handles replace it)", !("referrer" in personhood));
const pp = await personhood.params();
check("zero params fall back to chain defaults", pp.caretakerVoteSeconds === 365 * 86400 && pp.identityRootWindowSeconds === 3600 &&
  pp.handleLeaseSeconds === 365 * 86400 && pp.handleRenewalSeconds === 30 * 86400);

// ---- LeaseBounds: what a switched identity waits for -------------------------------
{
  const lb = { block_time: "1800000000", activation_margin_seconds: "86400", handle_lease_seconds: "31536000",
    handle_claim_bound: String(1800000000 - 31536000 - 86400), caretaker_lease_seconds: "63072000",
    caretaker_cast_bound: String(1800000000 - 63072000 - 86400), caretaker_lease_hold_until: "1810000000" };
  routes["/earth/personhood/v1/lease_bounds"] = lb;
  const b = await personhood.leaseBounds();
  check("LeaseBounds read", b && b.handleLeaseSeconds === 31536000 && b.caretakerLeaseSeconds === 63072000 &&
    b.handleClaimBound === 1800000000 - 31536000 - 86400 && b.caretakerLeaseHoldUntil === 1810000000, JSON.stringify(b));
  check("switch wait from LeaseBounds (the held longer caretaker lease, not Params)",
    personhood.switchWaitDays(b, "handle") === 366 && personhood.switchWaitDays(b, "caretaker") === 731 && personhood.switchWaitDays(null, "handle") === null);
  routes["/earth/personhood/v1/lease_bounds"] = { ...lb, handle_claim_bound: "5" };
  check("inconsistent LeaseBounds refused", (await personhood.leaseBounds()) === null);
  routes["/earth/personhood/v1/lease_bounds"] = { ...lb, handle_lease_seconds: "-1" };
  check("malformed LeaseBounds refused", (await personhood.leaseBounds()) === null);
  // Spec §4h: leases in 1 s..10 years, the margin in 0..10 years.
  const TEN = 10 * 365 * 86400;
  const lbWith = (o) => {
    const x = { ...lb, ...o };
    const t = Number(x.block_time), m = Number(x.activation_margin_seconds);
    return { ...x, handle_claim_bound: String(t - Number(x.handle_lease_seconds) - m), caretaker_cast_bound: String(t - Number(x.caretaker_lease_seconds) - m) };
  };
  routes["/earth/personhood/v1/lease_bounds"] = lbWith({ handle_lease_seconds: String(TEN), activation_margin_seconds: String(TEN) });
  check("a 10-year lease and margin are read", (await personhood.leaseBounds()) !== null);
  routes["/earth/personhood/v1/lease_bounds"] = lbWith({ handle_lease_seconds: String(TEN + 1) });
  check("a handle lease over 10 years refused", (await personhood.leaseBounds()) === null);
  routes["/earth/personhood/v1/lease_bounds"] = lbWith({ caretaker_lease_seconds: String(TEN + 1) });
  check("a caretaker lease over 10 years refused", (await personhood.leaseBounds()) === null);
  routes["/earth/personhood/v1/lease_bounds"] = lbWith({ activation_margin_seconds: String(TEN + 1) });
  check("a margin over 10 years refused", (await personhood.leaseBounds()) === null);
  delete routes["/earth/personhood/v1/lease_bounds"];
  check("no LeaseBounds served: null", (await personhood.leaseBounds()) === null);
}

done();
