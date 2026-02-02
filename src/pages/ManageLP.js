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

  const tokenKeys = useMemo(() => Object.keys(tokens).filter((t) => t !== "ERTH"), []);

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
    <>
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
          {totalRewards > 0 && (
            <div className="claim-all-container">
              <span className="lp-total-rewards-text">Total Rewards: {totalRewards.toLocaleString()} ERTH</span>
              <button onClick={handleClaimAll} disabled={!isKeplrConnected} className="lp-claim-all-button">
                Claim All
              </button>
            </div>
          )}

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
              onClaimComplete={handleClaimComplete} // New callback
            />
          ))}
        </>
      )}
    </>
  );
};

export default ManageLP;