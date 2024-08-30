import React, { useState } from 'react';
import PoolOverview from '../components/PoolOverview';
import LiquidityManagement from '../components/LiquidityManagement';
import { showLoadingScreen } from '../utils/uiUtils';

const ManageLP = ({ isKeplrConnected }) => {
    const [isManagingLiquidity, setIsManagingLiquidity] = useState(false);
    showLoadingScreen(false);

    const toggleManageLiquidity = () => {
        setIsManagingLiquidity(!isManagingLiquidity);
    };

    return (
        <>
            {isManagingLiquidity ? (
                <LiquidityManagement toggleManageLiquidity={toggleManageLiquidity} />
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
