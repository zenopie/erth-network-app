# Audit history

What each audit and client round changed in the web app, oldest first. Folded
from the per-round `*_PROGRESS.md` files on 2026-10-04; the text is as each
round recorded it, so pass counts, chain commits and check names are as of that
round.

The checks were later regrouped by feature (README, "Checks"); every case kept
its name, less the finding id. Where a round's check went:

| Then | Now |
| --- | --- |
| `check:tx` | `check:tx` (error explanations from the others joined it) |
| `check:forms` | `check:dex` (quote floors), `check:amounts`, `check:governance` (L-2, L-7) |
| `check:handles` | `check:handles`; deposit and swap vectors to `check:dex`; dex 1120 to `check:tx` |
| `check:privacy` | `check:personhood`, `check:governance`, `check:shielded` (the note vectors), `check:staking`, `check:dex`, `check:amounts`, `check:explorer` |
| `check:explorer`, `check:staking` | the same names |
| `check:dex` (live LCD) | `check:dex-live`; `check:dex` is now the stubbed dex |

Formats: mobile-orch `PRIVACY_FORMATS.md`. Chain: chain-orch `ORCHARD_DESIGN.md`.

## 2026-10-02 · Orchard protocol port

_Was `APP_ORCHARD_PROGRESS.md`._

Source of truth: chain-orch privacy/orchard (ORCHARD_DESIGN.md §12-13).

### Done
- Protos regenerated from chain-orch (scripts/gen-proto.sh).
- shieldedStaking.js: derth supply from the Validator query (supply, fallback
  state.derth_supply; never bank); positions carry ownerTag (one-time key
  retired); stakeTree() read (/earth/shieldedstaking/v1/stake_tree).
- UI/text: stake notes owner-locked + non-transferable (StakeErth, gov,
  Governance, GroundworksFund); ExplorerShielded: derth/unbond not pool
  assets, stake-tree size row, dexlp supply shown; Markets/dex: shielded LP
  shares are private notes (only transparent balance/unbondings shown;
  pool reserves + total shares stay public).
- Encoders: MsgShield, MsgBuyAnml, MsgRemoveLiquidity unchanged on the wire;
  check-notes asserts field numbers + that no bundle msg is registered.
  The web app never built bundle msgs (MsgSend/NoteSwap/AddLiquidityShielded/
  RemoveLiquidityShielded/staking): nothing to disable.

### Final chain formats (chain-orch fced976, 2026-10-02)
- Protos regenerated @ fced976 (dex bundle msgs: fee fields gone, new
  denom_in/amount_in, erth_amount; allocation Voter.option_weights;
  Position.split_epoch; max_positions gone, min_delegation added).
  MsgShield/MsgBuyAnml/MsgRemoveLiquidity unchanged on the wire.
- MsgShield now carries the 177-byte v2 blind ciphertext (was v1 217);
  msgShield/msgBuyAnml/ANML-pool msgRemoveLiquidity refuse any other length.
- chain/address.js canonicalAddress: explorer search, account page and
  referrer lookup use the canonical lowercase bech32.
- Groundworks: allocation.validatorVoter(s) (key "gwpos/"||val bytes as
  earth bech32); GroundworksFund "By validator" table + "From positions"
  from voters; position weight = query's live derth x epoch rate, lapsed
  flag via split_epoch; StakeErth Groundworks column.
- No /gas/transparent (or other gas endpoint) references in the app.

### Checks
- check:explorer, check:staking, check:privacy pass; npm run build passes.
- check:dex: 4 live-LCD checks fail (lcd.erth.network Cloudflare 530; same
  on the base commit), not code.

## 2026-10-03 · Clients audit round 4

_Was `CLIENT_FIX4_PROGRESS.md`._

### WEB (app-orch, privacy/orchard)
- [x] Pending-tx guard per account (src/chain/tx.js): one record per address, old single-record format migrated; another Keplr account's send no longer erases it. check:tx cases 7 (poc-pending-overwrite).
- [x] waitForTx / resolvePendingTx: a tx_response whose txhash is not the hash asked for is ignored (polling continues / "unknown"). check:tx case 8.
- [x] latestHeight: positive decimal string below 2^53, else an error (never expires a pending tx). check:tx case 9.
- [x] M6 BuyAnml: amount edits drop the quote synchronously; quote is { micro, out, at }; dex.buyAnmlFloor is "0" (submit disabled) for another amount or a quote older than 20 s (re-asked every 10 s); submit reads amount and floor together. SwapTokens already cleared its quote on every edit. check:forms (poc-buyanml-stale-quote).
- [x] Markets add liquidity: min_shares from pool reserves + LP supply read at submit (dex.addLiquidityFloor); refused if either read fails. check:forms.
- [x] Shielded address: low-order / all-zero ek_pub refused at decode. check:privacy (poc-address: owner_pk = p refused, p-1 accepted, zero / u=1 / u=p ek_pub refused).
- [x] /erth-price polling removed (useErthPrice constant null; api.erth.network out of CSP and the dev proxy).
- [x] Lexend self-hosted (src/fonts, OFL); Google Fonts gone from index.css and the CSP.
- [x] Privacy policy: device-attestation text removed (grants are proof-backed), indexer + web app sections, fixed "Last updated".
- [x] .dockerignore: .env, .env.*, *.env.
- Checks: build ok; check:tx 27/27, check:forms 10/10, check:privacy 146/146, check:explorer 13/13, check:staking ok. check:dex needs a live LCD (the default URL returned HTML here; same 4 FAILs before these changes).

## 2026-10-03 · Clients round 5: final chain formats (chain 4a663d5)

_Was `CLIENT_FIX5_PROGRESS.md`._

Formats: mobile-orch PRIVACY_FORMATS.md §3a / §4g. Never pushed.

### WEB (app-orch, privacy/orchard)
- [x] Referrers page, its nav link and personhood.referrer() (Query/Referrer) removed; comments no longer mention referrer bindings. Registration is not on web (nothing to remove).
- [x] Protos regenerated from chain 4a663d5 (scripts/gen-proto.sh, CHAIN_REF=4a663d5): MsgBindHandle / MsgMoveHandle / MsgMoveCaretaker, MsgRegister affiliate fields, MsgSetCaretaker max_predecessor, BallotInputs. The registry still holds only Keplr-signed msgs (no personhood msgs; MsgBindReferrer was never registered).
- [x] src/chain/handles.js: the whole handle directory, never one handle. Backend stream GET {base}/handles?from_index=&limit=1000 (base from /privacy/status, validated /privacy/<chain_id>/<genesis>), aligned pages from 0, restarted (<= 3) when the snapshot height moves, refused on out-of-order / bad status / malformed handle / row count != size; fallback the LCD's Query/Handles pages (start/next). Cached 10 min; a payment re-reads within 60 s and requires the entry live (status and clock) with the same address in the chain's own directory.
- [x] Pay a handle (Shield page): recipient "@handle" or a bare handle; preview "@handle · erthz1xxxxxxxx…yyyyyyyy"; Review resolves fresh + chain cross-check, then "Shield to @handle" re-checks once more and signs MsgShield (shieldTo: pc to the handle's owner_pk, fresh rho/rcm, 177-byte blind ciphertext to its ek_pub; low-order ek_pub refused at decode). ?to=@handle prefills.
- [x] Handles page (/handles, sidebar): whole directory, client-side search, status demoted by the local clock, expiry, renewal window, truncated address with copy, Pay link.
- [x] CSP connect-src and the dev proxy (/api) regain api.erth.network (its one use: the directory stream; VITE_EARTH_API="" turns it off, LCD alone). Privacy policy: handle lookups.
- [x] Governance: BallotInputs max_predecessor read; a no-bound max_activation (2^63 - 1) shows as none.
- [x] Caretaker page: renewal is manual (no "the app renews it").
- [x] Markets add liquidity: the other leg derived in base units rounded up (dex.depositLeg = ceil(amount x R_other / R_typed)); dex.depositPull mirrors x/dex (shares floor-min, legs ceil); ErrPoolCap (dex 1120) explained in the tx error (personhood 1120 is not).
- [x] check:handles (new, 32): handle format, whole-directory paging, never a per-handle URL, restart on height change, stream refusals, LCD fallback, forged backend address refused, lapsed / renewal / unknown not payable, the payment note opens to the handle owner's pc, validBase, 144 x/dex deposit vectors (scripts/fixtures/dex-deposits.json from the chain's mulDiv/mulDivUp), 1120 by codespace.
- Checks: npm run build ok; check:privacy 148/148, check:tx 27/27, check:forms 10/10, check:handles 32/32. check:explorer / check:staking / check:dex need a live LCD: lcd.erth.network answers Cloudflare 1033 (tunnel down), not run.
- Note: the backend sends no CORS headers, so until it allows the app's origin (GET /privacy/status and /privacy/<chain>/<genesis>/handles) the browser read of the stream fails and the reader falls back to the LCD's pages (same whole-directory privacy, one more request per payment).

Commits: 05a0271, a5f61e8, 9e09fbd, and this file's.

## 2026-10-03 · Web audit round 5 (audit5-web)

_Was `WEB_FIX5_PROGRESS.md`._

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

### M1
- `handles.js`: `verifyAgainst(served, chain)`, `addressProblem(a)`, and on the directory `verifiedAll()` / `verifiedLookup()`. Every served entry is compared with the chain's whole directory (`chainDirectory()`): same address, status and times, and the address must decode (`decodeShieldedAddress`). Otherwise `verified: false` with a reason. Handles the chain has and the copy omits are added from the chain.
- Handles page: first paint from `all()` with every row pending ("checking…"), then `verifiedAll()`. Copy is disabled and Pay hidden unless the row is verified; a mismatch shows "Unverified: <reason>".
- Shield preview: the address is decoded and labelled "(unverified until Review)"; Review (`resolveForPayment`) is unchanged.
- PoC as a check: `check:handles` "M1:" checks (forged address marked unverified, chain-only and copy-only rows, undecodable address, payment still refused, page source gating).

### L1
- Shield: the review stores the recipient it was asked for (`for`); it is used and shown only while the field still holds that recipient. A resolution that returns after the field changed is dropped (`recipientRef`), its failure text too. A directory read that throws during Review is now a shown reason, not an unhandled rejection.

### L2
- `components/ErrorBoundary.jsx`, wrapped around every page inside `Layout`, keyed by path (navigating away clears it; "Try again" re-renders). The sidebar stays up.
- `rest.text()`: LCD fields rendered as text are coerced (string, number digits, else ""). Used in `gov.js` `toProposal`, `allocation.js` `toOption`, `explorer.js` `toTx` (messages must be an array).

### Check status note
- `check:dex` reads the live LCD (`lcd.erth.network`), which answers 530 (no chain behind it since the v0.9.3 lease closed). Its 4 failures ("at least one pool", fee, unbonding, apr) are the empty chain read, not this code; it fails identically on 4fa9191.

### L9
- `tokens.js`: only TOKENS and `dexlp/<n>` are `known` (`isKnownDenom`). Anything else is shown raw: base units under the raw denom (decimals 0, no "ufoo" -> "FOO" guess). `toMicro` returns "0" for an unknown denom, so no amount of it can be entered or signed.
- Swap does not offer unknown denoms. The auction bid and Markets' Add say the decimals are unknown and the action stays disabled.
- `check:forms` L9 checks.

### L3
- `tokens.js`: `amountOk(typed, denom, maxBase?)` (positive and within the balance, decided on `toMicro`'s base units) and `typedFloat` (estimates of the amount that will be signed).
- Every amount input is text with `inputMode="decimal"` (Governance deposit x2, self-bond / unbond / create-validator, auction bid, Markets add x2 and remove x2, swap). Every button is gated on `amountOk`, never `parseFloat`.
- Every Max is `formatUnits` of the base-unit balance (auction bid, Markets ERTH / token / shares x2); the auction keeps its balance in base units.
- `check:forms` L3 checks (exponents refused, exact bounds, Max round-trips past 2^53 and 1e21, page sources free of float gating). The swap slippage stays a number input (not an amount; clamped).

### L4
- Handles' Pay links to `/shield#to=%40alice` (router `hash`); Shield reads `to` only from the fragment (`useSearchParams` removed, so an old `?to=` link prefills nothing).
- `Referrer-Policy: no-referrer` in `security-headers.conf`, and `<meta name="referrer" content="no-referrer">` in `index.html` (covers dev/preview and any location missing the include).
- `check:handles` L4 source checks.

### L6
- `rest.js` `get()` and `rpcOrNull()`, and the broadcast POST in `tx.js`, pass `redirect: "error"` (as `handles.js` already did). Every `fetch` in `src/` now refuses redirects.
- `check:tx` L6 records every stubbed request's redirect mode (fails on the old rest.js: 81 of 89 followed).

### L8
- `"cosmjs-types": "0.11.0"` (exact, the version already locked) in `dependencies` and the lockfile's root entry. Edited by hand, since `node_modules` is a symlink into app-privacy; `npm install --package-lock-only` on a copy reproduces the lockfile byte for byte.

### Not in this round
- L5 (per-nullifier registration lookup), L7 (dev toolchain advisories, Docker base images) and I1-I4 were not asked for.
- `all()` / `lookup()` still return the served copy unverified. Nothing in the UI shows or copies an address from them now. The Handles page uses `verifiedAll()`, the Shield preview is labelled, and payment goes through `resolveForPayment`.

### Final gate (23392d6)
`npm run build` passes. check:explorer 13/13, check:staking 8/8, check:privacy 148/148, check:tx 28/28, check:forms 20/20, check:handles 46/46. check:dex has 10 passes and 4 failures, because the live LCD is down (530); it fails the same way on 4fa9191.

## 2026-10-03 · Clients round 6: chain 203d3b2 (audit 5 chain fixes)

_Was `CLIENT_FIX6_PROGRESS.md`._

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

### Checks
- npm run build: ok.
- check:privacy 164 PASS / 0 FAIL, check:tx 28/0, check:forms 20/0, check:handles 49/0 (incl. the swap vectors).
- check:explorer 13/0 and check:staking 8/0 exit 0.
- check:dex: 4 FAIL (at least one pool, swap fee, lp unbonding seconds, apr), because lcd.erth.network answers Cloudflare 1033 (tunnel down). These are not code failures.

### Chain issues
- None found on the web side.

## 2026-10-03 · Web audit round 6 (audit6-web)

_Was `WEB_FIX6_PROGRESS.md`._

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
| L-10 extra decimals said, not dropped | done | 67c5e2f |
| L-11 refuse to sign on account read failure | done | 2af6b94 |
| L-12 build image, nginx pin, vite/postcss | done | d3254ad |
| O-1 tunnel host docs, http->https | done (docs) | b4a0c9d |
| I-2 fresh npm ci + build ships .well-known | verified; guard in d3254ad | b4a0c9d |

### L-1
- `dex.withdrawalNoteLegProblem` and the dex 1101 sentence in `tx.js` now say "32 notes of 2^63 - 1 units"; doc comments no longer say "past a note's u64".
- `check:privacy` asserts the new text on both the pre-sign refusal and the 1101 explanation.

### L-2
- The chain (c0ad1dd) keeps no human result after a round: `endProposalRound` removes the ballot and `Query/ProposalTally` then answers a zero tally with approved=false. The outcome is only an EndBlock event, not state.
- Governance reads `assembly.proposalTally` only for `PROPOSAL_STATUS_VOTING_PERIOD`. A finished proposal shows `ClosedHumanTally`: the tally is not kept after voting, and the status badge is the outcome of both chambers. `approved` is never rendered for a closed round.
- `check:forms` asserts both.

### L-3
- `dex.boundSwapQuote(micro, from, to)` -> `{ micro, from, to, out, at }`; `dex.swapFloor(quote, micro, from, to, slippage, now)` is "0" unless the quote is for exactly that amount and pair, positive, and younger than `QUOTE_TTL_MS` (20 s, shared with BuyAnml).
- SwapTokens re-asks the quote every 10 s and ticks `now`, so an expired quote disables Swap; `handleSwap` signs the floor from `swapFloor` at click time.
- `check:privacy` L-3 checks.

### L-4
- `dex.withdrawalNoteLegProblemNow(poolId, shares)` reads `dex.pool(id)` and the LP supply together at sign time; either read failing refuses ("cannot be checked"). Markets' ANML withdrawal uses it instead of the page-load reserve.
- Not closed client-side: the chain checks the leg folded with an earlier same-block withdrawal from the pool, which the client cannot see (documented in the doc comment).
- `check:privacy` L-4 checks (over, at cap, pool read fails, supply read fails).

### L-6
- `allocation.streamView` pages until `next_key` is empty, guarded at `MAX_OPTION_PAGES` = 1000 pages (100 000 options). It returns `partial: true` when a later page fails, a page key repeats, or the guard is hit. Aggregates (`total_weight`, `epoch`) come from the first page.
- Shares use the chain's `total_weight` (x/allocation TotalWeight = the sum over live options): the pie (unread weight is its own "Options not read" slice), the options table, and Markets' `lpRewardShare` (Markets now reads `streamView`). Caretaker and Groundworks pages show a "Partial list" note.
- `check:privacy` L-6 checks (3000 options, failed page, repeated key, guard, failed first page).

### L-7
- `allocation.splitPercent` (integer 1..100 or null) and `allocation.splitProblem(weights)` mirror x/allocation `ValidateSplit`: each share 1..100, distinct options, at most 20 (`MaxVoterOptions`), sum exactly 100. `msgSetAllocations` throws on a problem.
- AllocationFund keeps each share as typed (no `parseInt || 0` coercion), shows the problem, and disables Set Allocation while there is one.
- `check:forms` L-7 checks.

### L-8
- `handles.js`: `MAX_ROWS` = 1 000 000 (pages capped at MAX_ROWS / PAGE); `check()` refuses the whole directory (chain or stream) on a row past the cap or an entry outside `0 < expires_at <= renewal_until <= now + 10 years` (`timesOk`, 365-day years as the Android wallet). A stream whose page 0 claims more than 1 000 000 rows (or a non-integer size) is refused before page 1. Both readers take `now` (the directory's clock).
- `check:handles` L-8 checks.

### L-9
- `personhood.leaseBounds` refuses (null) a handle or caretaker lease outside 1 s..10 years or a margin outside 0..10 years (`LEASE_MAX_SECONDS`), as spec §4h and the Android `leaseParam`. Display only (wait days).
- `check:privacy` L-9 checks.

### L-10
- `tokens.toMicro` refuses ("0") an amount with non-zero digits past the denom's decimals instead of truncating it (trailing zeros are fine), so every `amountOk` gate disables its button and nothing smaller than typed is signed.
- `tokens.amountNote` + `components/AmountNote.jsx`: "ERTH has at most 6 decimal places; remove the extra digits." under every typed amount input (Swap, BuyAnml, Shield, auction bid, self-bond / unbond / create-validator, Governance deposit x2, Markets add x2 and remove x2).
- `check:forms` L-10 checks (incl. every decimal input has a note).

### L-11
- `tx.fetchAccount` (now exported): only the LCD's 404 (x/auth NotFound) is a new account (0/0). Any other error (5xx, network) or a malformed answer throws "Could not read your account … nothing was signed", so `broadcast` signs nothing.
- `check:tx` L-11 checks (404, 530, network error, malformed, wrapped account, broadcast posts nothing).

### L-12
- vite ^6.4.3 (6.4.3) and `npm audit fix` (no --force): postcss 8.5.28, nanoid 3.3.19, browserslist 4.29.3, @babel/* 7.29.7+, baseline-browser-mapping 2.11.27. All dev/build only; production deps unchanged. `npm audit`: 0 vulnerabilities (was 6, 4 high).
- Dockerfile build stage: `node:24.21.0-alpine3.24@sha256:ebfe2f90…ec1c1` (Node 24 Krypton, active LTS; was node:18, EOL). Serve stage: `nginx:1.31.6-alpine3.24@sha256:df221db8…abeac2` (the nginx:alpine index digest on 2026-10-03). Digests read from registry-1.docker.io.
- `.dockerignore` now excludes `build` and `build-check`: the image never sees a local build.
- Checks: `check:dex` reads the live LCD (`lcd.erth.network` answers 530, no chain behind it); its 4 failures are that empty read, as in round 5. Every other check passes.

### O-1 (docs only)
- `deploy/akash/README.md`: the tunnel's Public Hostname is `erth.network -> http://web:80` (the apex: App Link host, `og:url`, `MOBILE_APP_URL`; `app.erth.network` has no DNS record). Adds post-deploy curl checks.
- http -> https: TLS ends at Cloudflare and nginx only sees plain HTTP from the tunnel, so the redirect is Cloudflare's "Always Use HTTPS" (an nginx redirect would loop). No nginx change. Live on 2026-10-03, `http://erth.network/` answers 200, so the setting needs turning on; noted in the README.
- `security-headers.conf` HSTS comment corrected (apex; includeSubDomains covers lcd/rpc/api).
- Still needed by hand: redeploy (tag, CI pin, `deploy/akash/deploy.sh`) and the Cloudflare setting.

### I-2
- Fresh clone of this branch, Node 24.21.0 (the image's toolchain), `npm ci` + `npm run build`: `build/.well-known/assetlinks.json` and `apple-app-site-association` present and byte-identical to `public/.well-known`; `npm audit` 0; check:tx/handles/privacy/forms pass there too.
- The Dockerfile now fails the image if either file is missing (`RUN test -s ...`), and `.dockerignore` keeps a local `build/` out of the context.
- npm 11 (Node 24) reports esbuild's postinstall as not covered by allowScripts; it only verifies the binary, the platform package is used either way, and the build succeeds.
- Local `node_modules` in this worktree was a symlink into `app-privacy`; it is now a real `npm ci` of this lockfile (gitignored, local only).

### Final gate (after b4a0c9d)
- `npm run build`: ok.
- check:tx 34/0, check:handles 58/0, check:privacy 182/0, check:forms 33/0, check:explorer 13/0, check:staking 8/0.
- check:dex 10/4: the 4 are the live LCD read (`lcd.erth.network` 530, no chain), unchanged from round 5.
- Not in scope: L-5, I-1, I-3, X-1.

## 2026-10-04 · Drift from chain c3bf5ef

Chain-orch c3bf5ef (Groundworks weight at Bonded validators since fd79d39;
Query/Validators since b7e77f8; undelegations paid out automatically; one
stake note per validator).

### Medium: Groundworks weight outside the active set
- `allocation.groundworksVoter` reads the account's own validator
  (`/cosmos/staking/v1beta1/validators/{valoper}`) and returns weight "0"
  unless it is `BOND_STATUS_BONDED`, whatever the voter record or the raw
  self-delegation says; it also returns `validatorStatus`. Before, a jailed,
  unbonding or unbonded operator saw weight and an enabled Save, and the tx
  failed at deliver with ErrNoWeight, fee spent. An unread status throws
  rather than passing for weight.
- AllocationFund: "Your validator isn't in the active set ... so it has no
  Groundworks weight"; Save is off at zero weight or an unread one.
- `tx.KNOWN_ERRORS`: allocation 1105 (ErrNoWeight) has its own sentence.
- check:governance: UNBONDING and UNBONDED give zero weight with a record
  and without; check:tx: ErrNoWeight explained.

### StakeErth: paged Query/Validators
- `shieldedStaking.validators()` walks `/earth/shieldedstaking/v1/validators`
  (200 a page) and compares each page's `height`; a walk that spans a block is
  repeated (3 tries), then marked partial. The LCD's height header cannot get
  through the CORS preflight (as for `explorer.supplyAtHeight`).
  `validator()` and `validatorBooks()` (one query per validator) are gone.
- The table adds a Delegations column (`delegatable`; the refusal in plain
  words, the chain's text on hover), a Removed badge and rows for books whose
  validator x/staking removed. Power, commission and uptime come from the
  quotes' x/staking records (`explorer.validatorRows`, `signingContext`).
- check:staking: two pages at one height, refusal, removed book, pages at two
  heights (re-walked, partial), a failed later page (partial).

### Copy
- ExplorerShielded, StakeErth and the shieldedStaking.js header no longer
  speak of unbond claims or claiming: a matured undelegation is paid into the
  pool by the chain, and derth is one note per owner and validator.

### Protos
- `CHAIN_REF=c3bf5ef ./scripts/gen-proto.sh ../chain-orch`: signed msgs
  change only in comments; cosmos/staking is generated because
  shieldedstaking's query.proto imports it.

### Logos
- coin/USDC.png and coin/ATOM.png never existed (not in this repo's history
  or elsewhere under projects/). `tokens.logoOf` gives a token's own logo or
  the neutral `coin/generic.svg`; Markets (built paths from the symbol) and
  SwapTokens (fell back to ERTH's logo) use it. check:amounts fails on a logo
  the app does not ship.

### Final gate
- `npm run build`: ok.
- `npm run check`: tx 40/0, amounts 25/0, dex 40/0, handles 50/0, shielded
  89/0, governance 38/0, personhood 17/0, staking 22/0, explorer 19/0.
- check:dex-live 10/4: the 4 are the live LCD read (`lcd.erth.network` 530).

## 2026-10-06 · Pre-relaunch cleanup (chain-orch 6d3500a)

Feature freeze; no behavior change.

- Removed: an unused import (BuyAnml `minimumReceived`); CSS no component
  applies (viewing-key buttons, the arb tooltip, Markets' old claim-all /
  timer / claim button, AllocationFund's message boxes, Forms `.select`,
  Layout `.layout-loading`); the unlinked Create React App `manifest.json`
  and its `logo192` / `logo512`; the context objects' unused default exports;
  comments about the Secret-network port.
- `utils/apiUtils.jsx` folded into `utils/formatUtils.jsx`, which also takes
  the identical page helpers (`formatAmount`, `formatErth`).
- Chain drift c3bf5ef → 6d3500a in `proto/`: one comment in personhood
  tx.proto; protos not regenerated.
- `src/proto` left as generated. Not reachable from the three imported tx
  files (tree-shaken out of the bundle, and recreated by gen-proto.sh):
  amino, cosmos_proto, gogoproto, google/*, cosmos/{app,msg,gov,staking,
  base/query}, earth/assembly, earth/personhood, earth/shieldedstaking,
  earth/dex/{pool,auction,unbonding}. `cosmos/staking/v1beta1/staking.ts`
  imports a `tendermint/` tree that is not generated.
- `npm run build` ok; `npm run check` all passed; check:dex-live fails only
  on the offline LCD (Cloudflare error page).

## 2026-10-06 · Final audit fixes (final-web-docs.md, chain f3ef15b)

- W-3, W-7: privacy policy rewritten. Each registration publishes country,
  signing certificate (DSC commitment), time, referrer handle and the passport
  identifier; the identifier is recomputable by anyone holding issuer,
  document number and DOB, and guessable where numbers are predictable. Our
  node and Cloudflare are named with what they receive; the no-logs policy is
  stated as trust-based, with running your own node (Settings → Network) as
  the way out. Stale "transparent chain" and referrer-lookup lines gone.
  /ref/:handle says the referrer handle is published with the registration.
- W-1: operator rewards/commission withdraw removed (chain always refuses);
  the panel says the income compounds into the self-bond at epoch end.
- W-2: validators, signing infos and the moniker list walk every page
  (`rest.getAllPages`); the validators page flags a partial read.
- W-5: registration lookup by passport nullifier removed.
- W-6: Keplr account switch gives a reconnect message and signs nothing;
  allocation 1105 names both causes; Shield / Buy ANML Max keeps back
  `MAX_FEE_UERTH` (default gas at Keplr's high gas price, 16,000 uerth).
- W-8: bare `uusdc` / `uatom` labels dropped; IBC USDC to be added pinned by
  hash once its channel exists.
- W-4 (cloudflared in the deploy SDL) is the deploy repo's.
- `npm run build` ok; `npm run check` all passed (tx 42, amounts 26, dex 40,
  handles 50, shielded 89, governance 38, personhood 15, staking 22,
  explorer 20). check:dex-live 10/4: the 4 are the offline LCD.
