# Web fix round 5 (audit5-web)

Fixes for the round-5 web audit (app-orch, privacy/orchard @ 4fa9191).
Gate: `npm run build` and every `check:*` pass after each step.

| Finding | Status | Commit |
| --- | --- | --- |
| M1 Handles page / Shield preview show unverified backend addresses | done | 89c623d |
| L1 stale review after recipient change | done | 38e4831 |
| L2 React error boundary | done | f391eef |
| L3 exact decimal amounts, exact Max | done | 418e6a0 |
| L4 @handle out of URL and Referer | done | ad80a1e |
| L6 rest.js redirect: "error" | done | a803f31 |
| L8 declare cosmjs-types | done | 23392d6 |
| L9 refuse unknown denoms | done | 623992b |

## M1
- `handles.js`: `verifyAgainst(served, chain)`, `addressProblem(a)`, and on the directory `verifiedAll()` / `verifiedLookup()`. Every served entry is compared with the chain's whole directory (`chainDirectory()`): same address, status and times, and the address must decode (`decodeShieldedAddress`). Otherwise `verified: false` with a reason. Handles the chain has and the copy omits are added from the chain.
- Handles page: first paint from `all()` with every row pending ("checking…"), then `verifiedAll()`. Copy is disabled and Pay hidden unless the row is verified; a mismatch shows "Unverified: <reason>".
- Shield preview: the address is decoded and labelled "(unverified until Review)"; Review (`resolveForPayment`) is unchanged.
- PoC as a check: `check:handles` "M1:" checks (forged address marked unverified, chain-only and copy-only rows, undecodable address, payment still refused, page source gating).

## L1
- Shield: the review stores the recipient it was asked for (`for`); it is used and shown only while the field still holds that recipient. A resolution that returns after the field changed is dropped (`recipientRef`), its failure text too. A directory read that throws during Review is now a shown reason, not an unhandled rejection.

## L2
- `components/ErrorBoundary.jsx`, wrapped around every page inside `Layout`, keyed by path (navigating away clears it; "Try again" re-renders). The sidebar stays up.
- `rest.text()`: LCD fields rendered as text are coerced (string, number digits, else ""). Used in `gov.js` `toProposal`, `allocation.js` `toOption`, `explorer.js` `toTx` (messages must be an array).

## Check status note
- `check:dex` reads the live LCD (`lcd.erth.network`), which answers 530 (no chain behind it since the v0.9.3 lease closed). Its 4 failures ("at least one pool", fee, unbonding, apr) are the empty chain read, not this code; it fails identically on 4fa9191.

## L9
- `tokens.js`: only TOKENS and `dexlp/<n>` are `known` (`isKnownDenom`). Anything else is shown raw: base units under the raw denom (decimals 0, no "ufoo" -> "FOO" guess). `toMicro` returns "0" for an unknown denom, so no amount of it can be entered or signed.
- Swap does not offer unknown denoms. The auction bid and Markets' Add say the decimals are unknown and the action stays disabled.
- `check:forms` L9 checks.

## L3
- `tokens.js`: `amountOk(typed, denom, maxBase?)` (positive and within the balance, decided on `toMicro`'s base units) and `typedFloat` (estimates of the amount that will be signed).
- Every amount input is text with `inputMode="decimal"` (Governance deposit x2, self-bond / unbond / create-validator, auction bid, Markets add x2 and remove x2, swap). Every button is gated on `amountOk`, never `parseFloat`.
- Every Max is `formatUnits` of the base-unit balance (auction bid, Markets ERTH / token / shares x2); the auction keeps its balance in base units.
- `check:forms` L3 checks (exponents refused, exact bounds, Max round-trips past 2^53 and 1e21, page sources free of float gating). The swap slippage stays a number input (not an amount; clamped).

## L4
- Handles' Pay links to `/shield#to=%40alice` (router `hash`); Shield reads `to` only from the fragment (`useSearchParams` removed, so an old `?to=` link prefills nothing).
- `Referrer-Policy: no-referrer` in `security-headers.conf`, and `<meta name="referrer" content="no-referrer">` in `index.html` (covers dev/preview and any location missing the include).
- `check:handles` L4 source checks.

## L6
- `rest.js` `get()` and `rpcOrNull()`, and the broadcast POST in `tx.js`, pass `redirect: "error"` (as `handles.js` already did). Every `fetch` in `src/` now refuses redirects.
- `check:tx` L6 records every stubbed request's redirect mode (fails on the old rest.js: 81 of 89 followed).

## L8
- `"cosmjs-types": "0.11.0"` (exact, the version already locked) in `dependencies` and the lockfile's root entry. Edited by hand, since `node_modules` is a symlink into app-privacy; `npm install --package-lock-only` on a copy reproduces the lockfile byte for byte.

## Not in this round
- L5 (per-nullifier registration lookup), L7 (dev toolchain advisories, Docker base images) and I1-I4 were not asked for.
- `all()` / `lookup()` still return the served copy unverified. Nothing in the UI shows or copies an address from them now. The Handles page uses `verifiedAll()`, the Shield preview is labelled, and payment goes through `resolveForPayment`.

## Final gate (23392d6)
`npm run build` passes. check:explorer 13/13, check:staking 8/8, check:privacy 148/148, check:tx 28/28, check:forms 20/20, check:handles 46/46. check:dex has 10 passes and 4 failures, because the live LCD is down (530); it fails the same way on 4fa9191.
