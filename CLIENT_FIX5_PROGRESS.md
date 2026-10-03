# Clients round 5: final chain formats (chain-orch privacy/orchard 4a663d5) — progress

Formats: mobile-orch PRIVACY_FORMATS.md §3a / §4g. Never pushed.

## WEB (app-orch, privacy/orchard)
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
