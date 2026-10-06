import { getOr, seg } from "./rest";
import { b64ToHex, normalizeHex } from "./bytes";

/**
 * x/personhood — private proof-of-personhood.
 *
 * A registration names no account. It is keyed by its passport nullifier (the
 * public dedup key) and holds a leaf in the identity tree; everything its
 * holder does afterwards — the daily ANML claim, caretaker splits, assembly
 * votes, handles — is an anonymous membership proof made on the phone. So
 * there is no "my registration" here and nothing is looked up by address.
 * The handle directory (public names for shielded addresses) is read whole,
 * in chain/handles.js.
 */

/** Live registration headcount: the denominator of the caretaker stream. */
export async function registrationCount() {
  const data = await getOr("/earth/personhood/v1/registration_count", null);
  return data ? Number(data.count ?? 0) : null;
}

/** How many caretaker splits currently count (each lapses after R days). */
export async function caretakerVoterCount() {
  const data = await getOr("/earth/personhood/v1/caretaker_voter_count", null);
  return data ? Number(data.count ?? 0) : null;
}

/**
 * The identity tree: leaves ever appended (zeroed ones included), its latest
 * root as hex, and how long a superseded root stays a valid anchor.
 */
export async function identityTree() {
  const data = await getOr("/earth/personhood/v1/identity_tree", null);
  if (!data) return null;
  return {
    size: Number(data.size ?? 0),
    latestRoot: b64ToHex(data.latest_root),
    windowSeconds: Number(data.window_seconds ?? 0),
  };
}

// No lookup by passport nullifier. Only the passport's holder (or someone
// holding its data) knows one, so a per-nullifier query would hand the LCD
// operator and its CDN the asker's IP next to that passport's registration
// (audit W-5). The wallet checks its own registration; the explorer shows
// only aggregates.

/**
 * Registrations per issuing country, as [{ country, count }] with country an
 * ISO 3166-1 alpha-2 code ("" when the verifying CSCA names none). Powers the
 * explorer's registration map.
 */
export async function registrationCountries() {
  const data = await getOr("/earth/personhood/v1/registration_countries", {
    countries: [],
  });
  return (data.countries ?? [])
    .map((c) => ({ country: c.country ?? "", count: Number(c.count ?? 0) }))
    .sort((a, b) => b.count - a.count);
}

/** How many humans registered with a given Document Signer (hex dsc_key). */
export async function registrationsByDsc(dscKeyHex) {
  const key = normalizeHex(dscKeyHex);
  if (!key) return null;
  const data = await getOr(seg`/earth/personhood/v1/registrations_by_dsc/${key}`, null);
  return data ? Number(data.count ?? 0) : null;
}

/**
 * Module params, with the few the UI explains pulled out. caretakerVoteSeconds
 * is R: how long a caretaker split lasts (manual renewal; default 365 days).
 */
export async function params() {
  const data = await getOr("/earth/personhood/v1/params", null);
  const p = data?.params;
  if (!p) return null;
  return {
    registrationValiditySeconds: Number(p.registration_validity_seconds ?? 0),
    // Zero means "use the chain default" (1 hour, 365 days, 365 days, 30 days).
    identityRootWindowSeconds: Number(p.identity_root_window_seconds ?? 0) || 3600,
    caretakerVoteSeconds: Number(p.caretaker_vote_seconds ?? 0) || 365 * 86400,
    handleLeaseSeconds: Number(p.handle_lease_seconds ?? 0) || 365 * 86400,
    handleRenewalSeconds: Number(p.handle_renewal_seconds ?? 0) || 30 * 86400,
  };
}

const INT64_MAX = (1n << 63n) - 1n;

/** The longest lease or activation margin LeaseBounds may report: 10 years (spec §4h). */
export const LEASE_MAX_SECONDS = 10 * 365 * 86400;

/** An int64 JSON field as a Number of seconds, or null (absent, malformed, negative or past 10^12). */
function seconds(v) {
  if (v === undefined || v === null || v === "") return 0;
  if (!/^\d{1,19}$/.test(String(v))) return null;
  const x = BigInt(String(v));
  if (x > INT64_MAX || x > 1_000_000_000_000n) return null;
  return Number(x);
}

/**
 * x/personhood Query/LeaseBounds: the lease lengths the
 * predecessor bounds use as the chain enforces them now (the longest handle
 * lease ever in force; the caretaker lease including a longer one held after
 * a cut), and both bounds at block_time. What the app explains about a
 * switched identity's wait comes from here, never from Params, which may be
 * shorter. null when the node cannot say or answers inconsistently.
 */
export async function leaseBounds() {
  const data = await getOr("/earth/personhood/v1/lease_bounds", null);
  if (!data) return null;
  const f = {
    blockTime: seconds(data.block_time),
    marginSeconds: seconds(data.activation_margin_seconds),
    handleLeaseSeconds: seconds(data.handle_lease_seconds),
    caretakerLeaseSeconds: seconds(data.caretaker_lease_seconds),
    caretakerLeaseHoldUntil: seconds(data.caretaker_lease_hold_until),
  };
  if (Object.values(f).some((v) => v === null) || !f.blockTime || !f.handleLeaseSeconds || !f.caretakerLeaseSeconds) return null;
  // Spec §4h: leases in 1 s..10 years, the margin in 0..10 years.
  const inRange = (v, lo) => v >= lo && v <= LEASE_MAX_SECONDS;
  if (!inRange(f.handleLeaseSeconds, 1) || !inRange(f.caretakerLeaseSeconds, 1) || !inRange(f.marginSeconds, 0)) return null;
  // The bounds are block_time - lease - margin (signed: an early chain's is negative).
  const bound = (v) => (/^-?\d{1,19}$/.test(String(v ?? "")) ? Number(v) : NaN);
  const hb = bound(data.handle_claim_bound);
  const cb = bound(data.caretaker_cast_bound);
  if (hb !== f.blockTime - f.handleLeaseSeconds - f.marginSeconds || cb !== f.blockTime - f.caretakerLeaseSeconds - f.marginSeconds) return null;
  return { ...f, handleClaimBound: hb, caretakerCastBound: cb };
}

/**
 * The longest a passport that replaced another (a switch, or a re-entry)
 * waits before it may claim a handle or cast a new caretaker split, in whole
 * days rounded up: the lease the chain bounds that scope by, plus its margin.
 */
export const switchWaitDays = (b, scope) =>
  b ? Math.ceil(((scope === "handle" ? b.handleLeaseSeconds : b.caretakerLeaseSeconds) + b.marginSeconds) / 86400) : null;
