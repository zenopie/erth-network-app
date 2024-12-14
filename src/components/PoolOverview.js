import React, { useState, useEffect, useCallback } from 'react';
import "./PoolOverview.css";
import { query, contract } from '../utils/contractUtils';
import { toMacroUnits } from '../utils/mathUtils.js';
import tokens from '../utils/tokens.js';
import contracts from '../utils/contracts.js';
import StatusModal from "./StatusModal.js";
import { showLoadingScreen } from '../utils/uiUtils.js';

const PoolOverview = ({ tokenKey, toggleManageLiquidity, isKeplrConnected, onPoolInfoUpdate, refreshKey }) => {
    const [pendingRewards, setPendingRewards] = useState('-');
    const [poolInfo, setPoolInfo] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [animationState, setAnimationState] = useState('loading');
    const [liquidity, setLiquidity] = useState('-');
    const [volume, setVolume] = useState('-');
    const [apr, setApr] = useState('-');

    const token = tokens[tokenKey];
    const poolContract = token.poolContract;
    const stakingContract = contracts.lpStaking.contract;
    const stakingHash = contracts.lpStaking.hash;

    const fetchPoolInfo = useCallback(async () => {
        showLoadingScreen(true);
        if (!isKeplrConnected) {
            console.warn("Keplr ain’t connected, fam.");
            showLoadingScreen(false);
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

            setPoolInfo({
                ...resp,
                tokenKey: tokenKey,
            });

            let pendingInt = 0;
            if (resp && resp.pending_rewards) {
                let pending_rewards = toMacroUnits(resp.pending_rewards, tokens["ERTH"]);
                pendingInt = Math.floor(pending_rewards);
                setPendingRewards(`${pendingInt.toLocaleString()}`);
            } else {
                console.error("Invalid response structure:", resp);
                setPendingRewards('Error');
            }

            // Notify parent how many rewards we got
            onPoolInfoUpdate(poolContract, pendingInt);

            if (resp && resp.pool_info) {
                const liquidityMacro = toMacroUnits(parseInt(resp.pool_info.liquidity, 10), tokens["ERTH"]);
                setLiquidity(`${Math.floor(liquidityMacro).toLocaleString()}`);

                const dailyVolumes = resp.pool_info.daily_volumes.slice(1, 8);
                const totalVolumeMicro = dailyVolumes.reduce((acc, dayVolume) => acc + parseInt(dayVolume, 10), 0);
                const totalVolumeMacro = toMacroUnits(totalVolumeMicro, tokens["ERTH"]);
                setVolume(`${Math.floor(totalVolumeMacro).toLocaleString()}`);

                const lastWeekRewards = resp.pool_info.daily_rewards
                    .slice(0, 7)
                    .reduce((acc, dayReward) => acc + parseInt(dayReward, 10), 0);
                const totalShares = parseInt(resp.pool_info.total_shares, 10);
                const stakedShares = parseInt(resp.pool_info.total_staked, 10);
                const erthPerShare = parseInt(resp.pool_info.liquidity, 10) / totalShares;
                const stakedLiquidityInERTH = stakedShares * erthPerShare;
                const annualRewards = lastWeekRewards * 52;
                const aprValue = (annualRewards / stakedLiquidityInERTH) * 100;
                setApr(`${aprValue.toFixed(2)}%`);
            }
        } catch (error) {
            console.error("Error fetching pool info:", error);
            setPendingRewards('N/A');
            setLiquidity('N/A');
            setVolume('N/A');
            setApr('N/A');
            onPoolInfoUpdate(poolContract, 0);
        } finally {
            showLoadingScreen(false);
        }
    }, [isKeplrConnected, poolContract, stakingContract, stakingHash, tokenKey, onPoolInfoUpdate]);

    useEffect(() => {
        if (isKeplrConnected) {
            fetchPoolInfo();
        }
    }, [isKeplrConnected, fetchPoolInfo, refreshKey]);

    const handleManageLiquidityClick = (event) => {
        event.stopPropagation();
        if (poolInfo) {
            toggleManageLiquidity(poolInfo);
        } else {
            console.warn("Pool info ain’t ready yet, bruh.");
        }
    };

    const handleClaimRewards = async (event) => {
        event.stopPropagation();
        if (!isKeplrConnected) {
            console.warn("Keplr ain’t connected, bruh.");
            return;
        }
        setIsModalOpen(true);
        setAnimationState('loading');

        try {
            const msg = {
                claim: {
                    pools: [poolContract],
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

    const hasRewards = parseFloat(pendingRewards.replace(/,/g, '')) > 0;

    return (
        <div className={`pool-overview-box ${hasRewards ? 'green-outline' : ''}`}>
            <StatusModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                animationState={animationState}
            />
            <div className="info-row">
                <img src={token.logo} alt={`${tokenKey} logo`} className="coin-logo" />
                <div className="info-item">
                    <h2 className="pool-label">{tokenKey}</h2>
                    <span className="info-label">/ERTH</span>
                </div>
                <div className="info-item">
                    <span className="info-value">{pendingRewards}</span>
                    <span className="info-label">Rewards</span>
                </div>
                <div className="info-item">
                    <span className="info-value">{volume}</span>
                    <span className="info-label">Volume</span>
                </div>
                <div className="info-item">
                    <span className="info-value">{liquidity}</span>
                    <span className="info-label">Liquidity</span>
                </div>
                <div className="info-item">
                    <span className="info-value">{apr}</span>
                    <span className="info-label">APR</span>
                </div>
                <div className="buttons-container">
                    <button onClick={handleManageLiquidityClick} className="pool-overview-button reverse">Manage</button>
                    <button onClick={handleClaimRewards} className="pool-overview-button">Claim</button>
                </div>
            </div>
        </div>
    );
};

export default PoolOverview;
