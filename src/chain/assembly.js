import { getOr, seg } from "./rest";
import { b64ToHex, countryFromField, isZeroB64 } from "./bytes";

/**
 * x/assembly — the human chamber of governance.
 *
 * Every x/gov proposal also needs two thirds of the human votes cast (no
 * quorum, no abstain). Votes are anonymous membership proofs made on the
 * phone, one per person per ballot, so the tally is public and the voters are
 * not. A proposal that revokes a passport signer or country excludes the
 * registrations it is about from voting on it.
 */

/** The human tally on a gov proposal: { yes, no, approved }, null if unread. */
export async function proposalTally(proposalId) {
  const data = await getOr(seg`/earth/assembly/v1/proposal_tally/${proposalId}`, null);
  if (!data) return null;
  return {
    yes: Number(data.tally?.yes ?? 0),
    no: Number(data.tally?.no ?? 0),
    approved: Boolean(data.approved),
  };
}

const NO_BOUND = (1n << 63n) - 1n;

/** A membership bound as unix seconds; null for no bound, absent or junk. */
export function boundOf(v) {
  if (v === undefined || v === null || !/^\d{1,20}$/.test(String(v))) return null;
  const b = BigInt(v);
  if (b >= NO_BOUND || b > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(b);
}

/**
 * The public inputs a human vote on this proposal (or removal ballot) is
 * proven against — in particular who is excluded from voting on it. Pass
 * { proposalId } or { optionId }. Null when there is no open ballot (the
 * proposal is not in voting) or the proposal cannot be voted on because its
 * subjects span countries (the chain answers with an error saying why).
 */
export async function ballotInputs({ proposalId, optionId }) {
  const q = proposalId
    ? `proposal_id=${encodeURIComponent(proposalId)}`
    : `option_id=${encodeURIComponent(optionId)}`;
  const data = await getOr(`/earth/assembly/v1/ballot_inputs?${q}`, null);
  if (!data) return null;
  return {
    ballotId: Number(data.ballot_id ?? 0),
    round: Number(data.round ?? 0),
    // Both bounds are unix seconds, null for "no bound" (2^63 - 1) or none
    // served. Since 4a663d5 ballots bound the predecessor (an identity that
    // replaced another after the ballot opened, less a day, may not vote)
    // and not the activation.
    maxActivation: boundOf(data.max_activation),
    maxPredecessor: boundOf(data.max_predecessor),
    excludedDsc: isZeroB64(data.excluded_dsc) ? "" : b64ToHex(data.excluded_dsc),
    excludedCountry: countryFromField(data.excluded_country),
  };
}

/** Open votes to strike a Groundworks option, each with its running tally. */
export async function removalBallots() {
  const data = await getOr("/earth/assembly/v1/removal_ballots", null);
  if (!data) return null;
  return (data.ballots ?? []).map((b) => ({
    optionId: Number(b.option_id ?? 0),
    ballotId: Number(b.ballot_id ?? 0),
    openedAt: Number(b.opened_at ?? 0),
    closesAt: Number(b.closes_at ?? 0),
    yes: Number(b.tally?.yes ?? 0),
    no: Number(b.tally?.no ?? 0),
  }));
}
