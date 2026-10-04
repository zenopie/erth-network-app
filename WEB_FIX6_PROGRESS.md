# Web fix round 6 (audit6-web)

Fixes for the round-6 web audit (app-orch, privacy/orchard @ 208ef32). Feature freeze: fixes only.
Gate: `npm run build` and every `check:*` pass after each step.

| Finding | Status | Commit |
| --- | --- | --- |
| L-1 note-leg cap text 32 x (2^63 - 1) | done | 6f4ce09 |
| L-2 human tally only while voting | done | 5677e7e |
| L-3 swap quote expiry | done | 6518fd0 |
| L-4 reserve re-read before signing | done | 2e9eeb7 |
| L-6 allocation options past 2000 | done | 272c2b3 |
| L-7 split editor refuses 0 / negative | done | dd16677 |
| L-8 handle directory 1M-row cap, times rule | done | 0545f67 |
| L-9 LeaseBounds ranges | done | dcb8b5b |
| L-10 extra decimals said, not dropped | done | (this) |

## L-1
- `dex.withdrawalNoteLegProblem` and the dex 1101 sentence in `tx.js` now say "32 notes of 2^63 - 1 units"; doc comments no longer say "past a note's u64".
- `check:privacy` asserts the new text on both the pre-sign refusal and the 1101 explanation.

## L-2
- The chain (c0ad1dd) keeps no human result after a round: `endProposalRound` removes the ballot and `Query/ProposalTally` then answers a zero tally with approved=false. The outcome is only an EndBlock event, not state.
- Governance reads `assembly.proposalTally` only for `PROPOSAL_STATUS_VOTING_PERIOD`. A finished proposal shows `ClosedHumanTally`: the tally is not kept after voting, and the status badge is the outcome of both chambers. `approved` is never rendered for a closed round.
- `check:forms` asserts both.

## L-3
- `dex.boundSwapQuote(micro, from, to)` -> `{ micro, from, to, out, at }`; `dex.swapFloor(quote, micro, from, to, slippage, now)` is "0" unless the quote is for exactly that amount and pair, positive, and younger than `QUOTE_TTL_MS` (20 s, shared with BuyAnml).
- SwapTokens re-asks the quote every 10 s and ticks `now`, so an expired quote disables Swap; `handleSwap` signs the floor from `swapFloor` at click time.
- `check:privacy` L-3 checks.

## L-4
- `dex.withdrawalNoteLegProblemNow(poolId, shares)` reads `dex.pool(id)` and the LP supply together at sign time; either read failing refuses ("cannot be checked"). Markets' ANML withdrawal uses it instead of the page-load reserve.
- Not closed client-side: the chain checks the leg folded with an earlier same-block withdrawal from the pool, which the client cannot see (documented in the doc comment).
- `check:privacy` L-4 checks (over, at cap, pool read fails, supply read fails).

## L-6
- `allocation.streamView` pages until `next_key` is empty, guarded at `MAX_OPTION_PAGES` = 1000 pages (100 000 options). It returns `partial: true` when a later page fails, a page key repeats, or the guard is hit. Aggregates (`total_weight`, `epoch`) come from the first page.
- Shares use the chain's `total_weight` (x/allocation TotalWeight = the sum over live options): the pie (unread weight is its own "Options not read" slice), the options table, and Markets' `lpRewardShare` (Markets now reads `streamView`). Caretaker and Groundworks pages show a "Partial list" note.
- `check:privacy` L-6 checks (3000 options, failed page, repeated key, guard, failed first page).

## L-7
- `allocation.splitPercent` (integer 1..100 or null) and `allocation.splitProblem(weights)` mirror x/allocation `ValidateSplit`: each share 1..100, distinct options, at most 20 (`MaxVoterOptions`), sum exactly 100. `msgSetAllocations` throws on a problem.
- AllocationFund keeps each share as typed (no `parseInt || 0` coercion), shows the problem, and disables Set Allocation while there is one.
- `check:forms` L-7 checks.

## L-8
- `handles.js`: `MAX_ROWS` = 1 000 000 (pages capped at MAX_ROWS / PAGE); `check()` refuses the whole directory (chain or stream) on a row past the cap or an entry outside `0 < expires_at <= renewal_until <= now + 10 years` (`timesOk`, 365-day years as the Android wallet). A stream whose page 0 claims more than 1 000 000 rows (or a non-integer size) is refused before page 1. Both readers take `now` (the directory's clock).
- `check:handles` L-8 checks.

## L-9
- `personhood.leaseBounds` refuses (null) a handle or caretaker lease outside 1 s..10 years or a margin outside 0..10 years (`LEASE_MAX_SECONDS`), as spec §4h and the Android `leaseParam`. Display only (wait days).
- `check:privacy` L-9 checks.

## L-10
- `tokens.toMicro` refuses ("0") an amount with non-zero digits past the denom's decimals instead of truncating it (trailing zeros are fine), so every `amountOk` gate disables its button and nothing smaller than typed is signed.
- `tokens.amountNote` + `components/AmountNote.jsx`: "ERTH has at most 6 decimal places; remove the extra digits." under every typed amount input (Swap, BuyAnml, Shield, auction bid, self-bond / unbond / create-validator, Governance deposit x2, Markets add x2 and remove x2).
- `check:forms` L-10 checks (incl. every decimal input has a note).
