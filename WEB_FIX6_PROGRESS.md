# Web fix round 6 (audit6-web)

Fixes for the round-6 web audit (app-orch, privacy/orchard @ 208ef32). Feature freeze: fixes only.
Gate: `npm run build` and every `check:*` pass after each step.

| Finding | Status | Commit |
| --- | --- | --- |
| L-1 note-leg cap text 32 x (2^63 - 1) | done | 6f4ce09 |
| L-2 human tally only while voting | done | (this) |

## L-1
- `dex.withdrawalNoteLegProblem` and the dex 1101 sentence in `tx.js` now say "32 notes of 2^63 - 1 units"; doc comments no longer say "past a note's u64".
- `check:privacy` asserts the new text on both the pre-sign refusal and the 1101 explanation.

## L-2
- The chain (c0ad1dd) keeps no human result after a round: `endProposalRound` removes the ballot and `Query/ProposalTally` then answers a zero tally with approved=false. The outcome is only an EndBlock event, not state.
- Governance reads `assembly.proposalTally` only for `PROPOSAL_STATUS_VOTING_PERIOD`. A finished proposal shows `ClosedHumanTally`: the tally is not kept after voting, and the status badge is the outcome of both chambers. `approved` is never rendered for a closed round.
- `check:forms` asserts both.
