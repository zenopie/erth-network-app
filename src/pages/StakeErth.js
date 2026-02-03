// StakeErth.js

import React, { useState, useEffect } from "react";
import { query, contract, snip, querySnipBalance, requestViewingKey } from "../utils/contractUtils";
import { toMicroUnits, toMacroUnits } from "../utils/mathUtils.js";
import tokens from "../utils/tokens.js";
import contracts from "../utils/contracts.js";
import { showLoadingScreen } from "../utils/uiUtils";
import { fetchErthPrice, formatUSD } from "../utils/apiUtils";
import "./StakeErth.css";
import StatusModal from "../components/StatusModal";

// Using the staking contract from contracts.js utility
const THIS_CONTRACT = contracts.staking.contract;
const THIS_HASH = contracts.staking.hash;

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

const StakingManagement = ({ isKeplrConnected }) => {
  const [activeTab, setActiveTab] = useState("Info");
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [stakingRewards, setStakingRewards] = useState(null);
  const [apr, setApr] = useState(0);
  const [stakedBalance, setStakedBalance] = useState(null);
  const [unstakedBalance, setUnstakedBalance] = useState(null);
  const [totalStakedBalance, setTotalStakedBalance] = useState(null);
  const [unbondingEntries, setUnbondingEntries] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [erthPrice, setErthPrice] = useState(null);

  useEffect(() => {
    if (isKeplrConnected) {
      fetchStakingRewards();
    }
  }, [isKeplrConnected]);

  // Fetch ERTH price for USD display
  useEffect(() => {
    const updateErthPrice = async () => {
      try {
        const priceData = await fetchErthPrice();
        setErthPrice(priceData.price);
      } catch (error) {
        console.error('Failed to fetch ERTH price:', error);
      }
    };
    updateErthPrice();
    const interval = setInterval(updateErthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchStakingRewards = async () => {
    if (!window.secretjs || !window.secretjs.address) {
      console.error("secretjs or secretjs.address is not defined.");
      setStakingRewards("N/A");
      return;
    }

    try {
      showLoadingScreen(true);

      const queryMsg = {
        get_user_info: { address: window.secretjs.address },
      };

      const resp = await query(THIS_CONTRACT, THIS_HASH, queryMsg);

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
      showLoadingScreen(false);
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

    try {
      setIsModalOpen(true);
      setAnimationState("loading");

      const amountInMicroUnits = toMicroUnits(stakeAmount, tokens["ERTH"]);

      const snipmsg = {
        stake_erth: {},
      };

      await snip(
        tokens["ERTH"].contract,
        tokens["ERTH"].hash,
        THIS_CONTRACT,
        THIS_HASH,
        snipmsg,
        amountInMicroUnits.toString()
      );

      setAnimationState("success");
      setStakeAmount(""); // Clear the input
    } catch (error) {
      console.error("Error executing stake:", error);
      setAnimationState("error");
    } finally {
      fetchStakingRewards();
    }
  };

  const handleUnstake = async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected yet.");
      return;
    }

    if (!unstakeAmount || isNaN(unstakeAmount) || parseFloat(unstakeAmount) <= 0) {
      return;
    }

    try {
      showLoadingScreen(true);

      const amountInMicroUnits = toMicroUnits(unstakeAmount, tokens["ERTH"]);

      const msg = {
        withdraw: {
          amount: amountInMicroUnits.toString(),
        },
      };

      await contract(THIS_CONTRACT, THIS_HASH, msg);

      setUnstakeAmount(""); // Clear the input
      fetchStakingRewards();
    } catch (error) {
      console.error("Error executing unstake:", error);
    } finally {
      showLoadingScreen(false);
    }
  };

  const handleClaimRewards = async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected yet.");
      return;
    }

    try {
      setIsModalOpen(true);
      setAnimationState("loading");

      const msg = {
        claim: {},
      };

      await contract(THIS_CONTRACT, THIS_HASH, msg);

      setAnimationState("success");
    } catch (error) {
      console.error("Error claiming rewards:", error);
      setAnimationState("error");
    } finally {
      fetchStakingRewards();
    }
  };

  const handleClaimUnbonded = async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected yet.");
      return;
    }

    try {
      showLoadingScreen(true);

      const msg = {
        claim_unbonded: {},
      };

      await contract(THIS_CONTRACT, THIS_HASH, msg);

      fetchStakingRewards();
    } catch (error) {
      console.error("Error claiming unbonded tokens:", error);
    } finally {
      showLoadingScreen(false);
    }
  };

  const handleCancelUnbond = async (entry) => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected yet.");
      return;
    }

    try {
      setIsModalOpen(true);
      setAnimationState("loading");

      const msg = {
        cancel_unbond: {
          amount: entry.amount, // Use exact amount from query (micro units)
          unbonding_time: entry.unbonding_time, // Use exact timestamp from query (in nanoseconds)
        },
      };

      await contract(THIS_CONTRACT, THIS_HASH, msg);

      setAnimationState("success");
    } catch (error) {
      console.error("Error canceling unbonding:", error);
      setAnimationState("error");
    } finally {
      fetchStakingRewards();
    }
  };

  const handleRequestViewingKey = async (token) => {
    await requestViewingKey(token);
    fetchStakingRewards(); // Refresh balances after viewing key is set
  };

  return (
    <div className="stake-page-box">
      {/* Modal for displaying swap status */}
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      {/* Header with ERTH logo - hidden on Unbonding tab */}
      {activeTab !== "Unbonding" && (
        <>
          <div className="stake-header">
            <img src="/images/coin/ERTH.png" alt="ERTH" className="stake-header-logo" />
            <div className="stake-header-info">
              <span className="stake-header-label">ERTH Staking</span>
              <div className="stake-header-apr">
                <span className="apr-value">{(apr * 100).toFixed(2)}%</span>
                <span className="apr-label">APR</span>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="stake-stats-grid">
            <div className="stake-stat-card">
              <span className="stake-stat-label">Your Staked</span>
              <span className="stake-stat-value">
                {stakedBalance !== null && stakedBalance !== "Error"
                  ? "¤" + Math.floor(stakedBalance).toLocaleString()
                  : "—"}
              </span>
              <span className="stake-stat-usd">
                {stakedBalance !== null && stakedBalance !== "Error" && erthPrice
                  ? formatUSD(stakedBalance * erthPrice)
                  : ""}
              </span>
            </div>
            <div className="stake-stat-card">
              <span className="stake-stat-label">Total Staked</span>
              <span className="stake-stat-value">
                {totalStakedBalance !== null
                  ? "¤" + Math.floor(totalStakedBalance).toLocaleString()
                  : "—"}
              </span>
              <span className="stake-stat-usd">
                {totalStakedBalance !== null && erthPrice
                  ? formatUSD(totalStakedBalance * erthPrice)
                  : ""}
              </span>
            </div>
          </div>

          {/* Info Box */}
          <div className="stake-info-box">
            <p>Stake your ERTH tokens to take part in Deflation Fund governance and earn a share of 1 ERTH per second distributed to all stakers. Unstaking requires a 21-day unbonding period.</p>
          </div>
        </>
      )}

      <div className="stake-page-tab">
        <button className={`tablinks ${activeTab === "Info" ? "active" : ""}`} onClick={() => setActiveTab("Info")}>
          Rewards
        </button>
        <button className={`tablinks ${activeTab === "Stake" ? "active" : ""}`} onClick={() => setActiveTab("Stake")}>
          Stake
        </button>
        <button className={`tablinks ${activeTab === "Withdraw" ? "active" : ""}`} onClick={() => setActiveTab("Withdraw")}>
          Withdraw
        </button>
        <button
          className={`tablinks ${activeTab === "Unbonding" ? "active" : ""}`}
          onClick={() => setActiveTab("Unbonding")}
        >
          Unbonding
        </button>
      </div>

      {/* TAB 1: Rewards */}
      {activeTab === "Info" && (
        <div className="stake-page-tabcontent">
          {/* Staking Rewards Display and Claim Section */}
          {stakingRewards > 0 ? (
            <div className="rewards-display">
              <div className="rewards-header">
                <img src="/images/coin/ERTH.png" alt="ERTH" className="rewards-logo" />
                <div className="rewards-info">
                  <span className="rewards-title">Rewards Available</span>
                  <span className="rewards-amount">{Number(stakingRewards).toLocaleString()} ERTH</span>
                  <span className="rewards-usd">{erthPrice ? formatUSD(stakingRewards * erthPrice) : ""}</span>
                </div>
              </div>
              <button
                onClick={handleClaimRewards}
                className="stake-page-button"
                disabled={stakingRewards <= 0}
                title={stakingRewards <= 0 ? "No rewards available to claim" : ""}
              >
                Claim Rewards
              </button>
            </div>
          ) : (
            <div className="rewards-display no-rewards">
              <div className="rewards-header">
                <img src="/images/coin/ERTH.png" alt="ERTH" className="rewards-logo" />
                <div className="rewards-info">
                  <span className="rewards-title">No Rewards Yet</span>
                  <span className="rewards-amount muted">0 ERTH</span>
                </div>
              </div>
              <p className="stake-page-note">Stake ERTH tokens to start earning rewards</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Stake */}
      {activeTab === "Stake" && (
        <div className="stake-page-tabcontent">
          <div className="stake-page-section">
            {/* Stake Input Section */}
            <div className="stake-page-input-group">
              <div className="stake-page-label-wrapper">
                <label className="stake-page-input-label">Amount to Stake</label>
                <div className="stake-page-token-balance">
                  {unstakedBalance === null || unstakedBalance === "Error" ? (
                    <button
                      className="stake-page-inline-button"
                      onClick={() => handleRequestViewingKey(tokens["ERTH"])}
                    >
                      Get Viewing Key
                    </button>
                  ) : (
                    <>
                      <span>Balance: {Number(unstakedBalance).toLocaleString()}</span>
                      <button className="stake-page-max-button" onClick={() => setStakeAmount(unstakedBalance)}>
                        Max
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="stake-input-wrapper">
                <img src="/images/coin/ERTH.png" alt="ERTH" className="stake-input-logo" />
                <div className="stake-input-container">
                  <input
                    type="number"
                    placeholder="0.0"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    className="stake-input"
                  />
                  <span className="stake-input-usd">
                    {stakeAmount && erthPrice ? formatUSD(parseFloat(stakeAmount) * erthPrice) : formatUSD(0)}
                  </span>
                </div>
                <span className="stake-input-token">ERTH</span>
              </div>
            </div>
            <button
              onClick={handleStake}
              className="stake-page-button"
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
        <div className="stake-page-tabcontent">
          <div className="stake-page-section">
            {/* Withdraw Input Section */}
            <div className="stake-page-input-group">
              <div className="stake-page-label-wrapper">
                <label className="stake-page-input-label">Amount to Withdraw</label>
                <div className="stake-page-token-balance">
                  {stakedBalance === null || stakedBalance === "Error" ? (
                    <span>No staked ERTH</span>
                  ) : (
                    <>
                      <span>Staked: {Number(stakedBalance).toLocaleString()}</span>
                      <button className="stake-page-max-button" onClick={() => setUnstakeAmount(stakedBalance)}>
                        Max
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="stake-input-wrapper">
                <img src="/images/coin/ERTH.png" alt="ERTH" className="stake-input-logo" />
                <div className="stake-input-container">
                  <input
                    type="number"
                    placeholder="0.0"
                    value={unstakeAmount}
                    onChange={(e) => setUnstakeAmount(e.target.value)}
                    className="stake-input"
                  />
                  <span className="stake-input-usd">
                    {unstakeAmount && erthPrice ? formatUSD(parseFloat(unstakeAmount) * erthPrice) : formatUSD(0)}
                  </span>
                </div>
                <span className="stake-input-token">ERTH</span>
              </div>
            </div>
            <button
              onClick={handleUnstake}
              className="stake-page-button"
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
            <p className="stake-page-note">Withdrawing has a 21-day unbonding period</p>
          </div>
        </div>
      )}

      {/* TAB 4: Unbonding */}
      {activeTab === "Unbonding" && (
        <div className="stake-page-tabcontent">
          {unbondingEntries.length > 0 ? (
            <div className="unbonding-entries-section">
              <h3>Unbonding Entries</h3>
              <ul className="unbonding-list">
                {unbondingEntries.map((entry, index) => {
                  const availableDate = new Date(entry.unbonding_time / 1e6).toLocaleString();
                  const amount = toMacroUnits(entry.amount, tokens["ERTH"]);
                  const isMatured = new Date() >= new Date(entry.unbonding_time / 1e6);
                  return (
                    <li key={index} className="unbonding-item">
                      <div className="unbonding-details">
                        <div className="unbonding-amount-row">
                          <img src="/images/coin/ERTH.png" alt="ERTH" className="unbonding-logo" />
                          <span className="unbonding-value">{Number(amount).toLocaleString()} ERTH</span>
                        </div>
                        <span className="unbonding-date">Available: {availableDate}</span>
                      </div>
                      <div className="unbonding-actions">
                        {isMatured ? (
                          <button
                            onClick={handleClaimUnbonded}
                            className="stake-page-button"
                            title="Claim your unbonded tokens"
                          >
                            Claim
                          </button>
                        ) : (
                          <button
                            onClick={() => handleCancelUnbond(entry)}
                            className="stake-page-button cancel-button"
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
            <div className="unbonding-entries-section empty">
              <h3>No Unbonding Tokens</h3>
              <p className="stake-page-note">You don't have any tokens in the unbonding period</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StakingManagement;