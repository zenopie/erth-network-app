import { getOr, seg } from "./rest";
import { UERTH } from "./config";

/**
 * Native x/staking + x/distribution.
 *
 * On Secret, staking went through a custom contract with its own unbonding
 * queue. Earth uses the stock cosmos modules: bonding to validators, an
 * automatic unbonding period, and rewards claimed per validator.
 */

/** Bonded validators, largest first. */
export async function bondedValidators() {
  const data = await getOr(
    "/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=200",
    { validators: [] },
  );
  return (data.validators ?? [])
    .map((v) => ({
      operator: v.operator_address,
      moniker: v.description?.moniker ?? "",
      tokens: v.tokens ?? "0",
    }))
    .sort((a, b) => Number(b.tokens) - Number(a.tokens));
}

/** A delegator's delegations: { validator, amount } in uerth. */
export async function delegations(delegator) {
  const data = await getOr(seg`/cosmos/staking/v1beta1/delegations/${delegator}`, {
    delegation_responses: [],
  });
  return (data.delegation_responses ?? []).map((d) => ({
    validator: d.delegation.validator_address,
    amount: d.balance.amount,
  }));
}

/** Total uerth this delegator has bonded across all validators. */
export async function totalDelegated(delegator) {
  return (await delegations(delegator)).reduce((sum, d) => sum + Number(d.amount), 0);
}

/** Unbonding period in days, read from chain params (cosmos default is 21). */
export async function unbondingDays() {
  const data = await getOr("/cosmos/staking/v1beta1/params", null);
  const seconds = parseInt(data?.params?.unbonding_time ?? "", 10);
  return Number.isFinite(seconds) ? Math.round(seconds / 86400) : 21;
}

/** Total uerth bonded network-wide (drives the APR figure). */
export async function totalBonded() {
  const data = await getOr("/cosmos/staking/v1beta1/pool", null);
  return data?.pool?.bonded_tokens ?? "0";
}

/**
 * In-progress unbondings. Native staking releases these automatically at
 * completion_time, so this is display-only — there is nothing to claim.
 */
export async function unbondingDelegations(delegator) {
  const data = await getOr(
    seg`/cosmos/staking/v1beta1/delegators/${delegator}/unbonding_delegations`,
    { unbonding_responses: [] },
  );
  return (data.unbonding_responses ?? []).flatMap((r) =>
    (r.entries ?? []).map((e) => ({
      validator: r.validator_address,
      balance: e.balance,
      completionTime: e.completion_time,
      // The height the entry was created at. Cancelling identifies an entry by
      // (validator, creation_height) — there is no entry id — so this must be
      // carried through or the cancel cannot be addressed.
      creationHeight: e.creation_height,
    })),
  );
}

/**
 * In-progress redelegations. Stake being moved between validators is still
 * bonded and earning, but it is locked: it cannot be redelegated again until it
 * matures, and it remains slashable for the source validator's faults.
 */
export async function redelegations(delegator) {
  const data = await getOr(
    seg`/cosmos/staking/v1beta1/delegators/${delegator}/redelegations`,
    { redelegation_responses: [] },
  );
  return (data.redelegation_responses ?? []).flatMap((r) =>
    (r.entries ?? []).map((e) => ({
      src: r.redelegation?.validator_src_address,
      dst: r.redelegation?.validator_dst_address,
      balance: e.balance,
      completionTime: e.redelegation_entry?.completion_time,
    })),
  );
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

// --- messages ---

const coin = (amount) => ({ denom: UERTH, amount: String(amount) });

export function msgDelegate(delegator, validator, amount) {
  return {
    typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
    value: { delegatorAddress: delegator, validatorAddress: validator, amount: coin(amount) },
  };
}

export function msgUndelegate(delegator, validator, amount) {
  return {
    typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate",
    value: { delegatorAddress: delegator, validatorAddress: validator, amount: coin(amount) },
  };
}

export function msgBeginRedelegate(delegator, srcValidator, dstValidator, amount) {
  return {
    typeUrl: "/cosmos.staking.v1beta1.MsgBeginRedelegate",
    value: {
      delegatorAddress: delegator,
      validatorSrcAddress: srcValidator,
      validatorDstAddress: dstValidator,
      amount: coin(amount),
    },
  };
}

export function msgCancelUnbonding(delegator, validator, amount, creationHeight) {
  return {
    typeUrl: "/cosmos.staking.v1beta1.MsgCancelUnbondingDelegation",
    value: {
      delegatorAddress: delegator,
      validatorAddress: validator,
      amount: coin(amount),
      // int64 on the wire; the LCD returns it as a string.
      creationHeight: String(creationHeight),
    },
  };
}

export function msgWithdrawReward(delegator, validator) {
  return {
    typeUrl: "/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward",
    value: { delegatorAddress: delegator, validatorAddress: validator },
  };
}

/**
 * Delegate to a specific validator.
 *
 * The validator is a required argument on purpose. This previously auto-selected
 * the largest bonded validator, which meant every stake made the biggest
 * validator bigger — a chain where one validator holds over 1/3 of stake can be
 * halted by that validator alone, and over 2/3 it can rewrite blocks. Pushing
 * that decision to the user is the whole point.
 */
export async function msgsStake(delegator, amount, validatorOperator) {
  if (!validatorOperator) throw new Error("Choose a validator to stake with.");
  return [msgDelegate(delegator, validatorOperator, amount)];
}

/**
 * Undelegate `amount` uerth from a specific validator.
 *
 * Also explicit: silently draining whichever delegation happened to be largest
 * changes which validators the user backs without telling them, and each
 * undelegation starts its own 21-day unbonding clock.
 */
export async function msgsUnstake(delegator, amount, validatorOperator) {
  if (!validatorOperator) throw new Error("Choose which delegation to unstake from.");
  const mine = await delegations(delegator);
  const d = mine.find((x) => x.validator === validatorOperator);
  if (!d) throw new Error("You have no delegation with that validator.");
  if (Number(amount) > Number(d.amount)) {
    throw new Error("Amount exceeds your stake with that validator.");
  }
  return [msgUndelegate(delegator, validatorOperator, amount)];
}

/** Withdraw rewards from every validator this address has delegated to. */
export async function msgsClaimRewards(delegator) {
  const mine = await delegations(delegator);
  if (!mine.length) throw new Error("You have no delegations.");
  return mine.map((d) => msgWithdrawReward(delegator, d.validator));
}

/**
 * Move stake from one validator to another without unbonding.
 *
 * Redelegation keeps the stake bonded and earning — no 21-day gap — which is why
 * it is the right tool for leaving a validator you have lost confidence in.
 * The chain enforces two limits worth surfacing in the UI: stake that is already
 * redelegating cannot be redelegated again until it matures (no hopping), and
 * there is a cap on concurrent redelegation entries between any validator pair.
 */
export async function msgsRedelegate(delegator, amount, srcValidator, dstValidator) {
  if (!srcValidator) throw new Error("Choose the validator to move stake from.");
  if (!dstValidator) throw new Error("Choose the validator to move stake to.");
  if (srcValidator === dstValidator) {
    throw new Error("Source and destination validators must differ.");
  }
  const mine = await delegations(delegator);
  const d = mine.find((x) => x.validator === srcValidator);
  if (!d) throw new Error("You have no delegation with that validator.");
  if (Number(amount) > Number(d.amount)) {
    throw new Error("Amount exceeds your stake with that validator.");
  }
  return [msgBeginRedelegate(delegator, srcValidator, dstValidator, amount)];
}

/**
 * Cancel an in-progress unbonding, returning the stake to the same validator.
 *
 * The entry is addressed by (validator, creationHeight) because unbonding
 * entries have no id. Partial cancels are allowed: pass less than the entry's
 * balance and the remainder keeps unbonding on its original schedule.
 */
export async function msgsCancelUnbonding(delegator, entry, amount) {
  if (!entry) throw new Error("Choose an unbonding entry to cancel.");
  const amt = amount ?? entry.balance;
  if (Number(amt) > Number(entry.balance)) {
    throw new Error("Amount exceeds that unbonding entry.");
  }
  return [msgCancelUnbonding(delegator, entry.validator, amt, entry.creationHeight)];
}
