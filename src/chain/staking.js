import { fromBase64, fromBech32, toBech32 } from "@cosmjs/encoding";
import { PubKey as Ed25519PubKey } from "cosmjs-types/cosmos/crypto/ed25519/keys";
import { getOr, seg } from "./rest";
import { ADDRESS_PREFIX, UERTH } from "./config";

/**
 * Native x/staking + x/distribution, as far as a Keplr account can still use
 * them.
 *
 * On this chain the x/shielded module is the only delegator besides
 * validators' own operators: the ante handler (and a staking hook behind it)
 * refuses MsgDelegate, MsgUndelegate and MsgCancelUnbondingDelegation unless
 * the delegator is the validator's own operator account, and refuses
 * MsgBeginRedelegate outright. Everyone else stakes privately from the mobile
 * app (see ./shieldedStaking.js for the public side of that).
 *
 * So the messages here are an operator's: create a validator, bond or unbond
 * its own stake, cancel its own unbonding, and withdraw its rewards and
 * commission.
 */

/** Total uerth bonded network-wide (drives the APR figure). */
export async function totalBonded() {
  const data = await getOr("/cosmos/staking/v1beta1/pool", null);
  return data?.pool?.bonded_tokens ?? null;
}

/** Unbonding period in days, read from chain params (cosmos default is 21). */
export async function unbondingDays() {
  const data = await getOr("/cosmos/staking/v1beta1/params", null);
  const seconds = parseInt(data?.params?.unbonding_time ?? "", 10);
  return Number.isFinite(seconds) ? Math.round(seconds / 86400) : 21;
}

/**
 * A delegator's delegations: { validator, amount } in uerth. For anyone but an
 * operator this is empty by construction; it is kept for the explorer, where
 * the shielded module account itself is the interesting delegator.
 */
export async function delegations(delegator) {
  const data = await getOr(seg`/cosmos/staking/v1beta1/delegations/${delegator}`, {
    delegation_responses: [],
  });
  return (data.delegation_responses ?? []).map((d) => ({
    validator: d.delegation.validator_address,
    amount: d.balance.amount,
  }));
}

/** Pending uerth rewards, truncated from the chain's DecCoin representation. */
export async function totalRewards(delegator) {
  const data = await getOr(
    seg`/cosmos/distribution/v1beta1/delegators/${delegator}/rewards`,
    { total: [] },
  );
  const erth = (data.total ?? []).find((c) => c.denom === UERTH);
  return erth ? erth.amount.split(".")[0] : "0";
}

/** The operator address (earthvaloper…) that an account would own. */
export function valoperOf(address) {
  try {
    // An explicit length limit: cosmjs's default (Infinity) is rejected by the
    // @scure/base it is paired with here, which made every decode throw.
    return toBech32(`${ADDRESS_PREFIX}valoper`, fromBech32(address, 90).data);
  } catch {
    return null;
  }
}

/**
 * The connected account's validator, or null when it does not operate one.
 *
 * { operator, moniker, status, jailed, tokens, commission, selfBond,
 *   unbonding: [{ balance, completionTime, creationHeight }], rewards,
 *   commissionEarned } — amounts in uerth.
 */
export async function operatorView(address) {
  const operator = valoperOf(address);
  if (!operator) return null;
  const v = await getOr(seg`/cosmos/staking/v1beta1/validators/${operator}`, null);
  if (!v?.validator) return null;

  const [del, unb, rew, com] = await Promise.all([
    getOr(seg`/cosmos/staking/v1beta1/validators/${operator}/delegations/${address}`, null),
    getOr(
      seg`/cosmos/staking/v1beta1/validators/${operator}/delegations/${address}/unbonding_delegation`,
      null,
    ),
    getOr(seg`/cosmos/distribution/v1beta1/delegators/${address}/rewards/${operator}`, null),
    getOr(seg`/cosmos/distribution/v1beta1/validators/${operator}/commission`, null),
  ]);

  const erthOf = (coins) =>
    ((coins ?? []).find((c) => c.denom === UERTH)?.amount ?? "0").split(".")[0];

  return {
    operator,
    moniker: v.validator.description?.moniker ?? "",
    status: v.validator.status ?? "",
    jailed: Boolean(v.validator.jailed),
    tokens: v.validator.tokens ?? "0",
    commission: Number(v.validator.commission?.commission_rates?.rate ?? 0),
    selfBond: del?.delegation_response?.balance?.amount ?? "0",
    unbonding: (unb?.unbond?.entries ?? []).map((e) => ({
      balance: e.balance,
      completionTime: e.completion_time,
      // Entries have no id: a cancel addresses one by (validator, height).
      creationHeight: e.creation_height,
    })),
    rewards: erthOf(rew?.rewards),
    commissionEarned: erthOf(com?.commission?.commission),
  };
}

// --- messages (operator only) ---

const coin = (amount) => ({ denom: UERTH, amount: String(amount) });

function ownValidator(operatorAccount) {
  const v = valoperOf(operatorAccount);
  if (!v) throw new Error(`Not an ${ADDRESS_PREFIX}1… address: ${operatorAccount}`);
  return v;
}

/** Bond more of an operator's own ERTH to its validator. */
export function msgSelfBond(operatorAccount, amount) {
  return {
    typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
    value: {
      delegatorAddress: operatorAccount,
      validatorAddress: ownValidator(operatorAccount),
      amount: coin(amount),
    },
  };
}

/** Start unbonding some of an operator's own stake. */
export function msgSelfUnbond(operatorAccount, amount) {
  return {
    typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate",
    value: {
      delegatorAddress: operatorAccount,
      validatorAddress: ownValidator(operatorAccount),
      amount: coin(amount),
    },
  };
}

/** Return an operator's in-progress unbonding entry to its validator. */
export function msgCancelSelfUnbonding(operatorAccount, entry) {
  return {
    typeUrl: "/cosmos.staking.v1beta1.MsgCancelUnbondingDelegation",
    value: {
      delegatorAddress: operatorAccount,
      validatorAddress: ownValidator(operatorAccount),
      amount: coin(entry.balance),
      // int64 on the wire; the LCD returns it as a string.
      creationHeight: BigInt(entry.creationHeight),
    },
  };
}

/** Withdraw the operator's self-bond rewards and its validator's commission. */
export function msgsWithdrawOperatorRewards(operatorAccount) {
  const validatorAddress = ownValidator(operatorAccount);
  return [
    {
      typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
      value: { delegatorAddress: operatorAccount, validatorAddress },
    },
    {
      typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission",
      value: { validatorAddress },
    },
  ];
}

/** "0.1" -> LegacyDec atomics ("100000000000000000"), which the proto carries. */
export function decAtomics(s) {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(String(s ?? "").trim());
  if (!m || (m[1] === "" && !m[2])) throw new Error(`Not a decimal: ${s}`);
  const frac = (m[2] ?? "").slice(0, 18).padEnd(18, "0");
  return BigInt((m[1] || "0") + frac).toString();
}

/**
 * Create a validator operated by the signing account. `consensusPubkey` is
 * the node's ed25519 key in base64 — the `key` field of
 * `earthd comet show-validator`.
 */
export function msgCreateValidator(operatorAccount, {
  moniker,
  website = "",
  details = "",
  consensusPubkey,
  selfBond,
  commissionRate,
  commissionMaxRate,
  commissionMaxChangeRate,
  minSelfDelegation = "1",
}) {
  let key;
  try {
    key = fromBase64(String(consensusPubkey ?? "").trim());
  } catch {
    throw new Error("The consensus key must be base64.");
  }
  if (key.length !== 32) throw new Error("The consensus key must be a 32-byte ed25519 key.");
  return {
    typeUrl: "/cosmos.staking.v1beta1.MsgCreateValidator",
    value: {
      description: { moniker, identity: "", website, securityContact: "", details },
      commission: {
        rate: decAtomics(commissionRate),
        maxRate: decAtomics(commissionMaxRate),
        maxChangeRate: decAtomics(commissionMaxChangeRate),
      },
      minSelfDelegation: String(minSelfDelegation),
      // Deprecated since SDK 0.50: the validator address is the signer.
      delegatorAddress: "",
      validatorAddress: ownValidator(operatorAccount),
      pubkey: {
        typeUrl: "/cosmos.crypto.ed25519.PubKey",
        value: Ed25519PubKey.encode({ key }).finish(),
      },
      value: coin(selfBond),
    },
  };
}
