import React, { useState} from 'react';
import PoolOverview from '../components/PoolOverview';
import LiquidityManagement from '../components/LiquidityManagement';
import tokens from '../utils/tokens';

const ManageLP = ({ isKeplrConnected }) => {
    const [isManagingLiquidity, setIsManagingLiquidity] = useState(false);
    const [poolInfo, setPoolInfo] = useState(null);


    const tokenKeys = Object.keys(tokens).filter(token => token !== 'ERTH');

    const toggleManageLiquidity = (info = null) => {
        setPoolInfo(info);
        setIsManagingLiquidity(!isManagingLiquidity);
    };

    return (
        <>
            {isManagingLiquidity ? (
                <LiquidityManagement 
                    toggleManageLiquidity={toggleManageLiquidity} 
                    isKeplrConnected={isKeplrConnected}  
                    poolInfo={poolInfo} 
                />
            ) : (
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
