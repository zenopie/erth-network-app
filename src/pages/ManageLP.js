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

  const tokenKeys = useMemo(() => Object.keys(tokens).filter((t) => t !== "ERTH"), []);

  useEffect(() => {
    if (!isKeplrConnected) return;
    showLoadingScreen(true);
    const pools = tokenKeys.map((key) => tokens[key].contract);
    const msg = { query_user_info: { pools, user: window.secretjs.address } };

    query(contracts.exchange.contract, contracts.exchange.hash, msg)
      .then((resArray) => {
        const data = {};
        tokenKeys.forEach((key, i) => {
          data[key] = { ...resArray[i], tokenKey: key };
        });
        setAllPoolsData(data);
      })
      .catch((err) => console.error("Error querying pools:", err))
      .finally(() => showLoadingScreen(false));
  }, [isKeplrConnected, refreshKey, tokenKeys]);

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

          {tokenKeys.map((key) => (
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