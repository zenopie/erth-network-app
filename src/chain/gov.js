import { getOr, seg } from "./rest";
import { UERTH } from "./config";

/**
 * x/gov — the stake chamber.
 *
 * Stake voting weight is validators' transparent self-bond plus private
 * derth, voted from the phone by spending a note against the proposal's
 * snapshot. The chain's custom tally combines both, and the gov tally query
 * runs the same function, so /tally here is the real stake result. Each
 * validator's own vote also carries its un-voted derth (the SDK's inheritance
 * rule), which is why a validator's transparent vote still matters.
 */

export const VOTE_YES = 1;
export const VOTE_ABSTAIN = 2;
export const VOTE_NO = 3;
export const VOTE_NO_WITH_VETO = 4;

const toTally = (t) => ({
  yes: t?.yes_count ?? "0",
  abstain: t?.abstain_count ?? "0",
  no: t?.no_count ?? "0",
  noWithVeto: t?.no_with_veto_count ?? "0",
});

function toProposal(p) {
  return {
    id: Number(p.id ?? 0),
    title: p.title || "(untitled)",
    summary: p.summary ?? "",
    status: p.status ?? "",
    expedited: Boolean(p.expedited),
    proposer: p.proposer ?? "",
    messages: (p.messages ?? []).map((m) => (m["@type"] ?? "").split(".").pop()),
    submitTime: p.submit_time ?? "",
    depositEndTime: p.deposit_end_time ?? "",
    votingStartTime: p.voting_start_time ?? "",
    votingEndTime: p.voting_end_time ?? "",
    totalDeposit: (p.total_deposit ?? []).find((c) => c.denom === UERTH)?.amount ?? "0",
    finalTally: toTally(p.final_tally_result),
  };
}

/** The most recent proposals, newest first. Null when the read fails. */
export async function proposals(limit = 50) {
  const data = await getOr(
    `/cosmos/gov/v1/proposals?pagination.limit=${limit}&pagination.reverse=true`,
    null,
  );
  if (!data) return null;
  return (data.proposals ?? []).map(toProposal).sort((a, b) => b.id - a.id);
}

/** The live stake tally (transparent + private) of a proposal in voting. */
export async function tally(proposalId) {
  const data = await getOr(seg`/cosmos/gov/v1/proposals/${proposalId}/tally`, null);
  return data ? toTally(data.tally) : null;
}

/** An address's own vote on a proposal, as [{ option, weight }], or null. */
export async function vote(proposalId, voter) {
  const data = await getOr(seg`/cosmos/gov/v1/proposals/${proposalId}/votes/${voter}`, null);
  return data?.vote?.options ?? null;
}

/** Minimum deposit (uerth) and the voting/deposit periods. */
export async function params() {
  const data = await getOr("/cosmos/gov/v1/params/deposit", null);
  const p = data?.params;
  if (!p) return null;
  return {
    minDeposit: (p.min_deposit ?? []).find((c) => c.denom === UERTH)?.amount ?? "0",
    quorum: Number(p.quorum ?? 0),
    threshold: Number(p.threshold ?? 0),
    vetoThreshold: Number(p.veto_threshold ?? 0),
  };
}

// --- messages ---

/**
 * A transparent stake vote. Its weight is the voter's x/staking delegations,
 * which on this chain means a validator operator's self-bond and nothing else
 * (plus, for an operator, the derth of private stakers who have not voted).
 */
export function msgVote(voter, proposalId, option) {
  return {
    typeUrl: "/cosmos.gov.v1.MsgVote",
    value: { proposalId: BigInt(proposalId), voter, option, metadata: "" },
  };
}

export function msgDeposit(depositor, proposalId, amount) {
  return {
    typeUrl: "/cosmos.gov.v1.MsgDeposit",
    value: {
      proposalId: BigInt(proposalId),
      depositor,
      amount: [{ denom: UERTH, amount: String(amount) }],
    },
  };
}

/** A text proposal: no messages, just a title and summary for both chambers. */
export function msgSubmitTextProposal(proposer, title, summary, deposit) {
  return {
    typeUrl: "/cosmos.gov.v1.MsgSubmitProposal",
    value: {
      messages: [],
      initialDeposit: [{ denom: UERTH, amount: String(deposit) }],
      proposer,
      metadata: "",
      title,
      summary,
      expedited: false,
    },
  };
}
