import { getOr, seg } from "./rest";

/** All balances for an address as { denom: amount } in base units. */
export async function balances(address) {
  const data = await getOr(seg`/cosmos/bank/v1beta1/balances/${address}`, { balances: [] });
  return Object.fromEntries((data.balances ?? []).map((c) => [c.denom, c.amount]));
}

/** Balance of a single denom in base units, "0" if the address holds none. */
export async function balance(address, denom) {
  return (await balances(address))[denom] ?? "0";
}

/** Total supply of a denom in base units. Handles slashed denoms like dexlp/1. */
export async function supply(denom) {
  return (await supplyOrNull(denom)) ?? "0";
}

/**
 * Like supply(), but null when the read fails rather than "0". For callers
 * where a zero would be acted on — a deposit floor priced against it becomes no
 * floor at all.
 */
export async function supplyOrNull(denom) {
  const data = await getOr(
    `/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(denom)}`,
    null,
  );
  return data?.amount?.amount ?? null;
}

/**
 * Whether the bank lets `denom` move (x/bank SendEnabled): its own entry, else
 * the params' default_send_enabled. null when the node could not say. The
 * chain refuses MsgShield of a send-disabled denom (chain 203d3b2, audit 5
 * L-SH2): inside the pool it would move privately around the switch.
 */
export async function sendEnabled(denom) {
  const q = await getOr(`/cosmos/bank/v1beta1/send_enabled?denoms=${encodeURIComponent(denom)}`, null);
  const own = (q?.send_enabled ?? []).find((e) => e?.denom === denom);
  if (own) return own.enabled === true;
  const p = await getOr("/cosmos/bank/v1beta1/params", null);
  const d = p?.params?.default_send_enabled;
  return typeof d === "boolean" ? d : null;
}
