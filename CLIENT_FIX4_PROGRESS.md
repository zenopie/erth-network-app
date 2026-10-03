# Clients audit round 4 fixes — progress

## WEB (app-orch, privacy/orchard)
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
