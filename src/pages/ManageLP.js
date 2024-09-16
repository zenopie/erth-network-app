import React, { useState } from 'react';
import PoolOverview from '../components/PoolOverview';
import LiquidityManagement from '../components/LiquidityManagement';
import { showLoadingScreen } from '../utils/uiUtils';
import tokens from '../utils/tokens';

const ManageLP = ({ isKeplrConnected }) => {
    const [isManagingLiquidity, setIsManagingLiquidity] = useState(false);
    const [poolInfo, setPoolInfo] = useState(null); // State to store user info

    showLoadingScreen(false);

    // Toggle Manage Liquidity and accept user info
    const toggleManageLiquidity = (info = null) => {
        setPoolInfo(info); // Store user info when passed from PoolOverview
        setIsManagingLiquidity(!isManagingLiquidity); // Toggle between views
    };

    // Get list of tokens excluding ERTH
    const tokenKeys = Object.keys(tokens).filter(token => token !== 'ERTH');

    return (
        <>
            {isManagingLiquidity ? (
                <LiquidityManagement 
                    toggleManageLiquidity={toggleManageLiquidity} 
                    isKeplrConnected={isKeplrConnected}  
                    poolInfo={poolInfo} // Pass the userInfo to LiquidityManagement
                />
            ) : (
                // Map over tokenKeys to create PoolOverview components
                tokenKeys.map(tokenKey => (
                    <PoolOverview 
                        key={tokenKey}
                        tokenKey={tokenKey}
                        toggleManageLiquidity={toggleManageLiquidity} 
                        isKeplrConnected={isKeplrConnected} 
                    />
                ))
            )}
        </>
    );
};

export default ManageLP;
