// StakeErth.js

import React, { useState, useEffect } from "react";
import { query, contract, snip, querySnipBalance, requestViewingKey } from "../utils/contractUtils";
import { toMicroUnits, toMacroUnits } from "../utils/mathUtils.js";
import tokens from "../utils/tokens.js";
import { showLoadingScreen } from "../utils/uiUtils";
import "./StakeErth.css";
import StatusModal from "../components/StatusModal";

const THIS_CONTRACT = "secret10ea3ya578qnz02rmr7adhu2rq7g2qjg88ry2h5";
const THIS_HASH = "df9766e5327d6544c8110b7efce5d8a18ea43ad61d11877b888263e09811962b";

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

  useEffect(() => {
    if (isKeplrConnected) {
      fetchStakingRewards();
    }
  }, [isKeplrConnected]);

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

  const handleRequestViewingKey = async (token) => {
    await requestViewingKey(token);
    fetchStakingRewards(); // Refresh balances after viewing key is set
  };

  return (
    <div className="stake-page-box">
      {/* Modal for displaying swap status */}
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />
      <h2>Manage Staking</h2>

      <div className="stake-page-tab">
        <button className={`tablinks ${activeTab === "Info" ? "active" : ""}`} onClick={() => setActiveTab("Info")}>
          Info & Rewards
        </button>
        <button className={`tablinks ${activeTab === "Stake" ? "active" : ""}`} onClick={() => setActiveTab("Stake")}>
          Stake/Unstake
        </button>
        <button
          className={`tablinks ${activeTab === "Unbonding" ? "active" : ""}`}
          onClick={() => setActiveTab("Unbonding")}
        >
          Unbonding
        </button>
      </div>

      {/* TAB 1: Info & Rewards */}
      {activeTab === "Info" && (
        <div className="stake-page-tabcontent">
          {/* Info Display */}
          <div className="stake-page-info-display">
            <div className="stake-page-info-row">
              <span className="stake-page-info-label">Your Staked Amount:</span>
              <span className="stake-page-info-value">
                {stakedBalance !== null && stakedBalance !== "Error"
                  ? `${Number(stakedBalance).toLocaleString()} ERTH`
                  : "Loading..."}
              </span>
            </div>
            <div className="stake-page-info-row">
              <span className="stake-page-info-label">Your ERTH Balance:</span>
              <span className="stake-page-info-value">
                {unstakedBalance !== null && unstakedBalance !== "Error" ? (
                  `${Number(unstakedBalance).toLocaleString()} ERTH`
                ) : (
                  <button className="stake-page-inline-button" onClick={() => handleRequestViewingKey(tokens["ERTH"])}>
                    Get Viewing Key
                  </button>
                )}
              </span>
            </div>
            <div className="stake-page-info-row">
              <span className="stake-page-info-label">Current APR:</span>
              <span className="stake-page-info-value">{(apr * 100).toFixed(2)}%</span>
            </div>
            <div className="stake-page-info-row">
              <span className="stake-page-info-label">Total Staked:</span>
              <span className="stake-page-info-value">
                {totalStakedBalance !== null ? `${Number(totalStakedBalance).toLocaleString()} ERTH` : "Loading..."}
              </span>
            </div>
          </div>

          {/* Staking Rewards Display and Claim Section */}
          {stakingRewards > 0 ? (
            <div className="stake-page-rewards-section">
              <h3>Available Rewards</h3>
              <div className="stake-page-info-row">
                <span className="stake-page-info-label">Staking Rewards Due:</span>
                <span className="stake-page-info-value rewards-value">
                  {stakingRewards !== null ? `${Number(stakingRewards).toLocaleString()} ERTH` : "Loading..."}
                </span>
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
            <div className="stake-page-rewards-section">
              <h3>No Rewards Available</h3>
              <div className="stake-page-info-row">
                <span className="stake-page-info-label">Staking Rewards Due:</span>
                <span className="stake-page-info-value">0 ERTH</span>
              </div>
              <p className="stake-page-note">Stake ERTH tokens to earn rewards</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Stake/Unstake */}
      {activeTab === "Stake" && (
        <div className="stake-page-tabcontent">
          <div className="stake-page-section">
            <h3>Stake ERTH</h3>
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
              <div className="stake-page-input-wrapper">
                <input
                  type="number"
                  placeholder="0.0"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="stake-page-input"
                />
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

          <div className="stake-page-divider"></div>

          <div className="stake-page-section">
            <h3>Unstake ERTH</h3>
            {/* Unstake Input Section */}
            <div className="stake-page-input-group">
              <div className="stake-page-label-wrapper">
                <label className="stake-page-input-label">Amount to Unstake</label>
                <div className="stake-page-token-balance">
                  {stakedBalance === null || stakedBalance === "Error" ? (
                    <span>No staked ERTH</span>
                  ) : (
                    <>
                      <span>Balance: {Number(stakedBalance).toLocaleString()}</span>
                      <button className="stake-page-max-button" onClick={() => setUnstakeAmount(stakedBalance)}>
                        Max
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="stake-page-input-wrapper">
                <input
                  type="number"
                  placeholder="0.0"
                  value={unstakeAmount}
                  onChange={(e) => setUnstakeAmount(e.target.value)}
                  className="stake-page-input"
                />
              </div>
            </div>
            <button
              onClick={handleUnstake}
              className="stake-page-button"
              disabled={!unstakeAmount || Number(unstakeAmount) <= 0 || Number(unstakeAmount) > Number(stakedBalance)}
              title={
                !unstakeAmount
                  ? "Enter an amount to unstake"
                  : Number(unstakeAmount) <= 0
                  ? "Amount must be greater than 0"
                  : Number(unstakeAmount) > Number(stakedBalance)
                  ? "Insufficient staked balance"
                  : ""
              }
            >
              Unstake
            </button>
            <p className="stake-page-note">Unstaking has a 21-day unbonding period</p>
          </div>
        </div>
      )}

      {/* TAB 3: Unbonding */}
      {activeTab === "Unbonding" && (
        <div className="stake-page-tabcontent">
          {unbondingEntries.length > 0 ? (
            <div className="unbonding-entries-section">
              <h3>Unbonding Entries</h3>
              <ul className="unbonding-list">
                {unbondingEntries.map((entry, index) => {
                  const availableDate = new Date(entry.unbonding_time / 1e6).toLocaleString();
                  const amount = toMacroUnits(entry.amount, tokens["ERTH"]);
                  return (
                    <li key={index} className="unbonding-item">
                      <div className="unbonding-amount">
                        <span className="unbonding-label">Amount:</span>
                        <span className="unbonding-value">{Number(amount).toLocaleString()} ERTH</span>
                      </div>
                      <div className="unbonding-date">
                        <span className="unbonding-label">Available:</span>
                        <span className="unbonding-value">{availableDate}</span>
                      </div>
                      {new Date() >= new Date(entry.unbonding_time / 1e6) && (
                        <button
                          onClick={handleClaimUnbonded}
                          className="stake-page-button"
                          title="Claim your unbonded tokens"
                        >
                          Claim
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="unbonding-entries-section">
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
