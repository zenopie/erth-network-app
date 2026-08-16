import { fromBase64, toBech32 } from "@cosmjs/encoding";
import { sha256 } from "@noble/hashes/sha2.js";
import { get, getOr, rpcOrNull } from "./rest";
import { ADDRESS_PREFIX } from "./config";

/**
 * Chain explorer reads.
 *
 * Everything here is public LCD data — blocks, transactions, validators. The
 * LCD returns each block twice: `block` is the raw CometBFT form (proposer as a
 * base64 consensus address) and `sdk_block` re-encodes the header with a bech32
 * `earthvalcons…` proposer, which is what we display.
 */

/** Chain id and latest height/time. */
export async function status() {
  const data = await get("/cosmos/base/tendermint/v1beta1/blocks/latest");
  const h = data.sdk_block?.header ?? data.block.header;
  return {
    chainId: h.chain_id,
    height: Number(h.height),
    time: h.time,
  };
}

function toBlock(data) {
  const h = data.sdk_block?.header ?? data.block.header;
  return {
    height: Number(h.height),
    time: h.time,
    chainId: h.chain_id,
    proposer: h.proposer_address,
    hash: hexOf(data.block_id?.hash),
    txCount: (data.block?.data?.txs ?? []).length,
  };
}

/** The most recent block. */
export async function latestBlock() {
  return toBlock(await get("/cosmos/base/tendermint/v1beta1/blocks/latest"));
}

/** A block by height, or null if it does not exist. */
export async function block(height) {
  const data = await getOr(`/cosmos/base/tendermint/v1beta1/blocks/${height}`, null);
  return data ? toBlock(data) : null;
}

/**
 * CometBFT refuses more than 20 block metas per /blockchain call and silently
 * clamps the range, so asking for more returns fewer than requested rather than
 * erroring.
 */
const BLOCKCHAIN_RANGE_LIMIT = 20;

/**
 * The `count` most recent blocks, newest first.
 *
 * Served by CometBFT's `/blockchain?minHeight=&maxHeight=` range query — one
 * request for the whole page. The LCD has no equivalent, which is the only
 * reason the explorer touches the RPC port at all.
 *
 * Falls back to per-height LCD reads when the RPC is not configured or not
 * reachable; a deployment that exposes only REST still works, just chattier.
 */
export async function recentBlocks(count = 12) {
  const capped = Math.min(count, BLOCKCHAIN_RANGE_LIMIT);
  return (await blockRange(capped)) ?? (await recentBlocksViaLcd(capped));
}

/** One range request, newest first, or null when the RPC cannot serve it. */
async function blockRange(count) {
  const tip = await latestBlock().catch(() => null);
  if (!tip) return null;
  const min = Math.max(1, tip.height - count + 1);
  const data = await rpcOrNull(`/blockchain?minHeight=${min}&maxHeight=${tip.height}`);
  const metas = data?.result?.block_metas;
  if (!Array.isArray(metas)) return null;

  return metas
    .map((m) => ({
      height: Number(m.header?.height ?? 0),
      time: m.header?.time ?? "",
      chainId: m.header?.chain_id ?? "",
      // The RPC gives the proposer as hex where sdk_block gives bech32.
      // Converted here so both paths key the moniker lookup identically.
      proposer: valconsFromHex(m.header?.proposer_address ?? ""),
      // Already hex over RPC, unlike the LCD's base64.
      hash: m.block_id?.hash ?? "",
      txCount: Number(m.num_txs ?? 0),
    }))
    .sort((a, b) => b.height - a.height);
}

async function recentBlocksViaLcd(count) {
  const tip = await latestBlock();
  const heights = [];
  for (let h = tip.height; h > Math.max(0, tip.height - count); h--) heights.push(h);
  const blocks = await Promise.all(heights.map((h) => (h === tip.height ? tip : block(h))));
  return blocks.filter(Boolean);
}

/**
 * Bech32 valcons address from CometBFT's hex consensus address. Both encodings
 * have to produce the same string or the proposer moniker comes back empty.
 */
export function valconsFromHex(hex) {
  if (!/^[0-9a-fA-F]{40}$/.test(hex)) return hex;
  const bytes = new Uint8Array(20);
  for (let i = 0; i < 20; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return toBech32(`${ADDRESS_PREFIX}valcons`, bytes);
}

/**
 * Transactions matching a CometBFT query string, newest first.
 * The LCD returns two parallel arrays: `txs` (decoded bodies) and
 * `tx_responses` (execution results); they are zipped here.
 */
async function searchTxs(query, limit = 20) {
  const path =
    `/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}` +
    `&order_by=ORDER_BY_DESC&limit=${limit}`;
  const data = await getOr(path, null);
  if (!data) return [];
  return (data.tx_responses ?? []).map((res, i) => toTx(res, data.txs?.[i]));
}

/** Chain-wide recent transactions. */
export const recentTxs = (limit = 20) => searchTxs("tx.height>0", limit);

/** Transactions included in a single block. */
export const txsAtHeight = (height, limit = 50) => searchTxs(`tx.height=${height}`, limit);

/**
 * Transactions involving an address — both those it signed and those that paid
 * it. A plain `message.sender` query misses incoming transfers entirely, since
 * those are indexed under the sender, so both are queried and merged.
 */
export async function txsForAddress(address, limit = 20) {
  const [sent, received] = await Promise.all([
    searchTxs(`message.sender='${address}'`, limit),
    searchTxs(`transfer.recipient='${address}'`, limit),
  ]);
  const byHash = new Map();
  for (const tx of [...sent, ...received]) byHash.set(tx.hash, tx);
  return [...byHash.values()].sort((a, b) => b.height - a.height).slice(0, limit);
}

/** A single transaction by hash, or null if not found/not indexed. */
export async function txByHash(hash) {
  const data = await getOr(`/cosmos/tx/v1beta1/txs/${hash.toUpperCase()}`, null);
  return data?.tx_response ? toTx(data.tx_response, data.tx) : null;
}

function toTx(res, body) {
  const messages = body?.body?.messages ?? [];
  return {
    hash: res.txhash,
    height: Number(res.height),
    // A non-zero code means the transaction was included but failed.
    success: Number(res.code) === 0,
    code: Number(res.code),
    rawLog: res.raw_log ?? "",
    gasUsed: Number(res.gas_used ?? 0),
    gasWanted: Number(res.gas_wanted ?? 0),
    timestamp: res.timestamp,
    memo: body?.body?.memo ?? "",
    fee: body?.auth_info?.fee?.amount ?? [],
    messages,
    // "/earth.dex.v1.MsgSwap" -> "MsgSwap"
    types: messages.map((m) => (m["@type"] ?? "").split(".").pop()).filter(Boolean),
    events: res.events ?? [],
  };
}

/**
 * Maps a bech32 consensus address (`earthvalcons…`) to a validator moniker.
 *
 * The staking module knows monikers but not consensus addresses; the validator
 * set knows consensus addresses but not monikers. Both expose the same
 * consensus public key, so the two are joined on it.
 */
export async function proposerMonikers() {
  const [set, staking] = await Promise.all([
    getOr("/cosmos/base/tendermint/v1beta1/validatorsets/latest?pagination.limit=200", null),
    getOr("/cosmos/staking/v1beta1/validators?pagination.limit=200", null),
  ]);

  const monikerByPubkey = new Map(
    (staking?.validators ?? []).map((v) => [v.consensus_pubkey?.key, v.description?.moniker ?? ""]),
  );
  return Object.fromEntries(
    (set?.validators ?? [])
      .map((v) => [v.address, monikerByPubkey.get(v.pub_key?.key) ?? ""])
      .filter(([, moniker]) => moniker),
  );
}

/**
 * A validator's consensus address, derived from its ed25519 consensus pubkey:
 * bech32(prefix + "valcons", sha256(pubkey)[:20]).
 *
 * This is the only way to line staking records up with slashing records — the
 * staking module exposes pubkeys but not consensus addresses, and x/slashing
 * keys its uptime data by consensus address. Deriving it (rather than joining
 * through the validator set) also covers validators outside the active set,
 * whose uptime is exactly what you want to see when they are jailed.
 *
 * Uses a pure-JS sha256 rather than Web Crypto: crypto.subtle is only exposed in
 * secure contexts, so it would be undefined if the app were ever served over
 * plain HTTP, silently breaking this page.
 */
function consensusAddress(pubkeyBase64) {
  const digest = sha256(fromBase64(pubkeyBase64));
  return toBech32(`${ADDRESS_PREFIX}valcons`, digest.slice(0, 20));
}

/** Slashing parameters: the uptime window and its penalties. */
export async function slashingParams() {
  const data = await getOr("/cosmos/slashing/v1beta1/params", null);
  const p = data?.params;
  return {
    signedBlocksWindow: Number(p?.signed_blocks_window ?? 0),
    minSignedPerWindow: Number(p?.min_signed_per_window ?? 0),
    downtimeJailDuration: p?.downtime_jail_duration ?? "",
    slashFractionDoubleSign: Number(p?.slash_fraction_double_sign ?? 0),
    slashFractionDowntime: Number(p?.slash_fraction_downtime ?? 0),
  };
}

/**
 * Every validator with its stake, commission and uptime, ranked by voting power.
 *
 * Uptime is measured over the slashing window (the last `signed_blocks_window`
 * blocks), not the validator's whole history: that is the window that actually
 * decides whether it gets jailed.
 */
export async function validators() {
  const [staking, signing, params] = await Promise.all([
    getOr("/cosmos/staking/v1beta1/validators?pagination.limit=300", null),
    getOr("/cosmos/slashing/v1beta1/signing_infos?pagination.limit=300", null),
    slashingParams(),
  ]);

  const signingByCons = new Map(
    (signing?.info ?? []).map((s) => [
      s.address,
      {
        missedBlocks: Number(s.missed_blocks_counter ?? 0),
        startHeight: Number(s.start_height ?? 0),
        tombstoned: Boolean(s.tombstoned),
        jailedUntil: s.jailed_until,
      },
    ]),
  );

  const list = (staking?.validators ?? []).map((v) => {
    const consAddress = v.consensus_pubkey?.key ? consensusAddress(v.consensus_pubkey.key) : "";
    const info = signingByCons.get(consAddress) ?? null;
    const window = params.signedBlocksWindow;
    const jailed = Boolean(v.jailed);
    const tombstoned = info?.tombstoned ?? false;
    // x/slashing zeroes missed_blocks_counter when it jails a validator, because
    // the window restarts when it rejoins. Computing uptime from that would show
    // a validator 100% healthy at the exact moment it was jailed FOR downtime —
    // the most misleading number the page could display. Report "unknown"
    // instead and let the status say what happened.
    const uptime =
      info && window > 0 && !jailed && !tombstoned
        ? Math.max(0, Math.min(100, ((window - info.missedBlocks) / window) * 100))
        : null;

    return {
      operator: v.operator_address,
      moniker: v.description?.moniker ?? "",
      details: v.description?.details ?? "",
      website: v.description?.website ?? "",
      consAddress,
      tokens: v.tokens ?? "0",
      status: v.status ?? "",
      bonded: v.status === "BOND_STATUS_BONDED",
      jailed,
      commission: Number(v.commission?.commission_rates?.rate ?? 0),
      maxCommission: Number(v.commission?.commission_rates?.max_rate ?? 0),
      // null when the chain has no signing record yet (a brand-new validator).
      uptime,
      missedBlocks: info?.missedBlocks ?? null,
      tombstoned: info?.tombstoned ?? false,
      jailedUntil: info?.jailedUntil ?? null,
    };
  });

  const totalBonded = list.reduce((s, v) => s + (v.bonded ? Number(v.tokens) : 0), 0);
  return {
    params,
    totalBonded,
    validators: list
      .map((v) => ({
        ...v,
        votingPower: totalBonded > 0 && v.bonded ? (Number(v.tokens) / totalBonded) * 100 : 0,
      }))
      .sort((a, b) => Number(b.tokens) - Number(a.tokens)),
  };
}

/** Base64 (the LCD's encoding for hashes) -> uppercase hex, as explorers show it. */
function hexOf(b64) {
  if (!b64) return "";
  const bin = atob(b64);
  let out = "";
  for (let i = 0; i < bin.length; i++) out += bin.charCodeAt(i).toString(16).padStart(2, "0");
  return out.toUpperCase();
}

/**
 * Classifies a search term so the UI knows where to route it.
 * Heights are digits, tx hashes are 64 hex chars, everything else bech32.
 */
export function classifySearch(term) {
  const t = term.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return { kind: "block", value: t };
  if (/^[0-9a-fA-F]{64}$/.test(t)) return { kind: "tx", value: t.toUpperCase() };
  if (/^earth[0-9a-z]{6,}$/.test(t)) return { kind: "account", value: t };
  return null;
}
