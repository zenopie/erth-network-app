import React, { useState, useEffect } from 'react';
import "./ManageLP.css";
import PoolOverview from '../components/PoolOverview';
import LiquidityManagement from '../components/LiquidityManagement';
import tokens from '../utils/tokens';
import { query, contract } from '../utils/contractUtils';
import contracts from '../utils/contracts';
import StatusModal from '../components/StatusModal';
import { showLoadingScreen } from '../utils/uiUtils';

const ManageLP = ({ isKeplrConnected }) => {
  const [isManagingLiquidity, setIsManagingLiquidity] = useState(false);
  const [poolInfo, setPoolInfo] = useState(null);
  const [allPoolsData, setAllPoolsData] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState('loading');

  const tokenKeys = React.useMemo(
    () => Object.keys(tokens).filter(t => t !== 'ERTH'),
    []
  );
  
  const toggleManageLiquidity = (info = null) => {
    setPoolInfo(info);
    setIsManagingLiquidity(prev => !prev);
  };

  // Multi-pool query
  useEffect(() => {
    if (!isKeplrConnected) return;
    const tokenContracts = tokenKeys.map(key => tokens[key].contract);
    const queryMsg = { query_user_info: { pools: tokenContracts, user: window.secretjs.address } };
    query(contracts.exchange.contract, contracts.exchange.hash, queryMsg)
      .then(res => {
        const data = {};
        tokenKeys.forEach((key, i) => (data[key] = res[i]));
        setAllPoolsData(data);
      })
      .catch(err => console.error("Error querying pools:", err));
    showLoadingScreen(false);
  }, [isKeplrConnected, refreshKey, tokenKeys]);

  const totalRewards = Object.values(allPoolsData).reduce(
    (sum, d) => sum + (Number(d?.user_info?.pending_rewards) || 0),
    0
  );

  const handleClaimAll = async () => {
    if (!isKeplrConnected) return console.warn("Keplr not connected.");
    const poolContracts = tokenKeys
      .filter(key => (Number(allPoolsData[key]?.user_info?.pending_rewards) || 0) > 0)
      .map(key => tokens[key].poolContract);
    if (!poolContracts.length) return console.log("No rewards to claim.");
    setIsModalOpen(true);
    setAnimationState('loading');
    try {
      const msg = { claim: { pools: poolContracts } };
      await contract(contracts.lpStaking.contract, contracts.lpStaking.hash, msg);
      setAnimationState('success');
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error("Claim error:", error);
      setAnimationState('error');
    }
  };

  return (
    <>
      {isModalOpen && (
        <StatusModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          animationState={animationState}
        />
      )}
      {isManagingLiquidity ? (
        <LiquidityManagement
          toggleManageLiquidity={toggleManageLiquidity}
          isKeplrConnected={isKeplrConnected}
          poolInfo={poolInfo}
        />
      ) : (
        <>
          {totalRewards > 0 && (
            <div className="claim-all-container">
              <span className="total-rewards-text">
                Total Rewards: {totalRewards.toLocaleString()} ERTH
              </span>
              <button
                onClick={handleClaimAll}
                disabled={!isKeplrConnected}
                className="claim-all-button"
              >
                Claim All
              </button>
            </div>
          )}
          {tokenKeys.map(key => (
            <PoolOverview
              key={key}
              tokenKey={key}
              poolData={allPoolsData[key]}
              toggleManageLiquidity={toggleManageLiquidity}
              isKeplrConnected={isKeplrConnected}
            />
          ))}
        </>
      )}
    </>
  );
};

export default ManageLP;
