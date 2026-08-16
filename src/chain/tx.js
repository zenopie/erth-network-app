import { Registry, makeAuthInfoBytes, makeSignDoc, encodePubkey } from "@cosmjs/proto-signing";
import { encodeSecp256k1Pubkey } from "@cosmjs/amino";
import { fromBase64, toBase64 } from "@cosmjs/encoding";
import { defaultRegistryTypes } from "@cosmjs/stargate";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";

import { EARTH_CHAIN_ID, EARTH_LCD_URL, UERTH, earthChainInfo } from "./config";
import { get } from "./rest";

import { MsgSwap, MsgAddLiquidity, MsgRemoveLiquidity, MsgCreatePool } from "../proto/earth/dex/v1/tx";
import {
  MsgSetAllocations,
  MsgClaimAllocation,
  MsgAddAddressOption,
} from "../proto/earth/allocation/v1/tx";
import { MsgClaimAnml } from "../proto/earth/personhood/v1/tx";

/**
 * Message registry: the stock cosmos types (bank, staking, distribution, gov)
 * plus earth's own module messages, generated from the chain's protos by
 * ./scripts/gen-proto.sh.
 */
export const registry = new Registry([
  ...defaultRegistryTypes,
  ["/earth.dex.v1.MsgSwap", MsgSwap],
  ["/earth.dex.v1.MsgAddLiquidity", MsgAddLiquidity],
  ["/earth.dex.v1.MsgRemoveLiquidity", MsgRemoveLiquidity],
  ["/earth.dex.v1.MsgCreatePool", MsgCreatePool],
  // One set of allocation messages covers both streams; the stream is a field on
  // the message rather than a separate module.
  ["/earth.allocation.v1.MsgSetAllocations", MsgSetAllocations],
  ["/earth.allocation.v1.MsgClaimAllocation", MsgClaimAllocation],
  ["/earth.allocation.v1.MsgAddAddressOption", MsgAddAddressOption],
  ["/earth.personhood.v1.MsgClaimAnml", MsgClaimAnml],
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
    const { account } = await get(`/cosmos/auth/v1beta1/accounts/${address}`);
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

/**
 * Signs `messages` with the connected wallet and broadcasts them to the LCD.
 *
 * Broadcasting goes through the LCD (not a Tendermint RPC endpoint) so the app
 * only ever needs one host. Resolves once the transaction is included in a
 * block, and throws if it is rejected at CheckTx or fails during delivery.
 *
 * @param {Array<{typeUrl: string, value: object}>} messages
 * @param {{gas?: number, memo?: string}} [opts]
 */
export async function broadcast(messages, opts = {}) {
  if (!wallet) throw new Error("Wallet is not connected.");

  const gas = opts.gas ?? DEFAULT_GAS;
  const memo = opts.memo ?? "";
  const feeAmount = String(Math.ceil(gas * GAS_PRICE_UERTH));

  const { accountNumber, sequence } = await fetchAccount(wallet.address);
  const { pubkey: pubkeyBytes } = (await wallet.signer.getAccounts()).find(
    (a) => a.address === wallet.address,
  );

  const txBodyBytes = registry.encode({
    typeUrl: "/cosmos.tx.v1beta1.TxBody",
    value: { messages, memo },
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

  const res = await fetch(`${EARTH_LCD_URL}/cosmos/tx/v1beta1/txs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_bytes: toBase64(txBytes),
      mode: "BROADCAST_MODE_SYNC",
    }),
  });
  if (!res.ok) throw new Error(`Broadcast failed: ${await res.text()}`);

  const { tx_response: txResponse } = await res.json();
  // A non-zero code here is a CheckTx rejection — the tx never entered a block.
  if (txResponse?.code) {
    throw new Error(`Transaction rejected (code ${txResponse.code}): ${txResponse.raw_log}`);
  }
  return waitForTx(txResponse.txhash);
}

/**
 * Polls the LCD until `hash` lands in a block. CheckTx passing only means the
 * transaction was accepted into the mempool, so the deliver-time result has to
 * be read back separately.
 */
async function waitForTx(hash, { attempts = 30, intervalMs = 1000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const { tx_response: tx } = await get(`/cosmos/tx/v1beta1/txs/${hash}`);
      if (!tx) continue;
      if (tx.code) {
        throw new Error(`Transaction failed (code ${tx.code}): ${tx.raw_log}`);
      }
      return tx;
    } catch (err) {
      // A 404 just means "not indexed yet"; anything else is a real failure.
      if (!/LCD 404/.test(err.message)) throw err;
    }
  }
  throw new Error(`Transaction ${hash} was not confirmed in time.`);
}

