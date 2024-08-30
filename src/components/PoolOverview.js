import React, { useState, useEffect, useRef } from 'react';
import "./PoolOverview.css";
import { query, contract } from '../utils/contractUtils';
import { toMacroUnits } from '../utils/mathUtils.js';
import tokens from '../utils/tokens.js';

const this_contract = "secret1w9v0whdrwj6awj7u7zas87jz5nglawwgdg2309";
const this_hash = "4b34d200564ee1c04ebf4c8cdb12ed145a489d5a5e1a39dfdb734b963ac96414";

const PoolOverview = ({ toggleManageLiquidity, isKeplrConnected }) => {
    const [pendingRewards, setPendingRewards] = useState('-');
    const [claimResult, setClaimResult] = useState('');
    const [showButtons, setShowButtons] = useState(false);

    useEffect(() => {
        if (isKeplrConnected) {
            fetchPendingRewards();
        }
    }, [isKeplrConnected]);

    const fetchPendingRewards = async () => {
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

            const pendingRewardsDue = toMacroUnits(resp.pending_rewards, tokens["ERTH"]);

            setPendingRewards(`${pendingRewardsDue} ERTH`);
        } catch (error) {
            console.error("Error querying pending rewards:", error);
            setPendingRewards('Error');
        }
    };

    const handleClaimRewards = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected yet.");
            return;
        }

        try {
            let msg = {
                claim: {
                    pool: "secret1dduup4qyg8qpt94gaf93e8nctzfnzy43gj7ky3",
                },
            };

            let resp = await contract(this_contract, this_hash, msg);

            console.log("Claim Rewards Response:", resp);
            setClaimResult("Rewards claimed successfully!");
            fetchPendingRewards(); // Refresh pending rewards after claiming
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
