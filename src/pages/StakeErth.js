import React, { useState, useEffect } from 'react';
import { contract, query } from '../utils/contractUtils';
import { showLoadingScreen } from '../utils/uiUtils';
import { toMacroUnits } from '../utils/mathUtils.js'; // Ensure this function exists and is correctly named
import tokens from '../utils/tokens.js';
import './StakeErth.css';

const THIS_CONTRACT = "secret10ea3ya578qnz02rmr7adhu2rq7g2qjg88ry2h5";
const THIS_HASH = "7815b8b45275e14d060a553dbda6f16ac3ad6fce45adc2ec9bddad50e1e283f6";

const StakingManagement = ({ isKeplrConnected }) => {
    const [activeTab, setActiveTab] = useState('Stake');
    const [stakeAmount, setStakeAmount] = useState('');
    const [unstakeAmount, setUnstakeAmount] = useState('');
    const [claimResult, setClaimResult] = useState('');
    const [stakeResult, setStakeResult] = useState('');
    const [unstakeResult, setUnstakeResult] = useState('');
    const [stakingRewards, setStakingRewards] = useState(null);
    const [loading, setLoading] = useState(false); // Optional: To manage loading state

    // Fetch Staking Rewards Function Inside the Component
    const fetchStakingRewards = async () => {
        if (!window.secretjs || !window.secretjs.address) {
            console.error("secretjs or secretjs.address is not defined.");
            setStakingRewards("N/A");
            return;
        }

        try {
            console.log("Fetching staking rewards...");
            setLoading(true);
            showLoadingScreen(true);

            const queryMsg = {
                get_user_info: { address: window.secretjs.address }
            };

            const resp = await query(THIS_CONTRACT, THIS_HASH, queryMsg);

            if (!resp || !resp.staking_rewards_due) {
                console.error("Invalid response structure:", resp);
                setStakingRewards("0");
                return;
            }

            const stakingRewardsDueMicro = resp.staking_rewards_due;
            const stakingRewardsDue = toMacroUnits(stakingRewardsDueMicro, tokens["ERTH"]);

            setStakingRewards(stakingRewardsDue);
        } catch (error) {
            console.error("Error querying user info:", error);
            setStakingRewards("Error");
        } finally {
            setLoading(false);
            showLoadingScreen(false);
        }
    };

    useEffect(() => {
        if (isKeplrConnected) {
            fetchStakingRewards();
        }
    }, [isKeplrConnected]);

    // Handlers for Stake, Unstake, and Claim Rewards
    const handleStake = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            setStakeResult("Please connect your Keplr wallet.");
            return;
        }

        if (!stakeAmount || isNaN(stakeAmount) || parseFloat(stakeAmount) <= 0) {
            setStakeResult("Please enter a valid stake amount.");
            return;
        }

        try {
            setLoading(true);
            showLoadingScreen(true);

            // Convert stakeAmount to micro units if necessary
            const amountInMicroUnits = toMacroUnits(stakeAmount, tokens['ERTH']); // Verify correct function

            // Construct the staking message
            const msg = {
                stake: {
                    amount: amountInMicroUnits.toString()
                }
            };

            // Send the staking transaction
            await contract(THIS_CONTRACT, THIS_HASH, msg);

            setStakeResult("Staking executed successfully!");
            // Optionally, refresh staking rewards
            fetchStakingRewards();
        } catch (error) {
            console.error("Error executing stake:", error);
            setStakeResult("Error executing stake. Check the console for details.");
        } finally {
            setLoading(false);
            showLoadingScreen(false);
        }
    };

    const handleUnstake = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            setUnstakeResult("Please connect your Keplr wallet.");
            return;
        }

        if (!unstakeAmount || isNaN(unstakeAmount) || parseFloat(unstakeAmount) <= 0) {
            setUnstakeResult("Please enter a valid unstake amount.");
            return;
        }

        try {
            setLoading(true);
            showLoadingScreen(true);

            // Convert unstakeAmount to micro units if necessary
            const amountInMicroUnits = toMacroUnits(unstakeAmount, tokens['ERTH']); // Verify correct function

            // Construct the unstaking message
            const msg = {
                unstake: {
                    amount: amountInMicroUnits.toString()
                }
            };

            // Send the unstaking transaction
            await contract(THIS_CONTRACT, THIS_HASH, msg);

            setUnstakeResult("Unstaking executed successfully!");
            // Optionally, refresh staking rewards
            fetchStakingRewards();
        } catch (error) {
            console.error("Error executing unstake:", error);
            setUnstakeResult("Error executing unstake. Check the console for details.");
        } finally {
            setLoading(false);
            showLoadingScreen(false);
        }
    };

    const handleClaimRewards = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            setClaimResult("Please connect your Keplr wallet.");
            return;
        }

        try {
            setLoading(true);
            showLoadingScreen(true);

            const msg = {
                claim: {},
            };

            await contract(THIS_CONTRACT, THIS_HASH, msg);

            setClaimResult("Rewards claimed successfully!");
            // Optionally, refresh staking rewards
            fetchStakingRewards();
        } catch (error) {
            console.error("Error claiming rewards:", error);
            setClaimResult("Error claiming rewards. Check the console for details.");
        } finally {
            setLoading(false);
            showLoadingScreen(false);
        }
    };

    const openTab = (tabName) => {
        setActiveTab(tabName);
        // Optionally, reset results when switching tabs
        setStakeResult('');
        setUnstakeResult('');
        setClaimResult('');
    };

    return (
        <div className="staking-management-box">
            <h2>Manage Staking</h2>

            <div className="staking-management-tab">
                <button
                    className={`tablinks ${activeTab === 'Stake' ? 'active' : ''}`}
                    onClick={() => openTab('Stake')}
                >
                    Stake
                </button>
                <button
                    className={`tablinks ${activeTab === 'Withdraw' ? 'active' : ''}`}
                    onClick={() => openTab('Withdraw')}
                >
                    Withdraw
                </button>
            </div>

            {activeTab === 'Stake' && (
                <div className="staking-management-tabcontent">
                    <div className="staking-rewards-display">
                        <h3>Staking Rewards Due:</h3>
                        <p>{stakingRewards !== null ? `${stakingRewards} ERTH` : "Loading..."}</p>
                        <div className="staking-management-claim-section">
                            <button onClick={handleClaimRewards} className="staking-management-button" disabled={loading}>
                                Claim Rewards
                            </button>
                            <div id="claim-result" className="staking-management-result">
                                {claimResult}
                            </div>
                        </div>
                    </div>

                    <div className="staking-management-input-group">
                        <div className="staking-management-label-wrapper">
                            <label htmlFor="stake-amount" className="staking-management-input-label">Stake Amount</label>
                        </div>
                        <div className="staking-management-input-wrapper">
                            <input
                                type="number"
                                id="stake-amount"
                                placeholder="Amount to Stake"
                                className="staking-management-input"
                                value={stakeAmount}
                                onChange={(e) => setStakeAmount(e.target.value)}
                                min="0"
                                step="any"
                            />
                        </div>
                        <button onClick={handleStake} className="staking-management-button" disabled={loading}>
                            Stake Tokens
                        </button>
                        <div id="stake-result" className="staking-management-result">
                            {stakeResult}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'Withdraw' && (
                <div className="staking-management-tabcontent">
                    <div className="staking-management-input-group">
                        <div className="staking-management-label-wrapper">
                            <label htmlFor="unstake-amount" className="staking-management-input-label">Unstake Amount</label>
                        </div>
                        <div className="staking-management-input-wrapper">
                            <input
                                type="number"
                                id="unstake-amount"
                                placeholder="Amount to Unstake"
                                className="staking-management-input"
                                value={unstakeAmount}
                                onChange={(e) => setUnstakeAmount(e.target.value)}
                                min="0"
                                step="any"
                            />
                        </div>
                        <button onClick={handleUnstake} className="staking-management-button" disabled={loading}>
                            Unstake Tokens
                        </button>
                        <div id="unstake-result" className="staking-management-result">
                            {unstakeResult}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StakingManagement;
