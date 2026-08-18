import { getOr } from "./rest";

/**
 * x/personhood — proof-of-personhood registration and the daily ANML claim.
 *
 * The one-human-one-vote allocation stream this module gates lives in
 * x/allocation (see ./allocation.js, STREAM_CARETAKER). This module only decides who
 * counts as a live human; the votes and options are the allocation module's.
 */

/** Registration status for an address. */
export async function registrationStatus(address) {
  const data = await getOr(
    `/earth-network/earth/personhood/v1/registration/${address}`,
    null,
  );
  if (!data) return { registered: false, expired: false, lastAnmlClaim: 0 };
  return {
    registered: Boolean(data.registered),
    expired: Boolean(data.expired),
    lastAnmlClaim: Number(data.registration?.last_anml_claim ?? 0),
  };
}

/** ANML is claimable at most once per day (chain rule: now - last >= 86400). */
export function isAnmlClaimable(status) {
  if (!status.registered) return false;
  return Math.floor(Date.now() / 1000) - status.lastAnmlClaim >= 86400;
}

/**
 * How many humans are currently registered — the denominator of the human
 * emission stream, since every registration carries the same weight.
 *
 * This used to ride along on the democratic-options response; it is its own
 * query now that the options belong to x/allocation.
 */
export async function registrationCount() {
  const data = await getOr("/earth-network/earth/personhood/v1/registration_count", null);
  return Number(data?.count ?? 0);
}

/**
 * Registrations per issuing country, as [{ country, count }] with country an
 * ISO 3166-1 alpha-2 code ("" when the Document Signer's certificate carries no
 * country). Powers the explorer's registration map.
 */
export async function registrationCountries() {
  const data = await getOr("/earth-network/earth/personhood/v1/registration_countries", {
    countries: [],
  });
  return (data.countries ?? [])
    .map((c) => ({ country: c.country ?? "", count: Number(c.count ?? 0) }))
    .sort((a, b) => b.count - a.count);
}

/** How many humans registered with a given Document Signer (hex dsc_key). */
export async function registrationsByDsc(dscKeyHex) {
  const data = await getOr(
    `/earth-network/earth/personhood/v1/registrations_by_dsc/${dscKeyHex.replace(/^0x/, "")}`,
    null,
  );
  return Number(data?.count ?? 0);
}

// --- messages ---

export function msgClaimAnml(creator) {
  return { typeUrl: "/earth.personhood.v1.MsgClaimAnml", value: { creator } };
}
