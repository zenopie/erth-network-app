import React, { useState, useEffect } from 'react';
import "./PoolOverview.css";
import { contract } from '../utils/contractUtils';
import tokens from '../utils/tokens';
import contracts from '../utils/contracts';
import StatusModal from "./StatusModal";
import { toMacroUnits } from '../utils/mathUtils';

const PoolOverview = ({ tokenKey, poolData, toggleManageLiquidity, isKeplrConnected }) => {
  const [pendingRewards, setPendingRewards] = useState('-');
  const [liquidity, setLiquidity] = useState('-');
  const [volume, setVolume] = useState('-');
  const [apr, setApr] = useState('-');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState('loading');

  const token = tokens[tokenKey];

  useEffect(() => {
    if (!poolData) return;

    const { pool_info, user_info } = poolData;

    // --- 1) Pending Rewards
    if (user_info) {
      const pendingRewardsMacro = toMacroUnits(user_info.pending_rewards || 0, tokens.ERTH);
      setPendingRewards(pendingRewardsMacro.toLocaleString());
    }

    if (pool_info?.state) {
      // --- 2) Liquidity in ERTH (double the ERTH reserve)
      const erthReserveMicro = Number(pool_info.state.erth_reserve || 0);
      const erthReserveMacro = toMacroUnits(erthReserveMicro, tokens.ERTH);
      const totalLiquidityMacro = 2 * erthReserveMacro;
      setLiquidity(totalLiquidityMacro.toLocaleString());

      // --- 3) Volume (7 days)
      if (Array.isArray(pool_info.state.daily_volumes)) {
        const totalVolumeMicro = pool_info.state.daily_volumes
          .slice(0, 7)
          .reduce((acc, val) => acc + Number(val), 0);
        const totalVolumeMacro = toMacroUnits(totalVolumeMicro, tokens.ERTH);
        setVolume(totalVolumeMacro.toLocaleString());
      }

      // --- 4) APR
      const dailyRewards = pool_info.state.daily_rewards || [];
      const lastWeekMicro = dailyRewards
        .slice(0, 7)
        .reduce((acc, val) => acc + Number(val), 0);
      const lastWeekMacro = toMacroUnits(lastWeekMicro, tokens.ERTH);

      const totalShares = Number(pool_info.state.total_shares || 0);
      const totalStaked = Number(pool_info.state.total_staked || 0);
      const fractionStaked = totalShares ? totalStaked / totalShares : 0;
      const stakedLiquidityMacro = totalLiquidityMacro * fractionStaked;

      let aprValue = 0;
      if (stakedLiquidityMacro > 0) {
        aprValue = (lastWeekMacro / stakedLiquidityMacro) * 52 * 100;
      }
      setApr(`${aprValue.toFixed(2)}%`);
    }
  }, [poolData]);

  // Manage Liquidity
  const handleManageLiquidity = (e) => {
    e.stopPropagation();
    if (!poolData) return;
    toggleManageLiquidity(poolData);
  };

  // Claim Rewards
  const handleClaimRewards = async (e) => {
    e.stopPropagation();
    if (!isKeplrConnected) return console.warn("Keplr not connected.");
    setIsModalOpen(true);
    setAnimationState('loading');
    try {
      const msg = { claim: { pools: [token.poolContract] } };
      await contract(contracts.lpStaking.contract, contracts.lpStaking.hash, msg);
      setAnimationState('success');
    } catch (error) {
      console.error("Claim error:", error);
      setAnimationState('error');
    }
  };

  // If user has any pending rewards
  const hasRewards = parseFloat((pendingRewards || '0').replace(/,/g, '')) > 0;

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
          <span className="info-label">Volume (7d)</span>
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
          <button onClick={handleManageLiquidity} className="pool-overview-button reverse">
            Manage
          </button>
          <button onClick={handleClaimRewards} className="pool-overview-button">
            Claim
          </button>
        </div>
      </div>
    </div>
  );
};

export default PoolOverview;
