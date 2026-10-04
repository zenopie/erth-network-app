# Web fix round 6 (audit6-web)

Fixes for the round-6 web audit (app-orch, privacy/orchard @ 208ef32). Feature freeze: fixes only.
Gate: `npm run build` and every `check:*` pass after each step.

| Finding | Status | Commit |
| --- | --- | --- |
| L-1 note-leg cap text 32 x (2^63 - 1) | done | (this) |

## L-1
- `dex.withdrawalNoteLegProblem` and the dex 1101 sentence in `tx.js` now say "32 notes of 2^63 - 1 units"; doc comments no longer say "past a note's u64".
- `check:privacy` asserts the new text on both the pre-sign refusal and the 1101 explanation.
