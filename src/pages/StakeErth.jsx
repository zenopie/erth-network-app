import React, { useState, useEffect } from "react";
import { query, contract, snip, querySnipBalance, requestViewingKey, getQueryAddress } from "../utils/contractUtils";
import { toMicroUnits, toMacroUnits } from "../utils/mathUtils";
import tokens from "../utils/tokens";
import contracts from "../utils/contracts";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import { formatUSD } from "../utils/apiUtils";
import useErthPrice from "../hooks/useErthPrice";
import styles from "./StakeErth.module.css";
import StatusModal from "../components/StatusModal";

const SECONDS_PER_DAY = 24 * 60 * 60;
const DAYS_PER_YEAR = 365;

const calculateAPR = (totalStakedMicro) => {
  if (!totalStakedMicro) return 0;
  const totalStakedMacro = toMacroUnits(totalStakedMicro, tokens["ERTH"]);
  if (totalStakedMacro === 0) return 0;
  return (SECONDS_PER_DAY / totalStakedMacro) * DAYS_PER_YEAR;
};

const StakeErth = () => {
  const { isKeplrConnected } = useWallet();
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
  const erthPrice = useErthPrice();

  useEffect(() => {
    fetchStakingRewards();
  }, [isKeplrConnected]);

  const fetchStakingRewards = async () => {
    const stakingContract = contracts.staking?.contract;
    const stakingHash = contracts.staking?.hash;
    if (!stakingContract) return;

    try {
      showLoading();
      const resp = await query(stakingContract, stakingHash, {
        get_user_info: { address: getQueryAddress() },
      });

      if (!resp || resp.staking_rewards_due === undefined) {
        setStakingRewards(0);
        return;
      }

      setStakingRewards(parseFloat(toMacroUnits(resp.staking_rewards_due, tokens["ERTH"])));

      const totalStakedMacro = toMacroUnits(resp.total_staked, tokens["ERTH"]);
      setTotalStakedBalance(parseFloat(totalStakedMacro));

      if (resp.user_info?.staked_amount) {
        setStakedBalance(parseFloat(toMacroUnits(resp.user_info.staked_amount, tokens["ERTH"])));
      } else {
        setStakedBalance(0);
      }

      const erthBalance = await querySnipBalance(tokens["ERTH"]);
      setUnstakedBalance(isNaN(erthBalance) || erthBalance === "Error" ? "Error" : parseFloat(erthBalance));

      if (resp.total_staked) setApr(calculateAPR(resp.total_staked));
      setUnbondingEntries(resp.unbonding_entries || []);
    } catch (error) {
      console.error("Error querying user info:", error);
      setStakingRewards(0);
      setStakedBalance("Error");
      setUnstakedBalance("Error");
      setUnbondingEntries([]);
    } finally {
      hideLoading();
    }
  };

  const handleStake = async () => {
    if (!isKeplrConnected || !stakeAmount || isNaN(stakeAmount) || parseFloat(stakeAmount) <= 0) return;
    execute(async () => {
      await snip(tokens["ERTH"].contract, tokens["ERTH"].hash, contracts.staking.contract, contracts.staking.hash, { stake_erth: {} }, toMicroUnits(stakeAmount, tokens["ERTH"]).toString());
      setStakeAmount("");
      fetchStakingRewards();
    });
  };

  const handleUnstake = async () => {
    if (!isKeplrConnected || !unstakeAmount || isNaN(unstakeAmount) || parseFloat(unstakeAmount) <= 0) return;
    execute(async () => {
      await contract(contracts.staking.contract, contracts.staking.hash, { withdraw: { amount: toMicroUnits(unstakeAmount, tokens["ERTH"]).toString() } });
      setUnstakeAmount("");
      fetchStakingRewards();
    });
  };

  const handleClaimRewards = async () => {
    if (!isKeplrConnected) return;
    execute(async () => {
      await contract(contracts.staking.contract, contracts.staking.hash, { claim: {} });
      fetchStakingRewards();
    });
  };

  const handleClaimUnbonded = async () => {
    if (!isKeplrConnected) return;
    execute(async () => {
      await contract(contracts.staking.contract, contracts.staking.hash, { claim_unbonded: {} });
      fetchStakingRewards();
    });
  };

  const handleCancelUnbond = async (entry) => {
    if (!isKeplrConnected) return;
    execute(async () => {
      await contract(contracts.staking.contract, contracts.staking.hash, { cancel_unbond: { amount: entry.amount, unbonding_time: entry.unbonding_time } });
      fetchStakingRewards();
    });
  };

  const handleRequestViewingKey = async (token) => {
    await requestViewingKey(token);
    fetchStakingRewards();
  };

  const yourShare = totalStakedBalance > 0 && stakedBalance > 0 ? ((stakedBalance / totalStakedBalance) * 100) : 0;
  const dailyRewards = stakedBalance > 0 && totalStakedBalance > 0 ? (SECONDS_PER_DAY * stakedBalance / totalStakedBalance) : 0;

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
          {stakingRewards > 0 && isKeplrConnected && (
            <button className={styles.claimAllBtn} onClick={handleClaimRewards}>
              Claim {Number(stakingRewards).toLocaleString(undefined, {maximumFractionDigits: 1})} ERTH{erthPrice ? ` (${formatUSD(stakingRewards * erthPrice)})` : ""}
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Your Staked</span>
          <span className={styles.statValue}>
            {stakedBalance !== null && stakedBalance !== "Error" ? "¤" + Math.floor(stakedBalance).toLocaleString() : "—"}
          </span>
          <span className={styles.statSub}>
            {stakedBalance !== null && stakedBalance !== "Error" && erthPrice ? formatUSD(stakedBalance * erthPrice) : ""}
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
        {/* Tabs — Markets style */}
        <div className={styles.tabs}>
          {["Stake", "Withdraw", "Unbonding"].map(t => (
            <button key={t} className={`${styles.tab} ${activeTab === t ? styles.active : ""}`} onClick={() => setActiveTab(t)}>{t}</button>
          ))}
        </div>

        {/* Stake tab */}
        {activeTab === "Stake" && (
          <div className={styles.tabContent}>
            <div className={styles.inputGroup}>
              <div className={styles.inputHeader}>
                <label>ERTH</label>
                <span className={styles.balance}>
                  {unstakedBalance === null || unstakedBalance === "Error" ? (
                    <button className={styles.vkBtn} onClick={() => handleRequestViewingKey(tokens["ERTH"])}>Get Viewing Key</button>
                  ) : (
                    <>Bal: {Number(unstakedBalance).toLocaleString()} <button className={styles.maxBtn} onClick={() => setStakeAmount(unstakedBalance)}>Max</button></>
                  )}
                </span>
              </div>
              <div className={styles.inputWrapper}>
                <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.inputLogo} />
                <div className={styles.inputInner}>
                  <input type="number" placeholder="0.0" value={stakeAmount} onChange={e => setStakeAmount(e.target.value)} className={styles.input} />
                  <span className={styles.inputUsd}>{stakeAmount && erthPrice ? formatUSD(parseFloat(stakeAmount) * erthPrice) : ""}</span>
                </div>
              </div>
            </div>
            <button onClick={handleStake} className={styles.actionBtn} disabled={!stakeAmount || Number(stakeAmount) <= 0 || Number(stakeAmount) > Number(unstakedBalance)}>Stake</button>
          </div>
        )}

        {/* Withdraw tab */}
        {activeTab === "Withdraw" && (
          <div className={styles.tabContent}>
            <div className={styles.inputGroup}>
              <div className={styles.inputHeader}>
                <label>ERTH</label>
                <span className={styles.balance}>
                  {stakedBalance === null || stakedBalance === "Error" ? (
                    <span>No staked ERTH</span>
                  ) : (
                    <>Staked: {Number(stakedBalance).toLocaleString()} <button className={styles.maxBtn} onClick={() => setUnstakeAmount(stakedBalance)}>Max</button></>
                  )}
                </span>
              </div>
              <div className={styles.inputWrapper}>
                <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.inputLogo} />
                <div className={styles.inputInner}>
                  <input type="number" placeholder="0.0" value={unstakeAmount} onChange={e => setUnstakeAmount(e.target.value)} className={styles.input} />
                  <span className={styles.inputUsd}>{unstakeAmount && erthPrice ? formatUSD(parseFloat(unstakeAmount) * erthPrice) : ""}</span>
                </div>
              </div>
            </div>
            <button onClick={handleUnstake} className={styles.actionBtn} disabled={!unstakeAmount || Number(unstakeAmount) <= 0 || Number(unstakeAmount) > Number(stakedBalance)}>Withdraw</button>
            <p className={styles.note}>21-day unbonding period</p>
          </div>
        )}

        {/* Unbonding tab */}
        {activeTab === "Unbonding" && (
          <div className={styles.tabContent}>
            {unbondingEntries.length > 0 ? (
              <>
                {unbondingEntries.map((entry, i) => {
                  const availableDate = new Date(entry.unbonding_time / 1e6).toLocaleString();
                  const amount = toMacroUnits(entry.amount, tokens["ERTH"]);
                  const isMatured = new Date() >= new Date(entry.unbonding_time / 1e6);
                  return (
                    <div key={i} className={styles.unbondItem}>
                      <div className={styles.unbondInfo}>
                        <div className={styles.unbondAmountRow}>
                          <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.unbondLogo} />
                          <span className={styles.unbondValue}>{Number(amount).toLocaleString()} ERTH</span>
                        </div>
                        <span className={styles.unbondDate}>{availableDate}</span>
                      </div>
                      {isMatured ? (
                        <button onClick={handleClaimUnbonded} className={styles.smallBtn}>Claim</button>
                      ) : (
                        <button onClick={() => handleCancelUnbond(entry)} className={`${styles.smallBtn} ${styles.cancelBtn}`}>Cancel</button>
                      )}
                    </div>
                  );
                })}
              </>
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
