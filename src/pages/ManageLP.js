import React, { useState, useCallback } from 'react';
import "./ManageLP.css";
import PoolOverview from '../components/PoolOverview';
import LiquidityManagement from '../components/LiquidityManagement';
import tokens from '../utils/tokens';
import { contract } from '../utils/contractUtils';
import contracts from '../utils/contracts';

const ManageLP = ({ isKeplrConnected }) => {
    const [isManagingLiquidity, setIsManagingLiquidity] = useState(false);
    const [poolInfo, setPoolInfo] = useState(null);
    const [poolsWithRewards, setPoolsWithRewards] = useState({});
    const [refreshKey, setRefreshKey] = useState(0);

    const tokenKeys = Object.keys(tokens).filter(token => token !== 'ERTH');

    const toggleManageLiquidity = (info = null) => {
        setPoolInfo(info);
        setIsManagingLiquidity(!isManagingLiquidity);
    };

    const handlePoolInfoUpdate = useCallback((poolContract, pendingRewards) => {
        setPoolsWithRewards(prev => {
            const updated = { ...prev };
            if (pendingRewards > 0) {
                updated[poolContract] = pendingRewards;
            } else {
                delete updated[poolContract];
            }
            return updated;
        });
    }, []);

    const handleClaimAll = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr ain’t connected, fam.");
            return;
        }

        const poolContracts = Object.keys(poolsWithRewards);
        if (poolContracts.length === 0) {
            console.log("No pools with rewards, nothing to claim.");
            return;
        }

        try {
            const msg = {
                claim: {
                    pools: poolContracts,
                },
            };

            await contract(contracts.lpStaking.contract, contracts.lpStaking.hash, msg);
            console.log("All rewards claimed successfully!");
            setRefreshKey(prev => prev + 1);
        } catch (error) {
            console.error("Error claiming all rewards:", error);
        }
    };

    const totalRewards = Object.values(poolsWithRewards).reduce((sum, val) => sum + val, 0);

    return (
        <>
            {isManagingLiquidity ? (
                <LiquidityManagement
                    toggleManageLiquidity={toggleManageLiquidity}
                    isKeplrConnected={isKeplrConnected}
                    poolInfo={poolInfo}
                />
            ) : (
                <>
                    {Object.keys(poolsWithRewards).length > 0 && (
                        <div className="claim-all-container">
                            <span className="total-rewards-text">Total Rewards: {totalRewards.toLocaleString()} ERTH</span>
                            <button
                                onClick={handleClaimAll}
                                disabled={!isKeplrConnected}
                                className="claim-all-button"
                            >
                                Claim All
                            </button>
                        </div>
                    )}
                    {tokenKeys.map(tokenKey => (
                        <PoolOverview
                            key={tokenKey}
                            tokenKey={tokenKey}
                            toggleManageLiquidity={toggleManageLiquidity}
                            isKeplrConnected={isKeplrConnected}
                            onPoolInfoUpdate={handlePoolInfoUpdate}
                            refreshKey={refreshKey}
                        />
                    ))}
                </>
            )}
        </>
    );
};

export default ManageLP;
