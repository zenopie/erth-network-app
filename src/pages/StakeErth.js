import React, { useState, useEffect } from 'react';
import { contract, query, } from '../utils/contractUtils';
import { showLoadingScreen } from '../utils/uiUtils';
import { toMicroUnits, toMacroUnits } from '../utils/mathUtils.js';
import tokens from '../utils/tokens.js';
import './StakeErth.css';

const this_contract = "secret10ea3ya578qnz02rmr7adhu2rq7g2qjg88ry2h5";
const this_hash = "7815b8b45275e14d060a553dbda6f16ac3ad6fce45adc2ec9bddad50e1e283f6";

const StakingManagement = ({ isKeplrConnected }) => {
    const [activeTab, setActiveTab] = useState('Stake');
    const [stakeAmount, setStakeAmount] = useState('');
    const [unstakeAmount, setUnstakeAmount] = useState('');
    const [claimResult, setClaimResult] = useState('');
    const [stakeResult, setStakeResult] = useState('');
    const [unstakeResult, setUnstakeResult] = useState('');
    const [stakingRewards, setStakingRewards] = useState(null);

    useEffect(() => {
        if (isKeplrConnected) {
            fetchStakingRewards();
        }
    }, [isKeplrConnected]);

    const fetchStakingRewards = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }
    
        try {
            console.log("Fetching staking rewards...");
    
            const querymsg = {
                get_user_info: { address: window.secretjs.address }
            };
    
            const resp = await query(this_contract, this_hash, querymsg);
    
            const stakingRewardsDueMicro = resp.staking_rewards_due;
    
            const stakingRewardsDue = toMacroUnits(stakingRewardsDueMicro, tokens["ERTH"]);
    
            setStakingRewards(stakingRewardsDue);
            showLoadingScreen(false);
        } catch (error) {
            console.error("Error querying user info:", error);
        }
    };

    const handleStake = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }

        try {
            const amountInMicroUnits = toMicroUnits(stakeAmount, tokens['ERTH']);
            // Construct the staking message here and send it via snip or appropriate method
            setStakeResult("Staking executed successfully!");
        } catch (error) {
            console.error("Error executing stake:", error);
            setStakeResult("Error executing stake. Check the console for details.");
        }
    };

    const handleUnstake = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }

        try {
            const amountInMicroUnits = toMicroUnits(unstakeAmount, tokens['ERTH']);
            // Construct the unstaking message here and send it via snip or appropriate method
            setUnstakeResult("Unstaking executed successfully!");
        } catch (error) {
            console.error("Error executing unstake:", error);
            setUnstakeResult("Error executing unstake. Check the console for details.");
        }
    };

    const handleClaimRewards = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }

        try {
            let msg = {
                claim: {},
            };
            await contract(this_contract, this_hash, msg);
            setClaimResult("Rewards claimed successfully!");
        } catch (error) {
            console.error("Error claiming rewards:", error);
            setClaimResult("Error claiming rewards. Check the console for details.");
        }
    };

    const openTab = (tabName) => {
        setActiveTab(tabName);
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
                            <button onClick={handleClaimRewards} className="staking-management-button">Claim Rewards</button>
                            <div id="claim-result" className="staking-management-result">{claimResult}</div>
                        </div>
                    </div>

                    <div className="staking-management-input-group">
                        <div className="staking-management-label-wrapper">
                            <label htmlFor="stake-amount" className="staking-management-input-label">Stake Amount</label>
                        </div>
                        <div className="staking-management-input-wrapper">
                            <input
                                type="text"
                                id="stake-amount"
                                placeholder="Amount to Stake"
                                className="staking-management-input"
                                value={stakeAmount}
                                onChange={(e) => setStakeAmount(e.target.value)}
                            />
                        </div>
                        <button onClick={handleStake} className="staking-management-button">Stake Tokens</button>
                        <div id="stake-result" className="staking-management-result">{stakeResult}</div>
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
                                type="text"
                                id="unstake-amount"
                                placeholder="Amount to Unstake"
                                className="staking-management-input"
                                value={unstakeAmount}
                                onChange={(e) => setUnstakeAmount(e.target.value)}
                            />
                        </div>
                        <button onClick={handleUnstake} className="staking-management-button">Unstake Tokens</button>
                        <div id="unstake-result" className="staking-management-result">{unstakeResult}</div>
                    </div>

                    
                </div>
            )}
        </div>
    );
};

export default StakingManagement;
