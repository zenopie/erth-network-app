// StakeErth.js

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

// Contract addresses accessed dynamically (populated by registry at runtime)

const SECONDS_PER_DAY = 24 * 60 * 60;
const DAYS_PER_YEAR = 365;

const calculateAPR = (totalStakedMicro) => {
  if (!totalStakedMicro) return 0; // Return 0 if the totalStakedMicro is undefined

  const totalStakedMacro = toMacroUnits(totalStakedMicro, tokens["ERTH"]);

  if (totalStakedMacro === 0) {
    return 0;
  }

  const dailyGrowth = SECONDS_PER_DAY / totalStakedMacro;
  const annualGrowth = dailyGrowth * DAYS_PER_YEAR;

  return annualGrowth;
};

const StakeErth = () => {
  const { isKeplrConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, execute, closeModal } = useTransaction();

  const [activeTab, setActiveTab] = useState("Info");
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

      const queryMsg = {
        get_user_info: { address: getQueryAddress() },
      };

      const resp = await query(stakingContract, stakingHash, queryMsg);

      if (!resp || resp.staking_rewards_due === undefined) {
        console.error("Invalid response structure:", resp);
        setStakingRewards(0);
        return;
      }

      console.log("Unbonding Entries:", resp.unbonding_entries);

      const stakingRewardsDueMicro = resp.staking_rewards_due;
      const totalStakedMicro = resp.total_staked;
      setStakingRewards(parseFloat(toMacroUnits(stakingRewardsDueMicro, tokens["ERTH"])));

      // Set total staked balance
      const totalStakedMacro = toMacroUnits(totalStakedMicro, tokens["ERTH"]);
      setTotalStakedBalance(parseFloat(totalStakedMacro));

      // Set staked balance
      if (resp.user_info && resp.user_info.staked_amount) {
        const stakedAmountMicro = resp.user_info.staked_amount;
        const stakedAmountMacro = toMacroUnits(stakedAmountMicro, tokens["ERTH"]);
        setStakedBalance(parseFloat(stakedAmountMacro));
      } else {
        setStakedBalance(0);
      }

      // Fetch unstaked balance (user's ERTH balance)
      const erthBalance = await querySnipBalance(tokens["ERTH"]);
      if (isNaN(erthBalance) || erthBalance === "Error") {
        setUnstakedBalance("Error");
      } else {
        setUnstakedBalance(parseFloat(erthBalance));
      }

      // Only calculate APR once totalStaked is available
      if (totalStakedMicro) {
        const calculatedApr = calculateAPR(totalStakedMicro);
        setApr(calculatedApr);
      }

      // Fetch unbonding entries
      if (resp.unbonding_entries) {
        setUnbondingEntries(resp.unbonding_entries);
      } else {
        setUnbondingEntries([]);
      }
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
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected yet.");
      return;
    }

    if (!stakeAmount || isNaN(stakeAmount) || parseFloat(stakeAmount) <= 0) {
      return;
    }

    execute(async () => {
      const amountInMicroUnits = toMicroUnits(stakeAmount, tokens["ERTH"]);

      const snipmsg = {
        stake_erth: {},
      };

      await snip(
        tokens["ERTH"].contract,
        tokens["ERTH"].hash,
        contracts.staking.contract,
        contracts.staking.hash,
        snipmsg,
        amountInMicroUnits.toString()
      );

      setStakeAmount(""); // Clear the input
      fetchStakingRewards();
    });
  };

  const handleUnstake = async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected yet.");
      return;
    }

    if (!unstakeAmount || isNaN(unstakeAmount) || parseFloat(unstakeAmount) <= 0) {
      return;
    }

    execute(async () => {
      const amountInMicroUnits = toMicroUnits(unstakeAmount, tokens["ERTH"]);

      const msg = {
        withdraw: {
          amount: amountInMicroUnits.toString(),
        },
      };

      await contract(contracts.staking.contract, contracts.staking.hash, msg);

      setUnstakeAmount(""); // Clear the input
      fetchStakingRewards();
    });
  };

  const handleClaimRewards = async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected yet.");
      return;
    }

    execute(async () => {
      const msg = {
        claim: {},
      };

      await contract(contracts.staking.contract, contracts.staking.hash, msg);

      fetchStakingRewards();
    });
  };

  const handleClaimUnbonded = async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected yet.");
      return;
    }

    execute(async () => {
      const msg = {
        claim_unbonded: {},
      };

      await contract(contracts.staking.contract, contracts.staking.hash, msg);

      fetchStakingRewards();
    });
  };

  const handleCancelUnbond = async (entry) => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected yet.");
      return;
    }

    execute(async () => {
      const msg = {
        cancel_unbond: {
          amount: entry.amount, // Use exact amount from query (micro units)
          unbonding_time: entry.unbonding_time, // Use exact timestamp from query (in nanoseconds)
        },
      };

      await contract(contracts.staking.contract, contracts.staking.hash, msg);

      fetchStakingRewards();
    });
  };

  const handleRequestViewingKey = async (token) => {
    await requestViewingKey(token);
    fetchStakingRewards(); // Refresh balances after viewing key is set
  };

  return (
    <div className={styles.stakePageBox}>
      {/* Modal for displaying swap status */}
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} />

      {/* Header with ERTH logo - hidden on Unbonding tab */}
      {activeTab !== "Unbonding" && (
        <>
          <div className={styles.stakeHeader}>
            <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.stakeHeaderLogo} />
            <div className={styles.stakeHeaderInfo}>
              <span className={styles.stakeHeaderLabel}>ERTH Staking</span>
              <div className={styles.stakeHeaderApr}>
                <span className={styles.aprValue}>{(apr * 100).toFixed(2)}%</span>
                <span className={styles.aprLabel}>APR</span>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className={styles.stakeStatsGrid}>
            <div className={styles.stakeStatCard}>
              <span className={styles.stakeStatLabel}>Your Staked</span>
              <span className={styles.stakeStatValue}>
                {stakedBalance !== null && stakedBalance !== "Error"
                  ? "¤" + Math.floor(stakedBalance).toLocaleString()
                  : "—"}
              </span>
              <span className={styles.stakeStatUsd}>
                {stakedBalance !== null && stakedBalance !== "Error" && erthPrice
                  ? formatUSD(stakedBalance * erthPrice)
                  : ""}
              </span>
            </div>
            <div className={styles.stakeStatCard}>
              <span className={styles.stakeStatLabel}>Total Staked</span>
              <span className={styles.stakeStatValue}>
                {totalStakedBalance !== null
                  ? "¤" + Math.floor(totalStakedBalance).toLocaleString()
                  : "—"}
              </span>
              <span className={styles.stakeStatUsd}>
                {totalStakedBalance !== null && erthPrice
                  ? formatUSD(totalStakedBalance * erthPrice)
                  : ""}
              </span>
            </div>
          </div>

          {/* Info Box */}
          <div className={styles.stakeInfoBox}>
            <p>Stake your ERTH tokens to take part in Deflation Fund governance and earn a share of 1 ERTH per second distributed to all stakers. Unstaking requires a 21-day unbonding period.</p>
          </div>
        </>
      )}

      <div className={styles.stakePageTab}>
        <button className={activeTab === "Info" ? styles.active : ""} onClick={() => setActiveTab("Info")}>
          Rewards
        </button>
        <button className={activeTab === "Stake" ? styles.active : ""} onClick={() => setActiveTab("Stake")}>
          Stake
        </button>
        <button className={activeTab === "Withdraw" ? styles.active : ""} onClick={() => setActiveTab("Withdraw")}>
          Withdraw
        </button>
        <button
          className={activeTab === "Unbonding" ? styles.active : ""}
          onClick={() => setActiveTab("Unbonding")}
        >
          Unbonding
        </button>
      </div>

      {/* TAB 1: Rewards */}
      {activeTab === "Info" && (
        <div className={styles.stakePageTabcontent}>
          {/* Staking Rewards Display and Claim Section */}
          {stakingRewards > 0 ? (
            <div className={styles.rewardsDisplay}>
              <div className={styles.rewardsHeader}>
                <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.rewardsLogo} />
                <div className={styles.rewardsInfo}>
                  <span className={styles.rewardsTitle}>Rewards Available</span>
                  <span className={styles.rewardsAmount}>{Number(stakingRewards).toLocaleString()} ERTH</span>
                  <span className={styles.rewardsUsd}>{erthPrice ? formatUSD(stakingRewards * erthPrice) : ""}</span>
                </div>
              </div>
              <button
                onClick={handleClaimRewards}
                className={styles.stakePageButton}
                disabled={stakingRewards <= 0}
                title={stakingRewards <= 0 ? "No rewards available to claim" : ""}
              >
                Claim Rewards
              </button>
            </div>
          ) : (
            <div className={`${styles.rewardsDisplay} ${styles.noRewards}`}>
              <div className={styles.rewardsHeader}>
                <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.rewardsLogo} />
                <div className={styles.rewardsInfo}>
                  <span className={styles.rewardsTitle}>No Rewards Yet</span>
                  <span className={`${styles.rewardsAmount} ${styles.muted}`}>0 ERTH</span>
                </div>
              </div>
              <p className={styles.stakePageNote}>Stake ERTH tokens to start earning rewards</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Stake */}
      {activeTab === "Stake" && (
        <div className={styles.stakePageTabcontent}>
          <div className={styles.stakePageSection}>
            {/* Stake Input Section */}
            <div className={styles.stakePageInputGroup}>
              <div className={styles.stakePageLabelWrapper}>
                <label className={styles.stakePageInputLabel}>Amount to Stake</label>
                <div className={styles.stakePageTokenBalance}>
                  {unstakedBalance === null || unstakedBalance === "Error" ? (
                    <button
                      className={styles.stakePageInlineButton}
                      onClick={() => handleRequestViewingKey(tokens["ERTH"])}
                    >
                      Get Viewing Key
                    </button>
                  ) : (
                    <>
                      <span>Balance: {Number(unstakedBalance).toLocaleString()}</span>
                      <button className={styles.stakePageMaxButton} onClick={() => setStakeAmount(unstakedBalance)}>
                        Max
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className={styles.stakeInputWrapper}>
                <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.stakeInputLogo} />
                <div className={styles.stakeInputContainer}>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    className={styles.stakeInput}
                  />
                  <span className={styles.stakeInputUsd}>
                    {stakeAmount && erthPrice ? formatUSD(parseFloat(stakeAmount) * erthPrice) : formatUSD(0)}
                  </span>
                </div>
                <span className={styles.stakeInputToken}>ERTH</span>
              </div>
            </div>
            <button
              onClick={handleStake}
              className={styles.stakePageButton}
              disabled={!stakeAmount || Number(stakeAmount) <= 0 || Number(stakeAmount) > Number(unstakedBalance)}
              title={
                !stakeAmount
                  ? "Enter an amount to stake"
                  : Number(stakeAmount) <= 0
                  ? "Amount must be greater than 0"
                  : Number(stakeAmount) > Number(unstakedBalance)
                  ? "Insufficient balance"
                  : ""
              }
            >
              Stake
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: Withdraw */}
      {activeTab === "Withdraw" && (
        <div className={styles.stakePageTabcontent}>
          <div className={styles.stakePageSection}>
            {/* Withdraw Input Section */}
            <div className={styles.stakePageInputGroup}>
              <div className={styles.stakePageLabelWrapper}>
                <label className={styles.stakePageInputLabel}>Amount to Withdraw</label>
                <div className={styles.stakePageTokenBalance}>
                  {stakedBalance === null || stakedBalance === "Error" ? (
                    <span>No staked ERTH</span>
                  ) : (
                    <>
                      <span>Staked: {Number(stakedBalance).toLocaleString()}</span>
                      <button className={styles.stakePageMaxButton} onClick={() => setUnstakeAmount(stakedBalance)}>
                        Max
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className={styles.stakeInputWrapper}>
                <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.stakeInputLogo} />
                <div className={styles.stakeInputContainer}>
                  <input
                    type="number"
                    placeholder="0.0"
                    value={unstakeAmount}
                    onChange={(e) => setUnstakeAmount(e.target.value)}
                    className={styles.stakeInput}
                  />
                  <span className={styles.stakeInputUsd}>
                    {unstakeAmount && erthPrice ? formatUSD(parseFloat(unstakeAmount) * erthPrice) : formatUSD(0)}
                  </span>
                </div>
                <span className={styles.stakeInputToken}>ERTH</span>
              </div>
            </div>
            <button
              onClick={handleUnstake}
              className={styles.stakePageButton}
              disabled={!unstakeAmount || Number(unstakeAmount) <= 0 || Number(unstakeAmount) > Number(stakedBalance)}
              title={
                !unstakeAmount
                  ? "Enter an amount to withdraw"
                  : Number(unstakeAmount) <= 0
                  ? "Amount must be greater than 0"
                  : Number(unstakeAmount) > Number(stakedBalance)
                  ? "Insufficient staked balance"
                  : ""
              }
            >
              Withdraw
            </button>
            <p className={styles.stakePageNote}>Withdrawing has a 21-day unbonding period</p>
          </div>
        </div>
      )}

      {/* TAB 4: Unbonding */}
      {activeTab === "Unbonding" && (
        <div className={styles.stakePageTabcontent}>
          {unbondingEntries.length > 0 ? (
            <div className={styles.unbondingEntriesSection}>
              <h3>Unbonding Entries</h3>
              <ul className={styles.unbondingList}>
                {unbondingEntries.map((entry, index) => {
                  const availableDate = new Date(entry.unbonding_time / 1e6).toLocaleString();
                  const amount = toMacroUnits(entry.amount, tokens["ERTH"]);
                  const isMatured = new Date() >= new Date(entry.unbonding_time / 1e6);
                  return (
                    <li key={index} className={styles.unbondingItem}>
                      <div className={styles.unbondingDetails}>
                        <div className={styles.unbondingAmountRow}>
                          <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.unbondingLogo} />
                          <span className={styles.unbondingValue}>{Number(amount).toLocaleString()} ERTH</span>
                        </div>
                        <span className={styles.unbondingDate}>Available: {availableDate}</span>
                      </div>
                      <div className={styles.unbondingActions}>
                        {isMatured ? (
                          <button
                            onClick={handleClaimUnbonded}
                            className={styles.stakePageButton}
                            title="Claim your unbonded tokens"
                          >
                            Claim
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCancelUnbond(entry)}
                            className={`${styles.stakePageButton} ${styles.cancelButton}`}
                            title="Cancel this unbonding and return to stake"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className={`${styles.unbondingEntriesSection} ${styles.empty}`}>
              <h3>No Unbonding Tokens</h3>
              <p className={styles.stakePageNote}>You don't have any tokens in the unbonding period</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StakeErth;
