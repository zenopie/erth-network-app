import { getOr, seg } from "./rest";
import { b64ToHex, normalizeHex } from "./bytes";

/**
 * x/personhood — private proof-of-personhood.
 *
 * A registration names no account. It is keyed by its passport nullifier (the
 * public dedup key) and holds a leaf in the identity tree; everything its
 * holder does afterwards — the daily ANML claim, caretaker splits, assembly
 * votes, referrer bindings — is an anonymous membership proof made on the
 * phone. So there is no "my registration" here and nothing is looked up by
 * address, except a referrer binding, which is public by design.
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

/**
 * A registration by its passport nullifier (hex). Resolves to null for a
 * malformed nullifier or a failed read. The chain answers an unknown
 * nullifier with an empty response and an expired one with registered=false,
 * expired=true and the record, so `registered || expired` means it exists.
 */
export async function registrationByNullifier(nullifierHex) {
  const nf = normalizeHex(nullifierHex);
  if (!nf) return null;
  const data = await getOr(seg`/earth/personhood/v1/registration/${nf}`, null);
  if (!data) return null;
  const r = data.registration ?? {};
  return {
    registered: Boolean(data.registered),
    expired: Boolean(data.expired),
    nullifier: b64ToHex(r.nullifier) || nf,
    leafIndex: Number(r.leaf_index ?? 0),
    registeredAt: Number(r.registered_at ?? 0),
    activatedAt: Number(r.activated_at ?? 0),
    dscKey: b64ToHex(r.dsc_key),
    country: r.country ?? "",
  };
}

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
 * Whether `address` holds a live referrer binding, i.e. may be named as a
 * registration's affiliate, and until when (unix seconds). Bindings are made
 * anonymously from the mobile app; the address they point at is public.
 */
export async function referrer(address) {
  const data = await getOr(seg`/earth/personhood/v1/referrer/${address}`, null);
  if (!data) return null;
  return { live: Boolean(data.live), expiresAt: Number(data.expires_at ?? 0) };
}

/**
 * Module params, with the few the UI explains pulled out. caretakerVoteSeconds
 * is R: how long a caretaker split or a referrer binding lasts.
 */
export async function params() {
  const data = await getOr("/earth/personhood/v1/params", null);
  const p = data?.params;
  if (!p) return null;
  return {
    registrationValiditySeconds: Number(p.registration_validity_seconds ?? 0),
    // Zero means "use the chain default" for both (1 hour, 30 days).
    identityRootWindowSeconds: Number(p.identity_root_window_seconds ?? 0) || 3600,
    caretakerVoteSeconds: Number(p.caretaker_vote_seconds ?? 0) || 30 * 86400,
  };
}
