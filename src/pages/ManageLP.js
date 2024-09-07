import React, { useState } from 'react';
import PoolOverview from '../components/PoolOverview';
import LiquidityManagement from '../components/LiquidityManagement';
import { showLoadingScreen } from '../utils/uiUtils';

const ManageLP = ({ isKeplrConnected }) => {
    const [isManagingLiquidity, setIsManagingLiquidity] = useState(false);
    const [poolInfo, setPoolInfo] = useState(null); // State to store user info

    showLoadingScreen(false);

    // Toggle Manage Liquidity and accept user info
    const toggleManageLiquidity = (info = null) => {
        setPoolInfo(info); // Store user info when passed from PoolOverview
        setIsManagingLiquidity(!isManagingLiquidity); // Toggle between views
    };

    return (
        <>
            {isManagingLiquidity ? (
                <LiquidityManagement 
                    toggleManageLiquidity={toggleManageLiquidity} 
                    isKeplrConnected={isKeplrConnected}  
                    poolInfo={poolInfo} // Pass the userInfo to LiquidityManagement
                />
            ) : (
                <PoolOverview 
                    toggleManageLiquidity={toggleManageLiquidity} 
                    isKeplrConnected={isKeplrConnected} 
                />
            )}
        </>
    );
};

export default ManageLP;
