import React, { useState, useEffect } from 'react';
import "./PoolOverview.css";
import { contract } from '../utils/contractUtils';
import tokens from '../utils/tokens';
import contracts from '../utils/contracts';
import StatusModal from "./StatusModal";

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
    if (user_info) {
      setPendingRewards(Number(user_info.pending_rewards || 0).toLocaleString());
    }
    if (pool_info) {
      setLiquidity(Number(pool_info.liquidity || 0).toLocaleString());
      if (pool_info.daily_volumes) {
        // Sum the volumes for the past 7 days
        const totalVolume = pool_info.daily_volumes.slice(1, 8).reduce((a, v) => a + Number(v), 0);
        setVolume(totalVolume.toLocaleString());
      }
      if (pool_info.daily_rewards && pool_info.total_shares && pool_info.total_staked) {
        const lastWeek = pool_info.daily_rewards.slice(0, 7).reduce((a, r) => a + Number(r), 0);
        const totalShares = Number(pool_info.total_shares);
        const stakedShares = Number(pool_info.total_staked);
        const erthPerShare = Number(pool_info.liquidity) / totalShares;
        const aprValue = ((lastWeek * 52) / (stakedShares * erthPerShare)) * 100;
        setApr(`${aprValue.toFixed(2)}%`);
      }
    }
  }, [poolData]);

  const handleManageLiquidity = e => {
    e.stopPropagation();
    // Pass tokenKey along with poolData
    poolData && toggleManageLiquidity({ ...poolData, tokenKey });
  };

  const handleClaimRewards = async e => {
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
