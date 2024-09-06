import React, { useState, useEffect, useCallback } from 'react';
import "./PoolOverview.css";
import { query, contract } from '../utils/contractUtils';
import { toMacroUnits } from '../utils/mathUtils.js';
import tokens from '../utils/tokens.js';


const this_contract =  "secret1j9z593quw67ht3d5a9n6h2vhlc40raqxg3aewz";
const this_hash =  "2927d7135c7ca5863e7f24687adb88acdfe544e0fb1971ecf662a37edb2393a8";

const PoolOverview = ({ toggleManageLiquidity, isKeplrConnected }) => {
    const [pendingRewards, setPendingRewards] = useState('-');
    const [claimResult, setClaimResult] = useState('');
    const [showButtons, setShowButtons] = useState(false);

    const fetchPendingRewards = useCallback(async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }

        try {
            console.log("Fetching pending LP rewards...");

            const querymsg = {
                query_user_rewards: { 
                    pool: "secret1dduup4qyg8qpt94gaf93e8nctzfnzy43gj7ky3", 
                    user: window.secretjs.address 
                }
            };

            const resp = await query(this_contract, this_hash, querymsg);

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

    const handleClaimRewards = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }

        try {
            const msg = {
                claim: {
                    pool: "secret1dduup4qyg8qpt94gaf93e8nctzfnzy43gj7ky3",
                },
            };

            await contract(this_contract, this_hash, msg);

            setClaimResult("Rewards claimed successfully!");

            // Re-fetch pending rewards after claiming
            fetchPendingRewards();
        } catch (error) {
            console.error("Error claiming rewards:", error);
            setClaimResult("Error claiming rewards. Check the console for details.");
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
                <button onClick={toggleManageLiquidity} className="swap-button">Manage Liquidity</button>
                <button onClick={handleClaimRewards} className="swap-button">Claim Rewards</button>
                <div id="claim-result" className="claim-result">{claimResult}</div>
            </div>
        </div>
    );
};

export default PoolOverview;
