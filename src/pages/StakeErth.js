import React, { useState, useEffect } from 'react';
import { query, contract, snip, querySnipBalance, requestViewingKey } from '../utils/contractUtils'; 
import { toMicroUnits, toMacroUnits } from '../utils/mathUtils.js'; 
import tokens from '../utils/tokens.js';
import { showLoadingScreen } from '../utils/uiUtils';
import './StakeErth.css'; 
import StatusModal from '../components/StatusModal'; 

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
    const [stakingRewards, setStakingRewards] = useState(null);
    const [apr, setApr] = useState(0);
    const [stakedBalance, setStakedBalance] = useState(null);
    const [unstakedBalance, setUnstakedBalance] = useState(null);
    const [totalStakedBalance, setTotalStakedBalance] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [animationState, setAnimationState] = useState('loading'); // 'loading', 'success', 'error'

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
                get_user_info: { address: window.secretjs.address }
            };

            const resp = await query(THIS_CONTRACT, THIS_HASH, queryMsg);

            if (!resp || resp.staking_rewards_due === undefined) {
                console.error("Invalid response structure:", resp);
                setStakingRewards(0);
                return;
            }

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
        } catch (error) {
            console.error("Error querying user info:", error);
            setStakingRewards(0);
            setStakedBalance("Error");
            setUnstakedBalance("Error");
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
            setIsModalOpen(true);  // Open the modal and show loading animation
            setAnimationState('loading');  // Set the state to loading when the swap starts

            const amountInMicroUnits = toMicroUnits(stakeAmount, tokens['ERTH']); 

            const snipmsg = {
                stake_erth: {}
            };

            await snip(tokens["ERTH"].contract, tokens["ERTH"].hash, THIS_CONTRACT, THIS_HASH, snipmsg, amountInMicroUnits.toString());

            setAnimationState('success'); 
            setStakeAmount(''); // Clear the input
        } catch (error) {
            console.error("Error executing stake:", error);
            setAnimationState('error');
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

            const amountInMicroUnits = toMicroUnits(unstakeAmount, tokens['ERTH']);

            const msg = {
                unstake: {
                    amount: amountInMicroUnits.toString()
                }
            };

            await contract(THIS_CONTRACT, THIS_HASH, msg);

            setUnstakeAmount(''); // Clear the input
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
            setAnimationState('loading');

            const msg = {
                claim: {},
            };

            await contract(THIS_CONTRACT, THIS_HASH, msg);

            setAnimationState('success'); 
        } catch (error) {
            console.error("Error claiming rewards:", error);
            setAnimationState('error');
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
            <StatusModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                animationState={animationState}
            />
            <h2>Manage Staking</h2>

            <div className="stake-page-tab">
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
                <div className="stake-page-tabcontent">
                    {/* Info Display */}
                    <div className="stake-page-info-display">
                        <div className="stake-page-info-row">
                            <span className="stake-page-info-label">Your Staked Amount:</span>
                            <span className="stake-page-info-value">
                                {stakedBalance !== null && stakedBalance !== "Error" ? `${stakedBalance} ERTH` : "Loading..."}
                            </span>
                        </div>
                        <div className="stake-page-info-row">
                            <span className="stake-page-info-label">Current APR:</span>
                            <span className="stake-page-info-value">{(apr * 100).toFixed(2)}%</span>
                        </div>
                        <div className="stake-page-info-row">
                            <span className="stake-page-info-label">Total Staked:</span>
                            <span className="stake-page-info-value">
                                {totalStakedBalance !== null ? `${totalStakedBalance} ERTH` : "Loading..."}
                            </span>
                        </div>
                    </div>

                    {/* Stake Input Section */}
                    <div className="stake-page-input-group">
                        <div className="stake-page-label-wrapper">
                            <label htmlFor="stake-amount" className="stake-page-input-label">Stake Amount</label>
                            <div className="stake-page-token-balance">
                                {unstakedBalance === 'Error' ? (
                                    <button className="stake-page-max-button" onClick={() => handleRequestViewingKey(tokens["ERTH"])}>
                                        Get Viewing Key
                                    </button>
                                ) : (
                                    <>
                                        <span>
                                            Balance: {unstakedBalance !== null ? unstakedBalance : 'N/A'}
                                        </span>
                                        <button className="stake-page-max-button" onClick={() => setStakeAmount(unstakedBalance)}>Max</button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="stake-page-input-wrapper">
                            <input
                                type="number"
                                id="stake-amount"
                                placeholder="Amount to Stake"
                                className="stake-page-input"
                                value={stakeAmount}
                                onChange={(e) => setStakeAmount(e.target.value)}
                                min="0"
                                step="any"
                            />
                        </div>
                        <button onClick={handleStake} className="stake-page-button">
                            Stake Tokens
                        </button>
                    </div>

                    {/* Staking Rewards Display and Claim Section */}
                    {stakingRewards > 0 && (
                        <div className="stake-page-rewards-section">
                            <div className="stake-page-info-row">
                                <span className="stake-page-info-label">Staking Rewards Due:</span>
                                <span className="stake-page-info-value">
                                    {stakingRewards !== null ? `${stakingRewards} ERTH` : "Loading..."}
                                </span>
                            </div>
                            <button onClick={handleClaimRewards} className="stake-page-button">
                                Claim Rewards
                            </button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'Withdraw' && (
                <div className="stake-page-tabcontent">
                    {/* Unstake Input Section */}
                    <div className="stake-page-input-group">
                        <div className="stake-page-label-wrapper">
                            <label htmlFor="unstake-amount" className="stake-page-input-label">Unstake Amount</label>
                            <div className="stake-page-token-balance">
                                {stakedBalance === null || stakedBalance === 'Error' ? (
                                    <p>Loading...</p>
                                ) : (
                                    <>
                                        <span>
                                            Balance: {stakedBalance}
                                        </span>
                                        <button className="stake-page-max-button" onClick={() => setUnstakeAmount(stakedBalance)}>Max</button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="stake-page-input-wrapper">
                            <input
                                type="number"
                                id="unstake-amount"
                                placeholder="Amount to Unstake"
                                className="stake-page-input"
                                value={unstakeAmount}
                                onChange={(e) => setUnstakeAmount(e.target.value)}
                                min="0"
                                step="any"
                            />
                        </div>
                        <button onClick={handleUnstake} className="stake-page-button">
                            Unstake Tokens
                        </button>
                    </div>

                    {/* Staking Rewards Display and Claim Section */}
                    {stakingRewards > 0 && (
                        <div className="stake-page-rewards-section">
                            <div className="stake-page-info-row">
                                <span className="stake-page-info-label">Staking Rewards Due:</span>
                                <span className="stake-page-info-value">
                                    {stakingRewards !== null ? `${stakingRewards} ERTH` : "Loading..."}
                                </span>
                            </div>
                            <button onClick={handleClaimRewards} className="stake-page-button">
                                Claim Rewards
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default StakingManagement;
