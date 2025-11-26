import React, { useState, useEffect } from "react";
import "./PoolOverview.css";
import { contract, query } from "../utils/contractUtils";
import tokens from "../utils/tokens";
import contracts from "../utils/contracts";
import { toMacroUnits } from "../utils/mathUtils";
import { fetchErthPrice, formatUSD } from "../utils/apiUtils";

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
  const [erthPrice, setErthPrice] = useState(null);

  const token = tokens[tokenKey];

  // Fetch ERTH price on mount and update every minute
  useEffect(() => {
    const updateErthPrice = async () => {
      try {
        const priceData = await fetchErthPrice();
        setErthPrice(priceData.price);
      } catch (error) {
        console.error('Failed to fetch ERTH price:', error);
      }
    };

    updateErthPrice();
    const interval = setInterval(updateErthPrice, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

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

      // In direct staking approach, all shares are automatically staked
      // so APR is calculated against total liquidity
      let aprValue = 0;
      if (totalLiquidityMacro > 0) {
        aprValue = (lastWeekMacro / totalLiquidityMacro) * 52 * 100;
      }
      setApr(`${aprValue.toFixed(2)}%`);
    }
  }, [poolData]);
  
  // Calculate unbonding percent for the circular lock visualization.
  // Use pool_info.state.unbonding_shares / pool_info.state.total_shares (clamped 0..1).
  const unbondingPercent = (() => {
    if (!poolData?.pool_info?.state) return 0;
    const us = Number(poolData.pool_info.state.unbonding_shares || 0);
    const ts = Number(poolData.pool_info.state.total_shares || 0);
    if (!ts) return 0;
    const p = Math.min(Math.max(us / ts, 0), 1);
    return p;
  })();
  const unbondingPercentDisplay = (unbondingPercent * 100).toFixed(1);
  
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

        // In direct staking approach, all shares are automatically staked
        // so APR is calculated against total liquidity
        let aprValue = 0;
        if (totalLiquidityMacro > 0) {
          aprValue = (lastWeekMacro / totalLiquidityMacro) * 52 * 100;
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

          {/* Unbonding lock visualization: circle with green base and red arc for unbonding portion.
              Show red arc and alert only when unbondingPercent > 10% (0.1).
              Lock in center is white with a green lock icon by default; turns red with white "!" when alert. */}
          <div className="unbonding-lock" title={`${unbondingPercentDisplay}% unbonding`}>
            <svg className="unbonding-svg" width="56" height="56" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <circle className="u-bg" cx="28" cy="28" r="20" fill="none" stroke="#e6e6e6" strokeWidth="6" />
              {/* Full green base (shows normal shares by default) */}
              <circle
                className="u-green"
                cx="28"
                cy="28"
                r="20"
                fill="none"
                stroke="#4caf50"
                strokeWidth="6"
                strokeLinecap="round"
                style={{
                  transform: "rotate(-90deg)",
                  transformOrigin: "28px 28px",
                }}
              />
              {/* Red arc overlay: only render when over threshold */}
              {unbondingPercent > 0.1 && (
                <circle
                  className="u-red"
                  cx="28"
                  cy="28"
                  r="20"
                  fill="none"
                  stroke="#e53935"
                  strokeWidth="6"
                  strokeLinecap="round"
                  style={{
                    strokeDasharray: `${2 * Math.PI * 20 * unbondingPercent} ${2 * Math.PI * 20}`,
                    transform: "rotate(-90deg)",
                    transformOrigin: "28px 28px",
                  }}
                />
              )}
            </svg>

            <div className={`u-lock ${unbondingPercent > 0.1 ? "u-lock-alert" : ""}`} aria-hidden>
              {unbondingPercent > 0.1 ? (
                <span className="u-lock-exclaim">!</span>
              ) : (
                <i className="bx bx-lock-alt" aria-hidden></i>
              )}
            </div>
          </div>
        </div>

        <div className="pool-compact-info">
          <div className="pool-info-item">
            <span className="pool-info-value">{pendingRewards}</span>
            {erthPrice && pendingRewards !== "-" && (
              <span className="pool-info-usd">
                {formatUSD(parseFloat(pendingRewards.replace(/,/g, '')) * erthPrice)}
              </span>
            )}
            <span className="pool-info-label">Rewards</span>
          </div>

          <div className="pool-info-item">
            <span className="pool-info-value">{liquidity}</span>
            {erthPrice && liquidity !== "-" && (
              <span className="pool-info-usd">
                {formatUSD(parseFloat(liquidity.replace(/,/g, '')) * erthPrice)}
              </span>
            )}
            <span className="pool-info-label">Liquidity (ERTH)</span>
          </div>

          <div className="pool-info-item">
            <span className="pool-info-value">{volume}</span>
            {erthPrice && volume !== "-" && (
              <span className="pool-info-usd">
                {formatUSD(parseFloat(volume.replace(/,/g, '')) * erthPrice)}
              </span>
            )}
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