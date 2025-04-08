import React, { useState, useEffect } from "react";
import "./PoolOverview.css";
import { contract, query } from "../utils/contractUtils";
import tokens from "../utils/tokens";
import contracts from "../utils/contracts";
import { toMacroUnits } from "../utils/mathUtils";

const PoolOverview = ({
  tokenKey,
  poolData,
  toggleManageLiquidity,
  isKeplrConnected,
  onClaimStart,
  onClaimSuccess,
  onClaimError,
  onClaimComplete,
}) => {
  const [pendingRewards, setPendingRewards] = useState("-");
  const [liquidity, setLiquidity] = useState("-");
  const [volume, setVolume] = useState("-");
  const [apr, setApr] = useState("-");

  const token = tokens[tokenKey];

  useEffect(() => {
    if (!poolData) return;

    const { pool_info, user_info } = poolData;

    if (user_info) {
      const pendingRewardsMacro = toMacroUnits(user_info.pending_rewards || 0, tokens.ERTH);
      setPendingRewards(pendingRewardsMacro.toLocaleString());
    }

    if (pool_info?.state) {
      const erthReserveMicro = Number(pool_info.state.erth_reserve || 0);
      const erthReserveMacro = toMacroUnits(erthReserveMicro, tokens.ERTH);
      const totalLiquidityMacro = 2 * erthReserveMacro;
      setLiquidity(totalLiquidityMacro.toLocaleString());

      if (Array.isArray(pool_info.state.daily_volumes)) {
        const totalVolumeMicro = pool_info.state.daily_volumes.slice(0, 7).reduce((acc, val) => acc + Number(val), 0);
        const totalVolumeMacro = toMacroUnits(totalVolumeMicro, tokens.ERTH);
        setVolume(totalVolumeMacro.toLocaleString());
      }

      const dailyRewards = pool_info.state.daily_rewards || [];
      const lastWeekMicro = dailyRewards.slice(0, 7).reduce((acc, val) => acc + Number(val), 0);
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

  const handleManageLiquidity = (e) => {
    e.stopPropagation();
    if (!poolData) return;
    toggleManageLiquidity(poolData);
  };

  const handleClaimRewards = async (e) => {
    e.stopPropagation();
    if (!isKeplrConnected) {
      console.warn("Keplr not connected.");
      return;
    }
    if (!token?.contract) {
      console.error(`No contract found for tokenKey: ${tokenKey}`);
      return;
    }
    if (!contracts?.exchange?.contract || !contracts?.exchange?.hash) {
      console.error("Invalid exchange config:", contracts.exchange);
      return;
    }

    onClaimStart(tokenKey);
    try {
      const msg = { claim_rewards: { pools: [token.contract] } };
      console.log("Claim message:", msg);
      await contract(contracts.exchange.contract, contracts.exchange.hash, msg);

      // Re-query pool data
      const queryMsg = {
        query_user_info: {
          pools: [token.contract],
          user: window.secretjs.address,
        },
      };
      const result = await query(contracts.exchange.contract, contracts.exchange.hash, queryMsg);
      console.log("Query result after claim:", result);

      const updatedData = result[0];
      if (updatedData?.user_info) {
        const pendingRewardsMacro = toMacroUnits(updatedData.user_info.pending_rewards || 0, tokens.ERTH);
        setPendingRewards(pendingRewardsMacro.toLocaleString());
      }
      if (updatedData?.pool_info?.state) {
        const erthReserveMicro = Number(updatedData.pool_info.state.erth_reserve || 0);
        const erthReserveMacro = toMacroUnits(erthReserveMicro, tokens.ERTH);
        const totalLiquidityMacro = 2 * erthReserveMacro;
        setLiquidity(totalLiquidityMacro.toLocaleString());

        if (Array.isArray(updatedData.pool_info.state.daily_volumes)) {
          const totalVolumeMicro = updatedData.pool_info.state.daily_volumes.slice(0, 7).reduce((acc, val) => acc + Number(val), 0);
          const totalVolumeMacro = toMacroUnits(totalVolumeMicro, tokens.ERTH);
          setVolume(totalVolumeMacro.toLocaleString());
        }

        const dailyRewards = updatedData.pool_info.state.daily_rewards || [];
        const lastWeekMicro = dailyRewards.slice(0, 7).reduce((acc, val) => acc + Number(val), 0);
        const lastWeekMacro = toMacroUnits(lastWeekMicro, tokens.ERTH);
        const totalShares = Number(updatedData.pool_info.state.total_shares || 0);
        const totalStaked = Number(updatedData.pool_info.state.total_staked || 0);
        const fractionStaked = totalShares ? totalStaked / totalShares : 0;
        const stakedLiquidityMacro = totalLiquidityMacro * fractionStaked;

        let aprValue = 0;
        if (stakedLiquidityMacro > 0) {
          aprValue = (lastWeekMacro / stakedLiquidityMacro) * 52 * 100;
        }
        setApr(`${aprValue.toFixed(2)}%`);
      }

      onClaimSuccess();
      onClaimComplete(tokenKey, updatedData); // Update parent data
    } catch (error) {
      console.error("Claim error:", error);
      onClaimError();
    }
  };

  const hasRewards = parseFloat((pendingRewards || "0").replace(/,/g, "")) > 0;

  if (!token) {
    return <div>Invalid token: {tokenKey}</div>;
  }

  return (
    <div className={`pool-overview-box ${hasRewards ? "pool-green-outline" : ""}`}>
      <div className="pool-info-row">
        <div className="pool-pair-info">
          <img src={token.logo} alt={`${tokenKey} logo`} className="pool-coin-logo" />
          <div className="pool-token-container">
            <h2 className="pool-label">{tokenKey}</h2>
            <span className="pool-pair-label">/ERTH</span>
          </div>
        </div>

        <div className="pool-compact-info">
          <div className="pool-info-item">
            <span className="pool-info-value">{pendingRewards}</span>
            <span className="pool-info-label">Rewards</span>
          </div>

          <div className="pool-info-item">
            <span className="pool-info-value">{liquidity}</span>
            <span className="pool-info-label">Liquidity (ERTH)</span>
          </div>

          <div className="pool-info-item">
            <span className="pool-info-value">{volume}</span>
            <span className="pool-info-label">Volume (7d)</span>
          </div>

          <div className="pool-info-item">
            <span className="pool-info-value">{apr}</span>
            <span className="pool-info-label">APR</span>
          </div>
        </div>

        <div className="pool-buttons-container">
          <button
            onClick={handleClaimRewards}
            disabled={!isKeplrConnected || !hasRewards}
            className={`pool-overview-button ${!hasRewards ? "disabled" : ""}`}
            title={!hasRewards ? "No rewards available to claim" : "Claim your rewards"}
          >
            Claim
          </button>

          <button onClick={handleManageLiquidity} className="pool-overview-button reverse">
            Manage
          </button>
        </div>
      </div>
    </div>
  );
};

export default PoolOverview;