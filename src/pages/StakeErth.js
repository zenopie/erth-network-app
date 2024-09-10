import React, { useState, useEffect } from 'react';
import { query, contract, snip } from '../utils/contractUtils'; 
import { toMicroUnits, toMacroUnits } from '../utils/mathUtils.js'; 
import tokens from '../utils/tokens.js';
import { showLoadingScreen } from '../utils/uiUtils';
import './StakeErth.css';

const THIS_CONTRACT = "secret10ea3ya578qnz02rmr7adhu2rq7g2qjg88ry2h5";
const THIS_HASH = "769c585aeb36c80967f6e8d214683e6e9637cd29a1770c056c1c6ecaa38401cd";

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
    const [activeTab, setActiveTab] = useState('Stake');
    const [stakeAmount, setStakeAmount] = useState('');
    const [unstakeAmount, setUnstakeAmount] = useState('');
    const [claimResult, setClaimResult] = useState('');
    const [stakeResult, setStakeResult] = useState('');
    const [unstakeResult, setUnstakeResult] = useState('');
    const [stakingRewards, setStakingRewards] = useState(null);
    const [totalStaked, setTotalStaked] = useState(null); // Track total staked
    const [apr, setApr] = useState(0);
    const [loading, setLoading] = useState(false);

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
            const totalStakedMicro = resp.total_staked;
            setStakingRewards(toMacroUnits(stakingRewardsDueMicro, tokens["ERTH"]));
            setTotalStaked(totalStakedMicro);

            // Only calculate APR once totalStaked is available
            if (totalStakedMicro) {
                const calculatedApr = calculateAPR(totalStakedMicro);
                setApr(calculatedApr);
            }
        } catch (error) {
            console.error("Error querying user info:", error);
            setStakingRewards("Error");
        } finally {
            setLoading(false);
            showLoadingScreen(false);
        }
    };

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

            const amountInMicroUnits = toMicroUnits(stakeAmount, tokens['ERTH']); 

            const snipmsg = {
                stake_erth: {}
            };

            await snip(tokens["ERTH"].contract, tokens["ERTH"].hash, THIS_CONTRACT, THIS_HASH, snipmsg, amountInMicroUnits.toString());

            setStakeResult("Staking executed successfully!");
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

            const amountInMicroUnits = toMicroUnits(unstakeAmount, tokens['ERTH']);

            const msg = {
                unstake: {
                    amount: amountInMicroUnits.toString()
                }
            };

            await contract(THIS_CONTRACT, THIS_HASH, msg);

            setUnstakeResult("Unstaking executed successfully!");
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
            fetchStakingRewards();
        } catch (error) {
            console.error("Error claiming rewards:", error);
            setClaimResult("Error claiming rewards. Check the console for details.");
        } finally {
            setLoading(false);
            showLoadingScreen(false);
        }
    };

    return (
        <div className="staking-management-box">
            <h2>Manage Staking</h2>

            <div className="staking-management-tab">
                <button
                    className={`tablinks ${activeTab === 'Stake' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Stake')}
                >
                    Stake
                </button>
                <button
                    className={`tablinks ${activeTab === 'Withdraw' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Withdraw')}
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

                        {/* APR Display */}
                        <div className="staking-apr-display">
                            <h3>Current APR:</h3>
                            <p>{(apr * 100).toFixed(2)}%</p>
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
