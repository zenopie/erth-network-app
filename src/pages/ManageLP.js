import React, { useState, useEffect, useMemo } from "react";
import "./ManageLP.css";
import PoolOverview from "../components/PoolOverview";
import LiquidityManagement from "../components/LiquidityManagement";
import tokens from "../utils/tokens";
import { query, contract } from "../utils/contractUtils";
import contracts from "../utils/contracts";
import StatusModal from "../components/StatusModal";
import { showLoadingScreen } from "../utils/uiUtils";
import { toMacroUnits } from "../utils/mathUtils.js";
import { fetchErthPrice, formatUSD } from "../utils/apiUtils";

const ManageLP = ({ isKeplrConnected }) => {
  const [isManagingLiquidity, setIsManagingLiquidity] = useState(false);
  const [poolInfo, setPoolInfo] = useState(null);
  const [allPoolsData, setAllPoolsData] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [activePoolKey, setActivePoolKey] = useState(null);
  const [sortBy, setSortBy] = useState("liquidity");
  const [sortOrder, setSortOrder] = useState("desc");
  const [erthPrice, setErthPrice] = useState(null);
  const [countdown, setCountdown] = useState("");

  // Countdown to next distribution (11pm UTC daily)
  useEffect(() => {
    const getTimeUntilDistribution = () => {
      const now = new Date();
      const target = new Date(now);
      target.setUTCHours(23, 0, 0, 0); // 11pm UTC

      // If we've passed 11pm UTC today, target tomorrow
      if (now >= target) {
        target.setUTCDate(target.getUTCDate() + 1);
      }

      const diff = target - now;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    setCountdown(getTimeUntilDistribution());
    const interval = setInterval(() => {
      setCountdown(getTimeUntilDistribution());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const tokenKeys = useMemo(() => Object.keys(tokens).filter((t) => t !== "ERTH"), []);

  // Fetch ERTH price
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
    const interval = setInterval(updateErthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isKeplrConnected) return;

    // Check if registry data is loaded
    const exchangeContract = contracts.exchange.contract;
    const pools = tokenKeys.map((key) => tokens[key].contract).filter(Boolean);

    if (pools.length === 0 || !exchangeContract) {
      console.log("Waiting for registry data to load...");
      return;
    }

    showLoadingScreen(true);
    const msg = { query_user_info: { pools, user: window.secretjs.address } };

    query(exchangeContract, contracts.exchange.hash, msg)
      .then((resArray) => {
        const data = {};
        tokenKeys.forEach((key, i) => {
          data[key] = { ...resArray[i], tokenKey: key };
        });
        setAllPoolsData(data);
      })
      .catch((err) => console.error("Error querying pools:", err))
      .finally(() => showLoadingScreen(false));
  }, [isKeplrConnected, refreshKey, tokenKeys, contracts.exchange.contract]);

  const refreshParent = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const toggleManageLiquidity = (poolData = null) => {
    setPoolInfo(poolData);
    setIsManagingLiquidity((prev) => !prev);
  };

  const totalRewards = Object.values(allPoolsData).reduce(
    (sum, d) => sum + toMacroUnits(d?.user_info?.pending_rewards || 0, tokens.ERTH),
    0
  );

  // Calculate total TVL and volume across all pools
  const { totalTVL, totalVolume } = useMemo(() => {
    let tvl = 0;
    let volume = 0;
    Object.values(allPoolsData).forEach((data) => {
      if (data?.pool_info?.state) {
        const erthReserve = toMacroUnits(Number(data.pool_info.state.erth_reserve || 0), tokens.ERTH);
        tvl += erthReserve * 2;
        if (Array.isArray(data.pool_info.state.daily_volumes)) {
          volume += toMacroUnits(
            data.pool_info.state.daily_volumes.slice(0, 7).reduce((a, v) => a + Number(v), 0),
            tokens.ERTH
          );
        }
      }
    });
    return { totalTVL: tvl, totalVolume: volume };
  }, [allPoolsData]);

  // Helper to get sortable values from pool data
  const getPoolValue = (key, field) => {
    const data = allPoolsData[key];
    if (!data?.pool_info?.state) return 0;

    const state = data.pool_info.state;
    switch (field) {
      case "rewards":
        return toMacroUnits(data?.user_info?.pending_rewards || 0, tokens.ERTH);
      case "liquidity":
        return toMacroUnits(Number(state.erth_reserve || 0), tokens.ERTH) * 2;
      case "volume":
        return Array.isArray(state.daily_volumes)
          ? toMacroUnits(state.daily_volumes.slice(0, 7).reduce((a, v) => a + Number(v), 0), tokens.ERTH)
          : 0;
      case "apr": {
        const dailyRewards = state.daily_rewards || [];
        const lastWeekMacro = toMacroUnits(dailyRewards.slice(0, 7).reduce((a, v) => a + Number(v), 0), tokens.ERTH);
        const liquidity = toMacroUnits(Number(state.erth_reserve || 0), tokens.ERTH) * 2;
        return liquidity > 0 ? (lastWeekMacro / liquidity) * 52 * 100 : 0;
      }
      default:
        return 0;
    }
  };

  // Sort token keys based on current sort settings
  const sortedTokenKeys = useMemo(() => {
    return [...tokenKeys].sort((a, b) => {
      if (sortBy === "symbol") {
        // Alphabetical sorting for symbol
        return sortOrder === "desc" ? b.localeCompare(a) : a.localeCompare(b);
      }
      const aVal = getPoolValue(a, sortBy);
      const bVal = getPoolValue(b, sortBy);
      return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [tokenKeys, allPoolsData, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(field);
      // Symbol sorts A-Z by default, others sort high-to-low
      setSortOrder(field === "symbol" ? "asc" : "desc");
    }
  };

  const handleClaimAll = async () => {
    if (!isKeplrConnected) return console.warn("Keplr not connected.");
    const poolsWithRewards = tokenKeys.filter((key) => Number(allPoolsData[key]?.user_info?.pending_rewards) > 0);
    if (!poolsWithRewards.length) return console.log("No rewards to claim.");

    setIsModalOpen(true);
    setAnimationState("loading");
    setActivePoolKey(null);
    try {
      const msg = {
        claim_rewards: { pools: poolsWithRewards.map((k) => tokens[k].contract) },
      };
      await contract(contracts.exchange.contract, contracts.exchange.hash, msg);
      setAnimationState("success");
      refreshParent();
    } catch (error) {
      console.error("Claim error:", error);
      setAnimationState("error");
    }
  };

  const handleClaimStart = (poolKey) => {
    setIsModalOpen(true);
    setAnimationState("loading");
    setActivePoolKey(poolKey);
  };

  const handleClaimSuccess = () => {
    setAnimationState("success");
  };

  const handleClaimError = () => {
    setAnimationState("error");
  };

  const handleClaimComplete = (poolKey, updatedPoolData) => {
    setAllPoolsData((prev) => ({
      ...prev,
      [poolKey]: { ...updatedPoolData, tokenKey: poolKey },
    }));
  };

  return (
    <div className="lp-page-container">
      <StatusModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setActivePoolKey(null);
        }}
        animationState={animationState}
      />

      {isManagingLiquidity ? (
        <LiquidityManagement
          toggleManageLiquidity={toggleManageLiquidity}
          isKeplrConnected={isKeplrConnected}
          poolData={poolInfo}
          refreshParent={refreshParent}
        />
      ) : (
        <>
          {/* LP Overview Header Card */}
          <div className="lp-overview-card">
            <div className="lp-overview-header">
              <img src="/images/coin/ERTH.png" alt="ERTH" className="lp-overview-logo" />
              <div className="lp-overview-info">
                <span className="lp-overview-label">Liquidity Pools</span>
                <span className="lp-overview-count">{tokenKeys.length} Active Pools</span>
              </div>
            </div>
            <div className="lp-info-box">
              <p>ERTH serves as the central routing token for all swaps. Every trade passes through an ERTH pair, and the 0.5% swap fee permanently burns ERTH, creating deflationary pressure on the token supply.</p>
            </div>
            <div className="lp-overview-content">
              <div className="lp-stats-grid">
                <div className="lp-stat-card">
                  <span className="lp-stat-label">Total TVL</span>
                  <span className="lp-stat-value">¤{Math.floor(totalTVL).toLocaleString()}</span>
                  {erthPrice && <span className="lp-stat-usd">{formatUSD(totalTVL * erthPrice)}</span>}
                </div>
                <div className="lp-stat-card">
                  <span className="lp-stat-label">Volume (7d)</span>
                  <span className="lp-stat-value">¤{Math.floor(totalVolume).toLocaleString()}</span>
                  {erthPrice && <span className="lp-stat-usd">{formatUSD(totalVolume * erthPrice)}</span>}
                </div>
              </div>
              <div className="lp-rewards-section">
                <div className="lp-rewards-info">
                  <span className="lp-rewards-title">Unclaimed Rewards</span>
                  <span className={`lp-rewards-amount ${totalRewards <= 0 ? "muted" : ""}`}>
                    {totalRewards.toLocaleString()} ERTH
                  </span>
                  {totalRewards > 0 && erthPrice && (
                    <span className="lp-rewards-usd">{formatUSD(totalRewards * erthPrice)}</span>
                  )}
                </div>
                {totalRewards > 0 ? (
                  <button
                    onClick={handleClaimAll}
                    disabled={!isKeplrConnected}
                    className="lp-claim-all-button"
                  >
                    Claim All
                  </button>
                ) : (
                  <div className="lp-countdown">
                    <span className="lp-countdown-label">Next distribution in</span>
                    <span className="lp-countdown-time">{countdown}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Header row with sortable columns */}
          <div className="pool-header-row">
            <button
              className={`pool-header-pair ${sortBy === "symbol" ? "active" : ""}`}
              onClick={() => handleSort("symbol")}
            >
              Pool {sortBy === "symbol" && (sortOrder === "desc" ? "↓" : "↑")}
            </button>
            <div className="pool-header-columns">
              <button
                className={`pool-header-col ${sortBy === "rewards" ? "active" : ""}`}
                onClick={() => handleSort("rewards")}
              >
                Rewards {sortBy === "rewards" && (sortOrder === "desc" ? "↓" : "↑")}
              </button>
              <button
                className={`pool-header-col ${sortBy === "liquidity" ? "active" : ""}`}
                onClick={() => handleSort("liquidity")}
              >
                Liquidity {sortBy === "liquidity" && (sortOrder === "desc" ? "↓" : "↑")}
              </button>
              <button
                className={`pool-header-col ${sortBy === "volume" ? "active" : ""}`}
                onClick={() => handleSort("volume")}
              >
                Volume {sortBy === "volume" && (sortOrder === "desc" ? "↓" : "↑")}
              </button>
              <button
                className={`pool-header-col ${sortBy === "apr" ? "active" : ""}`}
                onClick={() => handleSort("apr")}
              >
                APR {sortBy === "apr" && (sortOrder === "desc" ? "↓" : "↑")}
              </button>
            </div>
            <div className="pool-header-actions"></div>
          </div>

          {sortedTokenKeys.map((key) => (
            <PoolOverview
              key={key}
              tokenKey={key}
              poolData={allPoolsData[key]}
              toggleManageLiquidity={toggleManageLiquidity}
              isKeplrConnected={isKeplrConnected}
              onClaimStart={() => handleClaimStart(key)}
              onClaimSuccess={handleClaimSuccess}
              onClaimError={handleClaimError}
              onClaimComplete={handleClaimComplete}
              erthPrice={erthPrice}
            />
          ))}
        </>
      )}
    </div>
  );
};

export default ManageLP;