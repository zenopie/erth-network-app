import { get, getOr, seg } from "./rest";

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
  const data = await getOr(
    `/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(denom)}`,
    null,
  );
  return data?.amount?.amount ?? "0";
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
