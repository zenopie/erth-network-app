import React, { useState, useEffect } from "react";
import * as staking from "../chain/staking";
import * as explorer from "../chain/explorer";
import { balance } from "../chain/bank";
import { broadcast } from "../chain/tx";
import { UERTH } from "../chain/config";
import { toMacro, toMicro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import { formatUSD } from "../utils/apiUtils";
import useErthPrice from "../hooks/useErthPrice";
import styles from "./StakeErth.module.css";
import StatusModal from "../components/StatusModal";

const SECONDS_PER_DAY = 24 * 60 * 60;
const DAYS_PER_YEAR = 365;

// The chain emits a flat 1 ERTH/sec as the base staking reward, so a staker's
// yearly return per staked ERTH is simply seconds-per-year / total staked.
const calculateAPR = (totalStakedMicro) => {
  const totalStakedMacro = toMacro(totalStakedMicro, UERTH);
  if (!totalStakedMacro) return 0;
  return (SECONDS_PER_DAY / totalStakedMacro) * DAYS_PER_YEAR;
};

const StakeErth = () => {
  const { address, isConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, execute, closeModal } = useTransaction();

  const [activeTab, setActiveTab] = useState("Stake");
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [stakingRewards, setStakingRewards] = useState(null);
  const [apr, setApr] = useState(0);
  const [stakedBalance, setStakedBalance] = useState(null);
  const [unstakedBalance, setUnstakedBalance] = useState(null);
  const [totalStakedBalance, setTotalStakedBalance] = useState(null);
  const [unbondingEntries, setUnbondingEntries] = useState([]);
  const [validators, setValidators] = useState([]);
  const [myDelegations, setMyDelegations] = useState([]);
  const [stakeTo, setStakeTo] = useState("");
  const [unstakeFrom, setUnstakeFrom] = useState("");
  const [redelegateFrom, setRedelegateFrom] = useState("");
  const [redelegateTo, setRedelegateTo] = useState("");
  const [redelegateAmount, setRedelegateAmount] = useState("");
  const [unbondDays, setUnbondDays] = useState(21);
  const erthPrice = useErthPrice();

  useEffect(() => {
    fetchStakingInfo();
  }, [address]);

  // Reuses the explorer's validator view so the picker can show voting power,
  // commission and uptime — the three things that actually matter when choosing.
  useEffect(() => {
    explorer
      .validators()
      .then((d) =>
        setValidators(
          (d.validators ?? [])
            .filter((v) => v.bonded && !v.jailed)
            // Smallest first: the default ordering nudges stake away from the
            // top validator instead of toward it.
            .sort((a, b) => a.votingPower - b.votingPower),
        ),
      )
      .catch(console.error);
  }, []);

  const fetchStakingInfo = async () => {
    try {
      showLoading();

      // Network-wide figures are public and render without a wallet.
      const [totalBonded, days] = await Promise.all([
        staking.totalBonded(),
        staking.unbondingDays(),
      ]);
      setTotalStakedBalance(toMacro(totalBonded, UERTH));
      setApr(calculateAPR(totalBonded));
      setUnbondDays(days);

      if (!address) {
        setStakedBalance(null);
        setUnstakedBalance(null);
        setStakingRewards(null);
        setUnbondingEntries([]);
        return;
      }

      const [delegationList, rewards, liquid, unbonding] = await Promise.all([
        staking.delegations(address),
        staking.totalRewards(address),
        balance(address, UERTH),
        staking.unbondingDelegations(address),
      ]);

      const delegated = delegationList.reduce((sum, d) => sum + Number(d.amount), 0);
      setStakedBalance(toMacro(delegated, UERTH));
      setStakingRewards(toMacro(rewards, UERTH));
      setUnstakedBalance(toMacro(liquid, UERTH));
      setUnbondingEntries(unbonding);
      setMyDelegations(delegationList);
    } catch (error) {
      console.error("Error loading staking info:", error);
      setStakedBalance("Error");
      setUnstakedBalance("Error");
    } finally {
      hideLoading();
    }
  };

  const handleStake = async () => {
    if (!isConnected || !(parseFloat(stakeAmount) > 0)) return;
    execute(async () => {
      const msgs = await staking.msgsStake(address, toMicro(stakeAmount, UERTH), stakeTo);
      await broadcast(msgs);
      setStakeAmount("");
      fetchStakingInfo();
    });
  };

  const handleUnstake = async () => {
    if (!isConnected || !(parseFloat(unstakeAmount) > 0)) return;
    execute(async () => {
      const msgs = await staking.msgsUnstake(address, toMicro(unstakeAmount, UERTH), unstakeFrom);
      await broadcast(msgs);
      setUnstakeAmount("");
      fetchStakingInfo();
    });
  };

  const handleRedelegate = async () => {
    if (!isConnected || !(parseFloat(redelegateAmount) > 0)) return;
    execute(async () => {
      const msgs = await staking.msgsRedelegate(
        address,
        toMicro(redelegateAmount, UERTH),
        redelegateFrom,
        redelegateTo,
      );
      await broadcast(msgs);
      setRedelegateAmount("");
      fetchStakingInfo();
    });
  };

  const handleCancelUnbonding = async (entry) => {
    if (!isConnected) return;
    execute(async () => {
      const msgs = await staking.msgsCancelUnbonding(address, entry);
      await broadcast(msgs);
      fetchStakingInfo();
    });
  };

  const handleClaimRewards = async () => {
    if (!isConnected) return;
    execute(async () => {
      const msgs = await staking.msgsClaimRewards(address);
      // One withdraw message per validator, so scale the gas with the count.
      await broadcast(msgs, { gas: 200_000 + msgs.length * 120_000 });
      fetchStakingInfo();
    });
  };

  const selectedValidator = validators.find((v) => v.operator === stakeTo) ?? null;
  const monikerOf = (operator) =>
    validators.find((v) => v.operator === operator)?.moniker || operator.slice(0, 20) + "…";
  const redelegateSourceAmount = toMacro(
    myDelegations.find((d) => d.validator === redelegateFrom)?.amount ?? 0,
    UERTH,
  );
  const selectedDelegationAmount = toMacro(
    myDelegations.find((d) => d.validator === unstakeFrom)?.amount ?? 0,
    UERTH,
  );

  const yourShare =
    totalStakedBalance > 0 && stakedBalance > 0 ? (stakedBalance / totalStakedBalance) * 100 : 0;
  const dailyRewards =
    stakedBalance > 0 && totalStakedBalance > 0
      ? (SECONDS_PER_DAY * stakedBalance) / totalStakedBalance
      : 0;

  return (
    <div className={styles.page}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} />

      {/* Header — flat, like Markets */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.headerLogo} />
          <div>
            <span className={styles.headerLabel}>ERTH Staking</span>
            <span className={styles.headerApr}>{(apr * 100).toFixed(1)}% APR</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          {stakingRewards > 0 && isConnected && (
            <button className={styles.claimAllBtn} onClick={handleClaimRewards}>
              Claim {Number(stakingRewards).toLocaleString(undefined, { maximumFractionDigits: 1 })} ERTH
              {erthPrice ? ` (${formatUSD(stakingRewards * erthPrice)})` : ""}
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Your Staked</span>
          <span className={styles.statValue}>
            {stakedBalance !== null && stakedBalance !== "Error"
              ? "¤" + Math.floor(stakedBalance).toLocaleString()
              : "—"}
          </span>
          <span className={styles.statSub}>
            {stakedBalance !== null && stakedBalance !== "Error" && erthPrice
              ? formatUSD(stakedBalance * erthPrice)
              : ""}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total Staked</span>
          <span className={styles.statValue}>
            {totalStakedBalance !== null ? "¤" + Math.floor(totalStakedBalance).toLocaleString() : "—"}
          </span>
          <span className={styles.statSub}>
            {totalStakedBalance !== null && erthPrice ? formatUSD(totalStakedBalance * erthPrice) : ""}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Daily Rewards</span>
          <span className={styles.statValue}>{dailyRewards > 0 ? `¤${dailyRewards.toFixed(2)}` : "—"}</span>
          <span className={styles.statSub}>
            {dailyRewards > 0 && erthPrice ? formatUSD(dailyRewards * erthPrice) : ""}
          </span>
        </div>
      </div>

      {/* Action card */}
      <div className={styles.card}>
        <div className={styles.tabs}>
          {["Stake", "Redelegate", "Withdraw", "Unbonding"].map((t) => (
            <button
              key={t}
              className={`${styles.tab} ${activeTab === t ? styles.active : ""}`}
              onClick={() => setActiveTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Stake tab */}
        {activeTab === "Stake" && (
          <div className={styles.tabContent}>
            <div className={styles.inputGroup}>
              <div className={styles.inputHeader}>
                <label>Validator</label>
                <span className={styles.balance}>{validators.length} active</span>
              </div>
              <select
                className={styles.validatorSelect}
                value={stakeTo}
                onChange={(e) => setStakeTo(e.target.value)}
              >
                <option value="">Choose a validator…</option>
                {validators.map((v) => (
                  <option key={v.operator} value={v.operator}>
                    {v.moniker || v.operator} — {v.votingPower.toFixed(1)}% power,{" "}
                    {(v.commission * 100).toFixed(0)}% comm
                    {v.uptime !== null ? `, ${v.uptime.toFixed(1)}% uptime` : ""}
                  </option>
                ))}
              </select>
              {selectedValidator && selectedValidator.votingPower >= 33 && (
                <p className={styles.warn}>
                  This validator already holds {selectedValidator.votingPower.toFixed(1)}% of stake.
                  Above 33% a single validator can halt the chain — consider a smaller one.
                </p>
              )}
              <p className={styles.note}>
                Smallest validators are listed first. Spreading stake keeps the chain resilient.
              </p>
            </div>
            <div className={styles.inputGroup}>
              <div className={styles.inputHeader}>
                <label>ERTH</label>
                <span className={styles.balance}>
                  {unstakedBalance === null || unstakedBalance === "Error" ? (
                    <span>Connect a wallet</span>
                  ) : (
                    <>
                      Bal: {Number(unstakedBalance).toLocaleString()}{" "}
                      <button className={styles.maxBtn} onClick={() => setStakeAmount(unstakedBalance)}>
                        Max
                      </button>
                    </>
                  )}
                </span>
              </div>
              <div className={styles.inputWrapper}>
                <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.inputLogo} />
                <div className={styles.inputInner}>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    className={styles.input}
                  />
                  <span className={styles.inputUsd}>
                    {stakeAmount && erthPrice ? formatUSD(parseFloat(stakeAmount) * erthPrice) : ""}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleStake}
              className={styles.actionBtn}
              disabled={
                !isConnected ||
                !stakeTo ||
                !stakeAmount ||
                Number(stakeAmount) <= 0 ||
                Number(stakeAmount) > Number(unstakedBalance)
              }
            >
              {stakeTo ? "Stake" : "Choose a validator"}
            </button>
          </div>
        )}

        {/* Redelegate tab — moves stake with no unbonding gap */}
        {activeTab === "Redelegate" && (
          <div className={styles.tabContent}>
            <div className={styles.inputGroup}>
              <div className={styles.inputHeader}>
                <label>From</label>
                <span className={styles.balance}>{myDelegations.length} delegation(s)</span>
              </div>
              <select
                className={styles.validatorSelect}
                value={redelegateFrom}
                onChange={(e) => setRedelegateFrom(e.target.value)}
              >
                <option value="">Choose a delegation…</option>
                {myDelegations.map((d) => (
                  <option key={d.validator} value={d.validator}>
                    {monikerOf(d.validator)} — {toMacro(d.amount, UERTH).toLocaleString()} ERTH
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.inputGroup}>
              <div className={styles.inputHeader}>
                <label>To</label>
              </div>
              <select
                className={styles.validatorSelect}
                value={redelegateTo}
                onChange={(e) => setRedelegateTo(e.target.value)}
              >
                <option value="">Choose a validator…</option>
                {validators
                  .filter((v) => v.operator !== redelegateFrom)
                  .map((v) => (
                    <option key={v.operator} value={v.operator}>
                      {v.moniker || v.operator} — {v.votingPower.toFixed(1)}% power,{" "}
                      {(v.commission * 100).toFixed(0)}% comm
                    </option>
                  ))}
              </select>
            </div>

            <div className={styles.inputGroup}>
              <div className={styles.inputHeader}>
                <label>ERTH</label>
                <span className={styles.balance}>
                  Available: {redelegateSourceAmount.toLocaleString()}{" "}
                  <button
                    className={styles.maxBtn}
                    onClick={() => setRedelegateAmount(redelegateSourceAmount)}
                  >
                    Max
                  </button>
                </span>
              </div>
              <div className={styles.inputWrapper}>
                <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.inputLogo} />
                <div className={styles.inputInner}>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={redelegateAmount}
                    onChange={(e) => setRedelegateAmount(e.target.value)}
                    className={styles.input}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleRedelegate}
              className={styles.actionBtn}
              disabled={
                !isConnected ||
                !redelegateFrom ||
                !redelegateTo ||
                !redelegateAmount ||
                Number(redelegateAmount) <= 0 ||
                Number(redelegateAmount) > redelegateSourceAmount
              }
            >
              Redelegate
            </button>
            <p className={styles.note}>
              Stake keeps earning — there is no {unbondDays}-day gap. It stays locked until it
              matures though: it cannot be moved again, and it is still slashable for the source
              validator&apos;s faults.
            </p>
          </div>
        )}

        {/* Withdraw tab */}
        {activeTab === "Withdraw" && (
          <div className={styles.tabContent}>
            <div className={styles.inputGroup}>
              <div className={styles.inputHeader}>
                <label>Unstake from</label>
                <span className={styles.balance}>{myDelegations.length} delegation(s)</span>
              </div>
              <select
                className={styles.validatorSelect}
                value={unstakeFrom}
                onChange={(e) => setUnstakeFrom(e.target.value)}
              >
                <option value="">Choose a delegation…</option>
                {myDelegations.map((d) => (
                  <option key={d.validator} value={d.validator}>
                    {monikerOf(d.validator)} — {toMacro(d.amount, UERTH).toLocaleString()} ERTH
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.inputGroup}>
              <div className={styles.inputHeader}>
                <label>ERTH</label>
                <span className={styles.balance}>
                  {stakedBalance === null || stakedBalance === "Error" ? (
                    <span>No staked ERTH</span>
                  ) : (
                    <>
                      Staked here: {selectedDelegationAmount.toLocaleString()}{" "}
                      <button className={styles.maxBtn} onClick={() => setUnstakeAmount(selectedDelegationAmount)}>
                        Max
                      </button>
                    </>
                  )}
                </span>
              </div>
              <div className={styles.inputWrapper}>
                <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.inputLogo} />
                <div className={styles.inputInner}>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={unstakeAmount}
                    onChange={(e) => setUnstakeAmount(e.target.value)}
                    className={styles.input}
                  />
                  <span className={styles.inputUsd}>
                    {unstakeAmount && erthPrice ? formatUSD(parseFloat(unstakeAmount) * erthPrice) : ""}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleUnstake}
              className={styles.actionBtn}
              disabled={
                !isConnected ||
                !unstakeFrom ||
                !unstakeAmount ||
                Number(unstakeAmount) <= 0 ||
                Number(unstakeAmount) > selectedDelegationAmount
              }
            >
              {unstakeFrom ? "Withdraw" : "Choose a delegation"}
            </button>
            <p className={styles.note}>{unbondDays}-day unbonding period</p>
          </div>
        )}

        {/* Unbonding tab — native staking releases these automatically, so this
            is display-only: there is nothing to claim or cancel. */}
        {activeTab === "Unbonding" && (
          <div className={styles.tabContent}>
            {unbondingEntries.length > 0 ? (
              unbondingEntries.map((entry, i) => (
                <div key={i} className={styles.unbondItem}>
                  <div className={styles.unbondInfo}>
                    <div className={styles.unbondAmountRow}>
                      <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.unbondLogo} />
                      <span className={styles.unbondValue}>
                        {toMacro(entry.balance, UERTH).toLocaleString()} ERTH
                      </span>
                    </div>
                    <span className={styles.unbondDate}>
                      {new Date(entry.completionTime).toLocaleString()}
                    </span>
                  </div>
                  <button
                    className={styles.smallBtn}
                    onClick={() => handleCancelUnbonding(entry)}
                    title="Return this stake to the same validator immediately"
                  >
                    Cancel
                  </button>
                </div>
              ))
            ) : (
              <p className={styles.note}>No unbonding entries</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StakeErth;
