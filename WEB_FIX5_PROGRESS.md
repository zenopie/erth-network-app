# Web fix round 5 (audit5-web)

Fixes for the round-5 web audit (app-orch, privacy/orchard @ 4fa9191).
Gate: `npm run build` and every `check:*` pass after each step.

| Finding | Status | Commit |
| --- | --- | --- |
| M1 Handles page / Shield preview show unverified backend addresses | done | (this) |
| L1 stale review after recipient change | todo | |
| L2 React error boundary | todo | |
| L3 exact decimal amounts, exact Max | todo | |
| L4 @handle out of URL and Referer | todo | |
| L6 rest.js redirect: "error" | todo | |
| L8 declare cosmjs-types | todo | |
| L9 refuse unknown denoms | todo | |

## M1
- `handles.js`: `verifyAgainst(served, chain)`, `addressProblem(a)`, and on the directory `verifiedAll()` / `verifiedLookup()`. Every served entry is compared with the chain's whole directory (`chainDirectory()`): same address, status and times, and the address must decode (`decodeShieldedAddress`). Otherwise `verified: false` with a reason. Handles the chain has and the copy omits are added from the chain.
- Handles page: first paint from `all()` with every row pending ("checking…"), then `verifiedAll()`. Copy is disabled and Pay hidden unless the row is verified; a mismatch shows "Unverified: <reason>".
- Shield preview: the address is decoded and labelled "(unverified until Review)"; Review (`resolveForPayment`) is unchanged.
- PoC as a check: `check:handles` "M1:" checks (forged address marked unverified, chain-only and copy-only rows, undecodable address, payment still refused, page source gating).
