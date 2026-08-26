# ERTH Network Application

The web interface for the **earth network** — a sovereign Cosmos SDK chain. It provides
token swapping, staking, liquidity management and governance over the two allocation funds.

## Overview

Earth is a transparent Cosmos SDK chain with native bank denoms (`uerth`, `uanml`, spoke
tokens, and `dexlp/{poolId}` LP shares), native `x/staking`, and three custom modules:

| Module | Role |
| --- | --- |
| `x/dex` | Spoke-and-wheel AMM hubbed on ERTH. Every pool pairs ERTH with one spoke token. |
| `x/allocation` | Both vote-directed emission streams over one engine: the stake-weighted `capital` stream (the **Deflation Fund**) and the one-human-one-vote `human` stream (the **Caretaker Fund**). Ids, totals and epochs are per stream. |
| `x/personhood` | Proof-of-personhood registration and the daily ANML claim. It gates who may vote in the `human` stream; the votes themselves live in `x/allocation`. |

Because the chain is transparent, there are no contracts, SNIP-20 tokens, viewing keys or
query permits: every balance is public and read straight off the LCD. Pages render chain
state before a wallet is connected; connecting only determines *who you are* for signing.

## Features

- **Token Swapping** — single `MsgSwap` against `x/dex`; ERTH is the hub, so token→token
  routes through it on-chain.
- **Staking** — native `x/staking`. Staking delegates to the largest bonded validator (no
  picker UI); unstaking draws largest-first across delegations; rewards are withdrawn from
  every validator you have delegated to. Unbonding is display-only and auto-releases.
- **Liquidity Management** — add/remove liquidity on `x/dex`. LP rewards **auto-compound**
  into each pool's reserves, so there is nothing to claim. Withdrawals are escrowed for
  `lp_unbonding_seconds` rather than paid out at once: the shares stay in the outstanding
  supply and the pool keeps trading on the liquidity behind them, so the position keeps
  earning fees and rewards for the whole wait and is priced at maturity. Pending withdrawals
  are listed under the pool's Remove tab and pay out on their own — nothing is signed to
  collect them. A pool whose protocol-owned liquidity is still being retired shows how much
  of it is left and when the schedule ends.
- **Liquidity Auction** (`/liquidity-auction`) — the one-shot genesis liquidity event. Half
  the earmark is paid to bidders pro rata, half is paired with everything raised to open the
  pool, so it opens at exactly the price the auction cleared at. The page shows the window's
  state, what it is clearing at, and a bid or claim form; bids are additive and final.
- **Caretaker Fund** — direct the democratic emission stream (one registered human, one vote).
- **Deflation Fund** — direct the stake-weighted emission stream (your bonded stake is your weight).
- **ANML Claim** — registration and the daily claim happen in the mobile app (passport ZK
  proofs are generated on-device); this page links to it.
- **Explorer** — blocks, transactions, accounts and validators, read straight from the LCD.
  Search accepts a block height, a 64-character tx hash, or an `earth1…` address:
  `/explorer`, `/explorer/validators`, `/explorer/registrations`, `/explorer/block/:height`,
  `/explorer/tx/:hash`, `/explorer/account/:address`. The registrations view maps proof-of-
  personhood signups by the passport's issuing country, which the chain derives from the
  Document Signer certificate at registration time. Validator uptime is measured over the slashing window
  (`signed_blocks_window`) — the window that actually decides jailing — rather than all time.

## Architecture

All chain I/O lives in **`src/chain/`**. Nothing else builds transactions or parses chain JSON.

| File | Responsibility |
| --- | --- |
| `config.js` | LCD URL, chain id, denoms, Keplr chain registration. |
| `rest.js` | LCD GET helpers (`get` throws, `getOr` falls back). |
| `tx.js` | Keplr connect, the cosmjs message registry, sign + broadcast. |
| `bank.js` | Balances, supply, `MsgSend`. |
| `dex.js` | Pools, swap quoting, swap/add/remove-liquidity messages, escrowed withdrawals, the liquidity auction and POL retirement schedules. |
| `staking.js` | Delegations, rewards, unbonding, delegate/undelegate/withdraw messages. |
| `personhood.js` | Registration status, ANML claim, registration counts by country / signer. |
| `allocation.js` | Options, voter splits and allocation messages for both streams — every call takes a `STREAM_HUMAN` / `STREAM_CAPITAL` argument. |
| `explorer.js` | Blocks, transaction search, validator monikers, search-term routing. |
| `tokens.js` | Denom metadata and micro/macro unit conversion. |

Transactions are signed with Keplr using **direct (protobuf) signing** and broadcast through
the **LCD** rather than a Tendermint RPC endpoint, so the app only needs one host.

`src/proto/` holds JS encoders generated from the chain's `.proto` files — regenerate with
`./scripts/gen-proto.sh` whenever the chain's messages change (requires
[`buf`](https://buf.build); no `protoc` needed).

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

> **TODO before deploying:** point `VITE_EARTH_LCD`/`VITE_EARTH_RPC` at the real endpoints.

### Checks

These run the real `src/chain/` code against a live LCD, which is the only thing that
catches a field the chain has renamed — a shape mismatch surfaces as a plausible zero
rather than an error.

```bash
VITE_EARTH_LCD=https://lcd.erth.network npm run check:dex        # pools, APR inputs, auction, escrow, POL
VITE_EARTH_LCD=http://127.0.0.1:1317     npm run check:staking   # needs a multi-validator testnet
npm run check:explorer                                            # fixture-driven, no chain needed
```

### Building for Production

```bash
npm run build                 # outputs to build/
```

## Deployment

Deployment is driven by GitHub Actions, which builds the frontend and serves `build/` via
nginx (see `Dockerfile` and `nginx.conf`).
