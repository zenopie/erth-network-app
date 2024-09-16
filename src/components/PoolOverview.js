// PoolOverview.js
import React, { useState, useEffect, useCallback } from 'react';
import "./PoolOverview.css";
import { query, contract } from '../utils/contractUtils';
import { toMacroUnits } from '../utils/mathUtils.js';
import tokens from '../utils/tokens.js';
import contracts from '../utils/contracts.js';
import StatusModal from "./StatusModal.js";

const PoolOverview = ({ tokenKey, toggleManageLiquidity, isKeplrConnected }) => {
    const [pendingRewards, setPendingRewards] = useState('-');
    const [poolInfo, setPoolInfo] = useState(null); 
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [animationState, setAnimationState] = useState('loading');
    const [liquidity, setLiquidity] = useState('-');
    const [volume, setVolume] = useState('-');
    const [apr, setApr] = useState('-');

    const hasRewards = pendingRewards > 0; // Check if rewards are greater than 0

    // Access token and pool data from tokens.js
    const token = tokens[tokenKey];
    const poolContract = token.poolContract;
    const stakingContract = contracts.lpStaking.contract;
    const stakingHash = contracts.lpStaking.hash;

    const fetchPoolInfo = useCallback(async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }

        try {
            const querymsg = {
                query_user_rewards: {
                    pool: poolContract,
                    user: window.secretjs.address,
                },
            };

            const resp = await query(stakingContract, stakingHash, querymsg);

            // Set poolInfo with tokenKey
            setPoolInfo({
                ...resp,
                tokenKey: tokenKey, // Include the token key here
            });

            if (resp && resp.pending_rewards) {
                let pending_rewards = toMacroUnits(resp.pending_rewards, tokens["ERTH"]);
                setPendingRewards(`${Math.floor(pending_rewards).toLocaleString()}`);
            } else {
                console.error("Invalid response structure:", resp);
                setPendingRewards('Error');
            }

            if (resp && resp.pool_info) {
                // Convert liquidity from micro units to macro units (for ERTH)
                const liquidityMacro = toMacroUnits(parseInt(resp.pool_info.liquidity, 10), tokens["ERTH"]);
                setLiquidity(`${Math.floor(liquidityMacro).toLocaleString()}`);

                // Calculate volume for the last 7 days (excluding today), converting to macro units
                const dailyVolumes = resp.pool_info.daily_volumes.slice(1, 8);
                const totalVolumeMicro = dailyVolumes.reduce((acc, dayVolume) => acc + parseInt(dayVolume, 10), 0);
                const totalVolumeMacro = toMacroUnits(totalVolumeMicro, tokens["ERTH"]);
                setVolume(`${Math.floor(totalVolumeMacro).toLocaleString()}`);

                // Calculate rewards for the last 7 days (in micro units)
                const lastWeekRewards = resp.pool_info.daily_rewards.slice(1, 8).reduce((acc, dayReward) => acc + parseInt(dayReward, 10), 0);

                // Calculate staked liquidity in ERTH (using shares)
                const totalShares = parseInt(resp.pool_info.total_shares, 10); // Total shares in the pool
                const stakedShares = parseInt(resp.pool_info.total_staked, 10); // Staked shares
                const erthPerShare = parseInt(resp.pool_info.liquidity, 10) / totalShares; // ERTH per share ratio
                const stakedLiquidityInERTH = stakedShares * erthPerShare;

                // Annualize the rewards and calculate APR using micro units
                const annualRewards = lastWeekRewards * 52; // Multiply by 52 weeks
                const aprValue = (annualRewards / stakedLiquidityInERTH) * 100; // APR formula using micro units
                setApr(`${aprValue.toFixed(2)}%`);
            }
        } catch (error) {
            console.error("Error fetching pool info:", error);
            setPendingRewards('N/A');
            setLiquidity('N/A');
            setVolume('N/A');
            setApr('N/A');
        }
    }, [isKeplrConnected, poolContract, stakingContract, stakingHash, tokenKey]);

    useEffect(() => {
        if (isKeplrConnected) {
            fetchPoolInfo();
        }
    }, [isKeplrConnected, fetchPoolInfo]);

    const handleManageLiquidityClick = (event) => {
        event.stopPropagation();
        if (poolInfo) {
            toggleManageLiquidity(poolInfo);
        } else {
            console.warn("Pool info is not yet available.");
        }
    };

    const handleClaimRewards = async (event) => {
        event.stopPropagation();
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }
        setIsModalOpen(true);
        setAnimationState('loading');

        try {
            const msg = {
                claim: {
                    pool: poolContract,
                },
            };

            await contract(stakingContract, stakingHash, msg);
            setAnimationState('success');
            fetchPoolInfo(); 
        } catch (error) {
            console.error("Error claiming rewards:", error);
            setAnimationState('error');
        }
    };

    return (
        <div className={`pool-overview-box ${hasRewards ? 'green-outline' : ''}`}>
            {/* Modal for displaying swap status */}
            <StatusModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                animationState={animationState}
            />
    
            {/* Info Row with buttons */}
            <div className="info-row">
                {/* Coin Logo */}
                <img src={token.logo} alt={`${tokenKey} logo`} className="coin-logo" />
                
                <h2 className="pool-label">{tokenKey}/ERTH</h2>

                {/* Pending Rewards */}
                <div className="info-item">
                    <span className="info-value">{pendingRewards}</span>
                    <span className="info-label">Rewards</span>
                </div>

                {/* Volume */}
                <div className="info-item">
                    <span className="info-value">{volume}</span>
                    <span className="info-label">Volume</span>
                </div>

                {/* Liquidity */}
                <div className="info-item">
                    <span className="info-value">{liquidity}</span>
                    <span className="info-label">Liquidity</span>
                </div>

                {/* APR */}
                <div className="info-item">
                    <span className="info-value">{apr}</span>
                    <span className="info-label">APR</span>
                </div>
    
                {/* Buttons at the end of the row */}
                <div className="buttons-container">
                    <button onClick={handleManageLiquidityClick} className="pool-overview-button reverse">Manage</button>
                    <button onClick={handleClaimRewards} className="pool-overview-button">Claim</button>
                </div>
            </div>
        </div>
    );
};

export default PoolOverview;
