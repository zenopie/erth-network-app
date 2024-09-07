import React, { useState, useEffect, useCallback } from 'react';
import "./PoolOverview.css";
import { query, contract } from '../utils/contractUtils';
import { toMacroUnits } from '../utils/mathUtils.js';
import tokens from '../utils/tokens.js';
import StatusModal from "./StatusModal.js";

const this_contract =  "secret10squ8j00kz057k7qdq53q52ldrvuf2ux27sg0a";
const this_hash =  "00ee06ee70f98f26ba91a43b10a6e5da35579b4d5ba10b88c0f71d4fa3372709";

const PoolOverview = ({ toggleManageLiquidity, isKeplrConnected }) => {
    const [pendingRewards, setPendingRewards] = useState('-');
    const [poolInfo, setPoolInfo] = useState(null); // Store poolInfo here
    const [showButtons, setShowButtons] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [animationState, setAnimationState] = useState('loading'); // 'loading', 'success', 'error'

    const fetchPendingRewards = useCallback(async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }

        try {

            const querymsg = {
                query_user_rewards: {
                    pool: "secret1dduup4qyg8qpt94gaf93e8nctzfnzy43gj7ky3",
                    user: window.secretjs.address,
                },
            };

            const resp = await query(this_contract, this_hash, querymsg);
            setPoolInfo(resp);

            if (resp && resp.pending_rewards) {
                const pendingRewardsDue = toMacroUnits(resp.pending_rewards, tokens["ERTH"]);
                setPendingRewards(`${pendingRewardsDue} ERTH`);
            } else {
                console.error("Invalid response structure:", resp);
                setPendingRewards('Error');
            }
        } catch (error) {
            console.error("Error querying pending rewards:", error);
            setPendingRewards('N/A');
        }
    }, [isKeplrConnected]);

    useEffect(() => {
        if (isKeplrConnected) {
            fetchPendingRewards();
        }
    }, [isKeplrConnected, fetchPendingRewards]);

    const handleManageLiquidityClick = (event) => {
        event.stopPropagation(); // Prevents the box click from firing
        if (poolInfo) {
            toggleManageLiquidity(poolInfo); // Pass poolInfo to Liquidity Management
        } else {
            console.warn("Pool info is not yet available.");
        }
    };
    
    const handleClaimRewards = async (event) => {
        event.stopPropagation(); // Prevents the box click from firing
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }
    
        // Open the modal with the loading animation state
        setIsModalOpen(true);
        setAnimationState('loading'); // Set the modal to show the loading state
    
        try {
            const msg = {
                claim: {
                    pool: "secret1dduup4qyg8qpt94gaf93e8nctzfnzy43gj7ky3",
                },
            };
    
            await contract(this_contract, this_hash, msg);
    
            // Set the modal to show the success state after the claim is successful
            setAnimationState('success');
    
            // Re-fetch pending rewards after claiming
            fetchPendingRewards(); 
        } catch (error) {
            console.error("Error claiming rewards:", error);
    
            // Set the modal to show the error state if there's an error
            setAnimationState('error');
        }
    };
    

    const handleBoxClick = () => {
        setShowButtons(!showButtons);
    };

    return (
        <div className="pool-overview-box" onClick={handleBoxClick}>
            <h2>ANML/ERTH</h2>
            <div className="info-row">
                <span className="info-label">Rewards:</span>
                <span className="info-value" id="pending-rewards">{pendingRewards}</span>
            </div>

            <div className={`buttons-container ${showButtons ? 'show' : ''}`}>
                <button onClick={handleManageLiquidityClick} className="swap-button">Manage Liquidity</button>
                <button onClick={handleClaimRewards} className="swap-button">Claim Rewards</button>
                {/* Modal for displaying swap status */}
                <StatusModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    animationState={animationState}
                />
            </div>
        </div>
    );
};

export default PoolOverview;
