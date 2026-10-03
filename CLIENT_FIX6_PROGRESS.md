# Clients round 6: chain-orch privacy/orchard 203d3b2 (audit 5 chain fixes): web

Sources: chain CHANGELOG [Unreleased], ORCHARD_DESIGN.md §16, FIX_ROUND5_PROGRESS.md.
Formats: mobile-orch PRIVACY_FORMATS.md. Never pushed.

| # | Change | Web | Commit |
| --- | --- | --- | --- |
| 1 | MsgRegister drops affiliate_pc / affiliate_ciphertext (11, 12) | Protos regenerated (CHAIN_REF=203d3b2). The web registers nobody and has no affiliate field code, so nothing else uses them. | e235ba9 |
| 2 | Referral note found by owner_pk/rho/rcm on shielded_mint | N/A: the web never syncs or receives notes. | — |
| 3 | LP payout leg > 2^64-1 split into notes sharing one pc/ciphertext | The ANML-pool withdrawal makes one pc and blind ciphertext; the chain reuses it per chunk (documented in removeLiquidityToShielded). The web parses no note rows. | 51595c5 |
| 4 | Query/LeaseBounds | personhood.leaseBounds() (validated: bounds = block_time - lease - margin, int64 seconds) and switchWaitDays(). The Caretaker and Handles pages explain a switched identity's wait from the lease lengths, never Params. Handles: in its renewal period a handle cannot move, and renewing it then counts as a claim. | c57ae54 |
| 5 | Handle bind gas 9 writes; gas params capped | N/A: the web signs no private msgs; its transparent msgs carry no module gas. | — |
| 6 | Anchor margin 120 s / lapsed anchors dropped | N/A: the web builds no anchored tx (the explorer only shows the anchor). | — |
| 7 | MsgShield refuses a send-disabled denom | bank.sendEnabled (own entry, else default_send_enabled; null if unknown) checked before Shield signs; bank code 5 explained in the tx error. | 51595c5 |
| 8 | Demoted expedited proposal: round 1, new scope | ballotInputs already reads round; the web derives no scope. Governance shows that round 2 is a new ballot (votes do not carry over). | c57ae54 |
| 9 | Swap fee rounds up; withdrawal note leg > 16 notes refused | exactFee rounds up (LegacyDec Quo then Ceil). quoteSwap falls back to the exact integer maths (fee on the ERTH side of each hop) and returns a BigInt, so min-out is exact. The floating-point quoteHop is gone. dex-swaps.json holds 96 feeOf and 512 hop vectors from x/dex at 203d3b2, checked in check:handles. Deposit vectors were re-checked: identical at 203d3b2. An ANML-pool withdrawal above 16 x (2^64-1) is refused before signing (withdrawalNoteLegProblem), and dex 1101 with that text is explained. | 0cb88fb, 51595c5 |

## Checks
- npm run build: ok.
- check:privacy 164 PASS / 0 FAIL, check:tx 28/0, check:forms 20/0, check:handles 49/0 (incl. the swap vectors).
- check:explorer 13/0 and check:staking 8/0 exit 0.
- check:dex: 4 FAIL (at least one pool, swap fee, lp unbonding seconds, apr), because lcd.erth.network answers Cloudflare 1033 (tunnel down). These are not code failures.

## Chain issues
- None found on the web side.
