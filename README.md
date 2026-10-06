# ERTH Network Application

The web interface for the **earth network**, a sovereign Cosmos SDK chain: swaps,
liquidity, the liquidity auction, validator operations, governance and the two
allocation funds, a handle directory, and an explorer. Served at https://erth.network.

## Overview

Earth is a Cosmos SDK chain with a public layer and a private one.

- **Public:** transparent ERTH, validators and their self-bond, dex pool reserves and
  total shares, allocations (both funds' splits and payouts), Groundworks positions,
  governance proposals, IBC.
- **Private:** shielded ERTH, all ANML (it exists only as notes), private LP shares,
  private staking (stake notes), and everything a registered human does: registration,
  the daily ANML claim, Caretaker splits, assembly votes, handles. These are
  zero-knowledge proofs over notes and an identity tree that only the wallet holds.

The web app has no prover. It signs transparent actions with Keplr and shows the public
aggregates of the private layer (supplies, validator rates, positions, tallies), never a
balance or "my registration", which the chain deliberately cannot answer. Every private
action points to the Earth Wallet mobile app. The private msgs carry no signer and are
never built here: the cosmjs registry holds only Keplr-signed msgs.

| Module | What the web app does with it |
| --- | --- |
| `x/dex` | Transparent swaps and LP, the liquidity auction; ERTH → ANML (`MsgBuyAnml`) and ANML-pool withdrawals paid as notes to a shielded address. Selling ANML, private LP and adding to the ANML pool are proofs on the phone. |
| `x/allocation` | Both funds' options and weights; payouts of ADDRESS options; a validator's transparent Groundworks split. |
| `x/personhood` | Registration counts (by country, by signer; no per-nullifier lookup), identity tree, caretaker voter count, the handle directory, lease bounds. |
| `x/assembly` | Human tallies on proposals while they vote, ballot exclusions, removal ballots. |
| `x/shielded` | Note tree and per-asset turnstiles; shielding ERTH to an `erthz1…` address or a handle (`MsgShield`). |
| `x/shieldedstaking` | Epoch, each validator's derth rate / supply / backing, Groundworks positions, proposal snapshots. |
| `x/staking`, `x/gov` | Validators; operator self-bond and create-validator; proposals, deposits, a validator's stake vote. |

## Pages

- **Swap Tokens** (`/swap-tokens`): `MsgSwap` against `x/dex`; ERTH is the hub. The
  minimum out comes from a quote of exactly that amount and pair, younger than 20 s.
- **Markets** (`/markets`): pools, APR, add and remove liquidity (escrowed withdrawals,
  POL schedules). Adding to the ANML/ERTH pool is mobile-only (its ANML leg is a note);
  a Keplr LP holder can withdraw, with the ANML leg paid as notes to an `erthz1…` address.
- **Liquidity Auction** (`/liquidity-auction`): bids and claims.
- **ANML** (`/anml`): buy ANML with ERTH (`MsgBuyAnml`, the note to an `erthz1…`
  address); supply, how much is shielded, pool price, buyback burn.
- **Shield** (`/shield`): `MsgShield` from Keplr to an `erthz1…` address (from the
  wallet's Receive screen) or to `@handle`. The amount is public, the recipient is not.
  A handle is resolved from the whole directory and checked against the chain's own
  copy before anything is signed.
- **Handles** (`/handles`): the whole handle directory, searched locally. A row is shown
  as payable or copyable only once it matches the chain's directory. Pay links carry the
  handle in the URL fragment, never the query.
- **Staking** (`/stake-erth`): validators with private-staking rates, the epoch clock,
  positions. Only a validator's operator can delegate transparently, so a connected
  operator gets self-bond bond/unbond/cancel and its pending income, which compounds into
  the self-bond each epoch (the chain refuses reward and commission withdrawals); other
  accounts get a create-validator form. Holders stake privately from the app.
- **Governance** (`/governance`): proposals with the stake tally (self-bond + private
  derth), the human tally and its bar while voting, the ballot's excluded country /
  signer, and the stake snapshot. Keplr can deposit, submit a text proposal and cast an
  operator's vote.
- **Caretaker Fund** (`/caretaker-fund`): options, weights, splits counting vs
  registered humans. Read-only: splits are cast from the phone.
- **Groundworks Fund** (`/groundworks-fund`): options, weights by validator, every
  position, open removal ballots; an operator's transparent split.
- **Explorer** (`/explorer`): blocks, transactions, accounts, validators, burns,
  registrations (map, count by Document Signer, identity
  tree) and the shielded pool (`/explorer/shielded`: note count, roots, turnstiles).
- **Referral link** (`/ref/<handle>`): opens Earth Wallet when it is installed (App
  Link / universal link, see `deploy/assetlinks.md`); otherwise this page names the
  handle to enter at registration. It makes no lookup.
- **Privacy policy** (`/privacy-policy`).

Every page renders inside an error boundary (`components/ErrorBoundary.jsx`), keyed by
path, so one page's crash leaves the sidebar up.

## Architecture

All chain I/O lives in **`src/chain/`**. Nothing else builds transactions or parses chain
JSON.

| File | Responsibility |
| --- | --- |
| `config.js` | LCD, RPC and backend URLs, chain id, denoms, Keplr chain registration, mobile app link. |
| `rest.js` | LCD GET helpers (`get` throws, `getOr` falls back, `text` coerces); every request refuses redirects. |
| `tx.js` | Keplr connect, the cosmjs registry (Keplr-signed msgs only), sign + broadcast, the per-account pending tx, error explanations. |
| `address.js` | Canonical lowercase bech32. |
| `bank.js` | Balances, supply, whether a denom may move. |
| `dex.js` | Pools, quotes (the chain's simulation, else its exact integer AMM maths), quote-bound floors, swap/LP msgs, deposit legs, escrowed withdrawals, auction, POL schedules, `buyAnmlTo` / `removeLiquidityToShielded`. |
| `apr.js` | Pool APR from the chain's reported volume. |
| `staking.js` | Pool totals and the operator-only self-bond / create-validator msgs. |
| `shieldedStaking.js` | Epoch, per-validator rates, positions, stake tree, proposal snapshots. |
| `shielded.js` | Note tree, assets, turnstiles; `MsgShield` / `shieldTo`. |
| `poseidon2.js`, `privacy.js` | Poseidon2 (BN254, the chain's `zk/poseidon2`), asset ids, `pc`, `cm` (`zk/privacy`). |
| `shieldedAddress.js` | The `erthz1…` shielded address (bech32m, 116 chars): decode / validate / encode. |
| `noteCipher.js` | Note ciphertexts to a shielded address, sender side only: v2 (value-blind, what the web app sends) and v1 (kept with its golden vector). |
| `handles.js` | The handle directory: the backend's stream or the chain's pages, read whole and checked; verification against the chain; resolving a handle for payment. |
| `personhood.js` | Registration counts and lookups, identity tree, caretaker voters, params, lease bounds. |
| `assembly.js` | Human tallies, ballot inputs, removal ballots. |
| `gov.js` | Proposals, stake tally, vote/deposit/proposal msgs. |
| `allocation.js` | Options (paged to the end) and totals for both streams, voters, split validation. |
| `explorer.js` | Blocks, transaction search, validators, burns, search-term routing. |
| `bytes.js` | base64/hex and `CountryField` decoding. |
| `tokens.js` | Denom metadata, exact decimal amounts (`toMicro`, `amountOk`, `amountNote`), BigInt weights. |

Transactions are signed with Keplr using **direct (protobuf) signing** and broadcast
through the **LCD**. A tx whose outcome cannot be read is "submitted, status unknown",
and that account cannot send again until the hash resolves.

`src/proto/` holds encoders generated from the chain's `.proto` files. Regenerate with
`./scripts/gen-proto.sh [chain-dir]` whenever the chain's msgs change (requires
[`buf`](https://buf.build); no `protoc`). `CHAIN_REF=<ref>` generates from that commit of
the chain instead of its working tree.

The note formats (`erthz1…` address, note ciphertext, Poseidon2 derivations) are the
chain's (`zk/privacy`) and must match it and the Earth Wallet app byte for byte (formats:
the mobile repo's `PRIVACY_FORMATS.md`); `npm run check:shielded` pins them with golden
vectors from both. Every note the web app asks the chain to mint (`MsgShield`, the
`MsgBuyAnml` output, an ANML-pool withdrawal) carries the value-blind v2 ciphertext
(177 bytes: rho, rcm, memo); the recipient's wallet completes cm from the amount the
chain publishes for that note.

## Getting started

Requires Node.js (the image builds with Node 24), npm, and the
[Keplr](https://www.keplr.app/) extension.

```bash
npm ci
npm run dev                   # http://localhost:3000
```

In dev, vite proxies `/lcd`, `/rpc` and `/api` to a local node and backend. Bring a node
up with the chain repo's `./scripts/testnet-3val.sh up`, or point the proxies elsewhere:

```bash
EARTH_LCD=https://lcd.erth.network EARTH_RPC=https://rpc.erth.network npm run dev
```

Earth is not in Keplr's built-in registry, so the app calls `experimentalSuggestChain`
on connect.

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `EARTH_LCD`, `EARTH_RPC`, `EARTH_API` | Dev only: proxy targets for `/lcd`, `/rpc`, `/api`. | `localhost` :1317, :26657, :8000 |
| `VITE_EARTH_LCD` | LCD endpoint. | `https://lcd.erth.network` |
| `VITE_EARTH_RPC` | CometBFT RPC (Keplr registration, the explorer's block ranges). | `https://rpc.erth.network` |
| `VITE_EARTH_API` | Privacy backend, for the handle directory stream; `""` reads the chain's pages only. | `https://api.erth.network` |
| `VITE_EARTH_CHAIN_ID` | Chain id. | `earth-1` |
| `VITE_MOBILE_APP_URL` | Where "Get the app" links point. | `https://erth.network` |

The image is built without `VITE_` variables, so the defaults are what ships.

### Checks

There is no test framework. Each feature has a check file in `scripts/checks/` that runs
the real `src/chain/` code (bundled by vite, run under node) and prints PASS or FAIL per
case; any FAIL exits 1. Run them after any change:

```bash
npm run check                 # every stubbed group below; no chain needed
npm run check:<group>         # one group
```

| Group | What it pins |
| --- | --- |
| `tx` | broadcast: status unknown vs failed, the per-account pending tx, timeout heights, no redirects, account read failures sign nothing; the chain's error codes explained |
| `amounts` | exact decimal amounts, unknown denoms, Max past 2^53, BigInt weights; every page's amount inputs |
| `dex` | x/dex's own fee, hop and deposit vectors (`scripts/fixtures/dex-*.json`), quotes, quote-bound floors, the ANML withdrawal note-leg cap |
| `handles` | the directory read whole and refused when malformed, oversized or shifting; verification against the chain; paying a handle; the pages' gating |
| `shielded` | Poseidon2, asset ids, pc/cm, `erthz1…` addresses, note ciphertexts and the note-minting msgs against golden vectors (`scripts/fixtures/privacy-vectors.json`); pool reads |
| `governance` | gov and assembly reads, Groundworks voters, option paging, split validation; the governance pages |
| `personhood` | registration reads, params, lease bounds |
| `staking` | operator msg builders, private staking reads (plus a live read when `VITE_EARTH_LCD` is set) |
| `explorer` | validator uptime and jailing, proposer addresses, canonical addresses, route params in queries |

`npm run check:dex-live` reads a running chain (`VITE_EARTH_LCD`, default the public
LCD): the field names a stub cannot catch drifting. It fails while no chain answers
there.

## Deployment

`Dockerfile` builds the bundle (Node 24) and serves `build/` with nginx (`nginx.conf`,
`security-headers.conf`). A `vX.Y.Z` tag makes CI build and push the image and pin its
digest in `deploy/akash/deploy.yaml`; `deploy/akash/deploy.sh` then updates the lease in
place. See `deploy/akash/README.md` (tunnel host `erth.network`, Cloudflare's "Always
Use HTTPS", post-deploy checks) and `deploy/assetlinks.md` (App Link files).

`AUDIT_HISTORY.md` records what each audit round changed.
