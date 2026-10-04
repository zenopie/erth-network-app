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
| L-10 extra decimals said, not dropped | done | 67c5e2f |
| L-11 refuse to sign on account read failure | done | 2af6b94 |
| L-12 build image, nginx pin, vite/postcss | done | d3254ad |
| O-1 tunnel host docs, http->https | done (docs) | b4a0c9d |
| I-2 fresh npm ci + build ships .well-known | verified; guard in d3254ad | b4a0c9d |

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

## L-11
- `tx.fetchAccount` (now exported): only the LCD's 404 (x/auth NotFound) is a new account (0/0). Any other error (5xx, network) or a malformed answer throws "Could not read your account … nothing was signed", so `broadcast` signs nothing.
- `check:tx` L-11 checks (404, 530, network error, malformed, wrapped account, broadcast posts nothing).

## L-12
- vite ^6.4.3 (6.4.3) and `npm audit fix` (no --force): postcss 8.5.28, nanoid 3.3.19, browserslist 4.29.3, @babel/* 7.29.7+, baseline-browser-mapping 2.11.27. All dev/build only; production deps unchanged. `npm audit`: 0 vulnerabilities (was 6, 4 high).
- Dockerfile build stage: `node:24.21.0-alpine3.24@sha256:ebfe2f90…ec1c1` (Node 24 Krypton, active LTS; was node:18, EOL). Serve stage: `nginx:1.31.6-alpine3.24@sha256:df221db8…abeac2` (the nginx:alpine index digest on 2026-10-03). Digests read from registry-1.docker.io.
- `.dockerignore` now excludes `build` and `build-check`: the image never sees a local build.
- Checks: `check:dex` reads the live LCD (`lcd.erth.network` answers 530, no chain behind it); its 4 failures are that empty read, as in round 5. Every other check passes.

## O-1 (docs only)
- `deploy/akash/README.md`: the tunnel's Public Hostname is `erth.network -> http://web:80` (the apex: App Link host, `og:url`, `MOBILE_APP_URL`; `app.erth.network` has no DNS record). Adds post-deploy curl checks.
- http -> https: TLS ends at Cloudflare and nginx only sees plain HTTP from the tunnel, so the redirect is Cloudflare's "Always Use HTTPS" (an nginx redirect would loop). No nginx change. Live on 2026-10-03, `http://erth.network/` answers 200, so the setting needs turning on; noted in the README.
- `security-headers.conf` HSTS comment corrected (apex; includeSubDomains covers lcd/rpc/api).
- Still needed by hand: redeploy (tag, CI pin, `deploy/akash/deploy.sh`) and the Cloudflare setting.

## I-2
- Fresh clone of this branch, Node 24.21.0 (the image's toolchain), `npm ci` + `npm run build`: `build/.well-known/assetlinks.json` and `apple-app-site-association` present and byte-identical to `public/.well-known`; `npm audit` 0; check:tx/handles/privacy/forms pass there too.
- The Dockerfile now fails the image if either file is missing (`RUN test -s ...`), and `.dockerignore` keeps a local `build/` out of the context.
- npm 11 (Node 24) reports esbuild's postinstall as not covered by allowScripts; it only verifies the binary, the platform package is used either way, and the build succeeds.
- Local `node_modules` in this worktree was a symlink into `app-privacy`; it is now a real `npm ci` of this lockfile (gitignored, local only).

## Final gate (after b4a0c9d)
- `npm run build`: ok.
- check:tx 34/0, check:handles 58/0, check:privacy 182/0, check:forms 33/0, check:explorer 13/0, check:staking 8/0.
- check:dex 10/4: the 4 are the live LCD read (`lcd.erth.network` 530, no chain), unchanged from round 5.
- Not in scope: L-5, I-1, I-3, X-1.
