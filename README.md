# ERTH Network Application

The web interface for the **earth network** — a sovereign Cosmos SDK chain. It provides
token swapping, staking, liquidity management and governance over the two allocation funds.

## Overview

Earth is a Cosmos SDK chain with a public layer and a private one.

- **Public:** transparent ERTH, validators and their self-bond, dex pool reserves and LP
  shares, allocations (both funds' splits), emission payouts, governance proposals, IBC.
- **Private:** shielded ERTH, all ANML (it exists only as notes), private staking, and
  everything a registered human does — registration, the daily ANML claim, caretaker
  splits, assembly votes, referrer bindings. These are zero-knowledge proofs over notes and
  an identity tree that only the wallet holds.

The web app has no prover. It signs the transparent actions with Keplr and shows the
public aggregates of the private layer — supplies, validator rates, positions, tallies —
never a balance or "my registration", which the chain deliberately cannot answer. Every
private action points to the Earth Wallet mobile app.

| Module | What the web app does with it |
| --- | --- |
| `x/dex` | Transparent swaps and LP, the liquidity auction; ERTH → ANML (`MsgBuyAnml`) and ANML-pool withdrawals paid as notes to a shielded address. Selling ANML and adding to its pool are proofs on the phone. |
| `x/allocation` | Both funds' options and weights; payouts of ADDRESS options; a validator's transparent Groundworks split. |
| `x/personhood` | Registration counts (by country, by signer, by nullifier), identity tree, caretaker voter count, referrer lookup. |
| `x/assembly` | Human tallies on proposals, ballot exclusions, removal ballots. |
| `x/shielded` | Note tree and per-asset turnstiles; shielding ERTH to an `erthz1…` address (`MsgShield`). |
| `x/shieldedstaking` | Epoch, each validator's derth rate / supply / backing, Groundworks positions, proposal snapshots. |
| `x/staking`, `x/gov` | Validators; operator self-bond and create-validator; proposals, deposits, a validator's stake vote. |

## Features

- **Swap Tokens** — single `MsgSwap` against `x/dex`; ERTH is the hub. ANML is bought on the ANML page.
- **Markets** — pools, APR, add/remove liquidity (escrowed withdrawals, POL schedules).
  Adding to the ANML/ERTH pool is mobile-only (its ANML leg is a note); a Keplr LP holder can
  withdraw, with the ANML leg paid as a note to an `erthz1…` address.
- **Shield ERTH** (`/shield`) — `MsgShield` from Keplr to a pasted or scanned `erthz1…`
  shielded address (from the Earth Wallet app's Receive screen); the note is encrypted to
  it so the app finds it on its next sync. The amount is public, the recipient is not.
- **ANML** (`/anml`) — Buy ANML with ERTH (`MsgBuyAnml`, the note to an `erthz1…` address,
  minimum out from the chain's exact AMM maths less a slippage tolerance); supply, how much is shielded, pool price, buyback burn.
- **Staking** — validators with private-staking rates, epoch clock, pool totals. Only a
  validator's operator can delegate transparently, so a connected operator gets self-bond
  bond/unbond/cancel and reward + commission withdrawal; other accounts get a
  create-validator form. Holders stake privately from the app.
- **Governance** (`/governance`) — proposals with the stake tally (self-bond + private
  derth), the human tally and its bar, the human ballot's excluded country / signer, and
  the stake snapshot. Keplr can deposit, submit a text proposal and cast an operator's vote.
- **Caretaker Fund** — read-only: options, weights, splits counting vs registered humans.
- **Groundworks Fund** — options, weights, every position, open removal ballots; an
  operator's transparent split.
- **Referrers** (`/referrers`) — is an address a live referrer, and until when.
- **Explorer** — blocks, transactions, accounts, validators, burns, registrations (map,
  lookup by passport nullifier, count by Document Signer, identity tree) and the shielded
  pool (`/explorer/shielded`: note count, roots, turnstiles per asset).

## Architecture

All chain I/O lives in **`src/chain/`**. Nothing else builds transactions or parses chain JSON.

| File | Responsibility |
| --- | --- |
| `config.js` | LCD URL, chain id, denoms, Keplr chain registration, mobile app link. |
| `rest.js` | LCD GET helpers (`get` throws, `getOr` falls back). |
| `tx.js` | Keplr connect, the cosmjs message registry (signed msgs only), sign + broadcast. |
| `bank.js` | Balances, supply. |
| `dex.js` | Pools, swap quoting (and the chain's exact integer AMM maths), swap/LP messages, escrowed withdrawals, auction, POL schedules, `buyAnmlTo` / `removeLiquidityToShielded`. |
| `staking.js` | Pool totals and the operator-only self-bond / create-validator messages. |
| `shieldedStaking.js` | Epoch, per-validator rates, positions, proposal snapshots. |
| `shielded.js` | Note tree, assets, turnstiles; `MsgShield` / `shieldTo` (shield to an `erthz1…` address). |
| `poseidon2.js`, `privacy.js` | Poseidon2 (BN254, the chain's `zk/poseidon2`), asset ids, `pc`, `cm` (`zk/privacy`). |
| `shieldedAddress.js` | The `erthz1…` shielded address (bech32m, 116 chars): decode / validate / encode. |
| `noteCipher.js` | Note ciphertext encryption to a shielded address, v1 (fixed value) and v2 (value-blind), sender side only. |
| `personhood.js` | Registration counts and lookups, identity tree, caretaker voters, referrers. |
| `assembly.js` | Human tallies, ballot inputs, removal ballots. |
| `gov.js` | Proposals, stake tally, vote/deposit/proposal messages. |
| `allocation.js` | Options and totals for both streams (`STREAM_CARETAKER` / `STREAM_GROUNDWORKS`). |
| `explorer.js` | Blocks, transaction search, validators, burns, search-term routing. |
| `bytes.js` | base64/hex and `CountryField` decoding. |
| `tokens.js` | Denom metadata and micro/macro unit conversion. |

Transactions are signed with Keplr using **direct (protobuf) signing** and broadcast through
the **LCD** rather than a Tendermint RPC endpoint, so the app only needs one host.

`src/proto/` holds JS encoders generated from the chain's `.proto` files — regenerate with
`./scripts/gen-proto.sh [chain-dir]` whenever the chain's messages change (requires
[`buf`](https://buf.build); no `protoc` needed). `CHAIN_REF=HEAD` generates from the
chain's last commit instead of its working tree.

The note formats (`erthz1…` address, note ciphertext, Poseidon2 derivations) are the
chain's (`zk/privacy`) and must match it and the Earth Wallet app byte for byte;
`npm run check:privacy` pins them with golden vectors from both.

Notes of a fixed value (`MsgShield`) carry the v1 ciphertext (217 bytes, bound to the
note's cm). Notes whose value the chain decides (`MsgBuyAnml`'s output, the ANML pool's
withdrawal payout) carry the value-blind v2 ciphertext (177 bytes: rho, rcm, memo); the
recipient's wallet completes cm from the amount the chain publishes for that note.

## Getting Started

### Prerequisites

- Node.js v18.20.7 or later
- npm
- [Keplr](https://www.keplr.app/) browser extension
- A reachable earth LCD endpoint (see below)

### Installation

```bash
npm install
```

### Development

Run a local chain from the `earth-network-chain` repo:

```bash
ignite chain serve            # LCD on :1317
```

Then start the app:

```bash
npm run dev                   # http://localhost:3000
```

Vite proxies `/lcd` to `http://localhost:1317`. To develop against a different node:

```bash
EARTH_LCD=https://lcd.example.network npm run dev
```

Earth is not in Keplr's built-in registry, so the app calls `experimentalSuggestChain` on
connect. `VITE_EARTH_RPC` should be set for that to fully register the chain in Keplr.

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `EARTH_LCD` | Dev-only: proxy target for `/lcd`. | `http://localhost:1317` |
| `VITE_EARTH_LCD` | Production LCD endpoint. | `https://lcd.erth.network` |
| `VITE_EARTH_RPC` | Tendermint RPC, used for Keplr chain registration. | *(empty)* |
| `VITE_EARTH_CHAIN_ID` | Chain id. | `earth-1` |
| `VITE_MOBILE_APP_URL` | Where "Get the app" links point. | `https://erth.network` |

> **TODO before deploying:** point `VITE_EARTH_LCD`/`VITE_EARTH_RPC` at the real endpoints.

### Checks

These run the real `src/chain/` code against a live LCD, which is the only thing that
catches a field the chain has renamed — a shape mismatch surfaces as a plausible zero
rather than an error.

```bash
VITE_EARTH_LCD=https://lcd.erth.network npm run check:dex        # pools, APR inputs, auction, escrow, POL
VITE_EARTH_LCD=http://127.0.0.1:1317     npm run check:staking   # needs a multi-validator testnet
npm run check:staking                                             # without an LCD: operator msg builders only
npm run check:explorer                                            # fixture-driven, no chain needed
npm run check:privacy                                             # fixture-driven: personhood/assembly/shielded/staking/gov reads,
                                                                  # plus note-format golden vectors (Poseidon2, erthz, ciphertext)
npm run check:tx                                                  # stubbed Keplr + LCD: a tx whose outcome cannot be read is
                                                                  # "submitted, status unknown" and blocks resubmission until it resolves
                                                                  # (per account)
npm run check:forms                                               # stubbed LCD: Buy ANML signs only a fresh quote of the same amount;
                                                                  # add-liquidity min_shares priced on reserves read at submit
```

### Building for Production

```bash
npm run build                 # outputs to build/
```

## Deployment

Deployment is driven by GitHub Actions, which builds the frontend and serves `build/` via
nginx (see `Dockerfile` and `nginx.conf`).
