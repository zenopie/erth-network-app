import { Registry, makeAuthInfoBytes, makeSignDoc, encodePubkey } from "@cosmjs/proto-signing";
import { encodeSecp256k1Pubkey } from "@cosmjs/amino";
import { fromBase64, toBase64, toHex } from "@cosmjs/encoding";
import { sha256 } from "@noble/hashes/sha2.js";
import { defaultRegistryTypes } from "@cosmjs/stargate";
import { TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";

import { EARTH_CHAIN_ID, EARTH_LCD_URL, UERTH, earthChainInfo } from "./config";
import { get, seg } from "./rest";

import {
  MsgSwap,
  MsgAddLiquidity,
  MsgRemoveLiquidity,
  MsgCreatePool,
  MsgBidLiquidityAuction,
  MsgClaimLiquidityAuction,
  MsgBuyAnml,
} from "../proto/earth/dex/v1/tx";
import {
  MsgSetAllocations,
  MsgClaimAllocation,
} from "../proto/earth/allocation/v1/tx";
import { MsgShield } from "../proto/earth/shielded/v1/tx";

/**
 * Message registry: the stock cosmos types (bank, staking, distribution, gov)
 * plus earth's own module messages, generated from the chain's protos by
 * ./scripts/gen-proto.sh.
 *
 * Only messages a Keplr account signs belong here. The private messages
 * (x/personhood MsgRegister/MsgClaimAnml/MsgSetCaretaker/MsgBindReferrer,
 * x/assembly votes, x/shielded MsgSend, x/dex MsgNoteSwap /
 * MsgAddLiquidityShielded / MsgRemoveLiquidityShielded, everything in
 * x/shieldedstaking) carry no signer at all: they are authorised by Orchard
 * bundles (per-action proofs + a binding signature over the sighash) or
 * stake-circuit proofs, built by the mobile app, which is the only client
 * that proves. The web app never constructs them.
 */
export const registry = new Registry([
  ...defaultRegistryTypes,
  ["/earth.dex.v1.MsgSwap", MsgSwap],
  ["/earth.dex.v1.MsgAddLiquidity", MsgAddLiquidity],
  ["/earth.dex.v1.MsgRemoveLiquidity", MsgRemoveLiquidity],
  ["/earth.dex.v1.MsgCreatePool", MsgCreatePool],
  // Starting the auction is governance's (MsgStartLiquidityAuction is authority-
  // signed), so only the two a bidder sends are registered here.
  ["/earth.dex.v1.MsgBidLiquidityAuction", MsgBidLiquidityAuction],
  ["/earth.dex.v1.MsgClaimLiquidityAuction", MsgClaimLiquidityAuction],
  // One set of allocation messages covers both streams; the stream is a field on
  // the message rather than a separate module.
  ["/earth.allocation.v1.MsgSetAllocations", MsgSetAllocations],
  ["/earth.allocation.v1.MsgClaimAllocation", MsgClaimAllocation],
  // Transparent ERTH -> a shielded note. Signed like any bank send; the note's
  // owner is hidden behind `pc` (chain/shielded.js shieldTo, the Shield page).
  ["/earth.shielded.v1.MsgShield", MsgShield],
  // Transparent coins in, an ANML note out: the one ANML action a Keplr
  // account signs. MsgNoteSwap and MsgAddLiquidityShielded are unsigned
  // private msgs (proofs, built on the phone) and do not belong here.
  ["/earth.dex.v1.MsgBuyAnml", MsgBuyAnml],
]);

// Generous default; the heaviest of these messages (a multi-hop swap) simulated
// at ~160k. Callers can override per transaction.
const DEFAULT_GAS = 400_000;
const GAS_PRICE_UERTH = 0.025;

let wallet = null; // { address, signer }

/** The connected address, or null when no wallet is connected. */
export function getAddress() {
  return wallet?.address ?? null;
}

export function isConnected() {
  return wallet !== null;
}

export function disconnect() {
  wallet = null;
}

/**
 * Connects Keplr to the earth chain and returns { address, name }.
 *
 * Earth is not in Keplr's built-in registry, so it is suggested first. Direct
 * (protobuf) signing is used rather than amino — earth's custom messages have
 * no amino JSON representation registered.
 */
export async function connectKeplr() {
  if (!window.keplr) {
    throw new Error("Keplr extension is not installed.");
  }

  try {
    await window.keplr.experimentalSuggestChain(earthChainInfo);
  } catch (err) {
    // Non-fatal: the chain may already be known to this Keplr install.
    console.warn("suggestChain failed (chain may already be added):", err.message);
  }

  await window.keplr.enable(EARTH_CHAIN_ID);
  const signer = window.keplr.getOfflineSigner(EARTH_CHAIN_ID);
  const accounts = await signer.getAccounts();
  if (!accounts?.length) throw new Error("No accounts found in Keplr.");

  wallet = { address: accounts[0].address, signer };

  const key = await window.keplr.getKey(EARTH_CHAIN_ID);
  return { address: wallet.address, name: (key?.name ?? "").slice(0, 12) };
}

/** Account number + sequence, or zeroes for an account the chain has never seen. */
async function fetchAccount(address) {
  try {
    const { account } = await get(seg`/cosmos/auth/v1beta1/accounts/${address}`);
    // Accounts may be wrapped (e.g. vesting accounts nest a BaseAccount).
    const base = account?.base_account ?? account;
    return {
      accountNumber: Number(base?.account_number ?? 0),
      sequence: Number(base?.sequence ?? 0),
    };
  } catch {
    return { accountNumber: 0, sequence: 0 };
  }
}

// How many blocks a signed tx stays valid for (TxBody.timeout_height). Past
// that height a hash the chain never indexed can no longer land, which is what
// lets a "status unknown" tx resolve to "expired" instead of blocking forever.
const TIMEOUT_BLOCKS = 50n;

/**
 * The broadcast reached the node (or may have), but its result could not be
 * read: the LCD failed transiently, or the tx was not indexed in time. The tx
 * may still land. `hash` is what to look up; the UI shows it as "submitted,
 * status unknown" and broadcast() refuses another tx from this account until
 * that hash resolves (lands, fails, or passes its timeout height).
 */
export class TxStatusUnknownError extends Error {
  constructor(hash, message) {
    super(
      message ??
        `Submitted, status unknown: transaction ${hash} was sent but its result could not be read yet. ` +
          "Check it in the explorer; do not send it again until it resolves.",
    );
    this.name = "TxStatusUnknownError";
    this.hash = hash;
  }
}

// The unresolved tx per account: { hash, address, timeoutHeight } (timeoutHeight
// a decimal string). Kept in localStorage so a reload does not unblock a retry.
const PENDING_KEY = "earth.pendingTx";
let pendingMem = null;

function readPending() {
  try {
    const raw = globalThis.localStorage?.getItem(PENDING_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable or junk: fall back to memory */
  }
  return pendingMem;
}

function writePending(p) {
  pendingMem = p;
  try {
    if (p) globalThis.localStorage?.setItem(PENDING_KEY, JSON.stringify(p));
    else globalThis.localStorage?.removeItem(PENDING_KEY);
  } catch {
    /* memory copy still blocks within this page */
  }
}

/** The connected account's unresolved tx ({ hash, timeoutHeight }), or null. */
export function pendingTx(address = wallet?.address) {
  const p = readPending();
  return p && address && p.address === address ? p : null;
}

const isNotFound = (err) => /LCD 404/.test(err?.message ?? "");

async function latestHeight() {
  const data = await get("/cosmos/base/tendermint/v1beta1/blocks/latest");
  const h = data?.block?.header?.height ?? data?.sdk_block?.header?.height;
  if (typeof h !== "string" || !/^\d+$/.test(h)) throw new Error("LCD returned no block height.");
  return BigInt(h);
}

/**
 * One look at the account's unresolved tx. Returns null when there is none,
 * else { status, hash } with status one of:
 *   "confirmed" / "failed"  — it landed (cleared);
 *   "expired"               — not indexed and the chain is past its timeout height (cleared);
 *   "pending"               — not indexed yet, still within its timeout;
 *   "unknown"               — the LCD could not say.
 */
export async function resolvePendingTx(address = wallet?.address) {
  const p = pendingTx(address);
  if (!p) return null;
  try {
    const { tx_response: tx } = await get(seg`/cosmos/tx/v1beta1/txs/${p.hash}`);
    if (tx) {
      writePending(null);
      return { status: tx.code ? "failed" : "confirmed", hash: p.hash, tx };
    }
  } catch (err) {
    if (!isNotFound(err)) return { status: "unknown", hash: p.hash };
  }
  try {
    if ((await latestHeight()) > BigInt(p.timeoutHeight)) {
      writePending(null);
      return { status: "expired", hash: p.hash };
    }
  } catch {
    return { status: "unknown", hash: p.hash };
  }
  return { status: "pending", hash: p.hash };
}

/**
 * Signs `messages` with the connected wallet and broadcasts them to the LCD.
 *
 * Broadcasting goes through the LCD (not a Tendermint RPC endpoint) so the app
 * only ever needs one host. Resolves once the transaction is included in a
 * block, and throws if it is rejected at CheckTx or fails during delivery.
 *
 * Once the signed bytes may have reached the node, a failure to read the
 * outcome is not a failure of the tx: it throws TxStatusUnknownError with the
 * hash, and every later broadcast() from the account is refused until that
 * hash resolves. Otherwise a retry after a flaky LCD read pays twice.
 *
 * @param {Array<{typeUrl: string, value: object}>} messages
 * @param {{gas?: number, memo?: string}} [opts]
 */
export async function broadcast(messages, opts = {}) {
  if (!wallet) throw new Error("Wallet is not connected.");

  const prior = await resolvePendingTx(wallet.address);
  if (prior && (prior.status === "pending" || prior.status === "unknown")) {
    throw new TxStatusUnknownError(
      prior.hash,
      `An earlier transaction (${prior.hash}) is still unresolved. Wait until it lands or expires ` +
        "before sending another; check it in the explorer.",
    );
  }

  const gas = opts.gas ?? DEFAULT_GAS;
  const memo = opts.memo ?? "";
  const feeAmount = String(Math.ceil(gas * GAS_PRICE_UERTH));

  const { accountNumber, sequence } = await fetchAccount(wallet.address);
  const { pubkey: pubkeyBytes } = (await wallet.signer.getAccounts()).find(
    (a) => a.address === wallet.address,
  );
  const timeoutHeight = (await latestHeight()) + TIMEOUT_BLOCKS;

  const txBodyBytes = registry.encode({
    typeUrl: "/cosmos.tx.v1beta1.TxBody",
    value: { messages, memo, timeoutHeight },
  });

  const pubkeyAny = encodePubkey(encodeSecp256k1Pubkey(pubkeyBytes));
  const authInfoBytes = makeAuthInfoBytes(
    [{ pubkey: pubkeyAny, sequence }],
    [{ denom: UERTH, amount: feeAmount }],
    gas,
    undefined,
    undefined,
  );

  const signDoc = makeSignDoc(txBodyBytes, authInfoBytes, EARTH_CHAIN_ID, accountNumber);
  const { signed, signature } = await wallet.signer.signDirect(wallet.address, signDoc);

  const txRaw = TxRaw.fromPartial({
    bodyBytes: signed.bodyBytes,
    authInfoBytes: signed.authInfoBytes,
    signatures: [fromBase64(signature.signature)],
  });
  const txBytes = TxRaw.encode(txRaw).finish();
  // The hash is known before sending, so a lost response still leaves
  // something to look up. The wallet may have altered the body (its own
  // timeout), so read the timeout back from what was actually signed.
  const hash = toHex(sha256(txBytes)).toUpperCase();
  let signedTimeout = timeoutHeight;
  try {
    signedTimeout = TxBody.decode(signed.bodyBytes).timeoutHeight || 0n;
  } catch {
    /* keep ours */
  }
  // No timeout means it could land at any later height: never auto-expire.
  const pendingTimeout = signedTimeout > 0n ? signedTimeout : (1n << 63n) - 1n;
  writePending({ hash, address: wallet.address, timeoutHeight: pendingTimeout.toString() });

  let res;
  try {
    res = await fetch(`${EARTH_LCD_URL}/cosmos/tx/v1beta1/txs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_bytes: toBase64(txBytes),
        mode: "BROADCAST_MODE_SYNC",
      }),
    });
  } catch {
    throw new TxStatusUnknownError(hash);
  }
  // A 5xx (or a proxy's 52x) says nothing about whether the node took the tx.
  if (!res.ok && res.status >= 500) throw new TxStatusUnknownError(hash);
  if (!res.ok) {
    writePending(null);
    throw new Error(`Broadcast failed: ${await res.text()}`);
  }

  let txResponse;
  try {
    ({ tx_response: txResponse } = await res.json());
  } catch {
    throw new TxStatusUnknownError(hash);
  }
  // A non-zero code here is a CheckTx rejection — the tx never entered a
  // block. Code 19 (already in the mempool cache) is the exception: it is in.
  if (txResponse?.code && txResponse.code !== 19) {
    writePending(null);
    throw new Error(`Transaction rejected (code ${txResponse.code}): ${txResponse.raw_log}`);
  }
  return waitForTx(hash);
}

/**
 * Polls the LCD until `hash` lands in a block. CheckTx passing only means the
 * transaction was accepted into the mempool, so the deliver-time result has to
 * be read back separately. A transient read error is retried, never reported
 * as a failure; running out of attempts is "status unknown", not "failed".
 */
export async function waitForTx(hash, { attempts = 30, intervalMs = 1000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    let tx;
    try {
      ({ tx_response: tx } = await get(seg`/cosmos/tx/v1beta1/txs/${hash}`));
    } catch {
      // 404: not indexed yet. Anything else (a dropped connection, a proxy
      // 530) says nothing about the tx: keep polling.
      continue;
    }
    if (!tx) continue;
    const p = readPending();
    if (p?.hash === hash) writePending(null);
    if (tx.code) {
      throw new Error(`Transaction failed (code ${tx.code}): ${tx.raw_log}`);
    }
    return tx;
  }
  throw new TxStatusUnknownError(hash);
}
