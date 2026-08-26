import { get, getAtHeight, getOr } from "./rest";

/** All balances for an address as { denom: amount } in base units. */
export async function balances(address) {
  const data = await getOr(`/cosmos/bank/v1beta1/balances/${address}`, { balances: [] });
  return Object.fromEntries((data.balances ?? []).map((c) => [c.denom, c.amount]));
}

/** Balance of a single denom in base units, "0" if the address holds none. */
export async function balance(address, denom) {
  return (await balances(address))[denom] ?? "0";
}

/** Total supply of a denom in base units. Handles slashed denoms like dexlp/1. */
export async function supply(denom) {
  const data = await getOr(
    `/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(denom)}`,
    null,
  );
  return data?.amount?.amount ?? "0";
}

/**
 * Total supply of a denom as it stood at a past height, or null if the node has
 * pruned that far back.
 *
 * Used with height 1 to recover the genesis supply, which is what makes net
 * issuance computable without the chain storing it: supply moves only when
 * coins are minted or burned, so today's supply minus genesis is exactly the
 * net, and adding the burn counters back gives what was minted.
 */
export async function supplyAt(denom, height) {
  const data = await getAtHeight(
    `/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(denom)}`,
    height,
  );
  return data?.amount?.amount ?? null;
}

export function msgSend(from, to, denom, amount) {
  return {
    typeUrl: "/cosmos.bank.v1beta1.MsgSend",
    value: {
      fromAddress: from,
      toAddress: to,
      amount: [{ denom, amount: String(amount) }],
    },
  };
}
