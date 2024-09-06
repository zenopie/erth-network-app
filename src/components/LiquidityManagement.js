import React, { useState, useEffect } from 'react';
import './LiquidityManagement.css';
import { query, provideLiquidity, querySnipBalance, snip, contract } from '../utils/contractUtils'; // Import contract function
import tokens from '../utils/tokens';
import { toMicroUnits } from '../utils/mathUtils';

const LiquidityManagement = ({ isKeplrConnected, toggleManageLiquidity }) => {
    const [activeTab, setActiveTab] = useState('Provide');
    const [erthAmount, setErthAmount] = useState('');
    const [anmlAmount, setAnmlAmount] = useState('');
    const [lpTokenAmount, setLpTokenAmount] = useState(''); // For LP token staking/withdrawing input
    const [unstakeAmount, setUnstakeAmount] = useState(''); // For unstaking LP tokens
    const [reserves, setReserves] = useState({});
    const [erthBalance, setErthBalance] = useState(null); // ERTH balance in wallet
    const [anmlBalance, setAnmlBalance] = useState(null); // ANML balance in wallet
    const [lpTokenWalletBalance, setLpTokenWalletBalance] = useState(null); // LP Token balance in wallet
    const [stakedLpTokenBalance, setStakedLpTokenBalance] = useState(null); // Staked LP Token balance
    const [loading, setLoading] = useState(false);

    // Staking/Withdrawal Contract Details
    const this_contract = "secret1j9z593quw67ht3d5a9n6h2vhlc40raqxg3aewz";
    const this_hash = "2927d7135c7ca5863e7f24687adb88acdfe544e0fb1971ecf662a37edb2393a8";

    useEffect(() => {
        const fetchBalancesAndReserves = async () => {
            if (!isKeplrConnected) {
                console.warn("Keplr is not connected.");
                return;
            }
            setLoading(true);
            try {
                // Fetch ERTH balance from wallet
                const erthBalance = await querySnipBalance(tokens['ERTH']);
                setErthBalance(erthBalance);

                // Fetch ANML balance from wallet
                const anmlBalance = await querySnipBalance(tokens['ANML']);
                console.log(anmlBalance);
                setAnmlBalance(anmlBalance);

                // Fetch LP token wallet balance
                const lpWalletBalance = await querySnipBalance(tokens['ANML'].lp);
                console.log(lpWalletBalance);
                setLpTokenWalletBalance(lpWalletBalance);

                // Fetch staked LP token balance
                //const stakedLpTokenData = await query(this_contract, this_hash, { query_staked_balance: {} });
                //setStakedLpTokenBalance(stakedLpTokenData.balance);

                // Fetch pool reserves
                const poolDetails = {
                    poolContract: tokens['ANML'].poolContract, // Pool contract for liquidity
                    poolHash: tokens['ANML'].poolHash,
                };
                const reservesData = await query(poolDetails.poolContract, poolDetails.poolHash, { query_state: {} });
                const stateInfo = reservesData.state;

                if (stateInfo) {
                    setReserves({
                        erth: parseInt(stateInfo.token_erth_reserve),
                        anml: parseInt(stateInfo.token_b_reserve),
                    });
                } else {
                    console.warn("No state information available from the pool query.");
                }
            } catch (err) {
                console.error("Error fetching data:", err);
                setErthBalance("Error");
                setAnmlBalance("Error");
                setLpTokenWalletBalance("Error");
                setStakedLpTokenBalance("Error");
            } finally {
                setLoading(false);
            }
        };

        fetchBalancesAndReserves();
    }, [isKeplrConnected]);

    // Handle ERTH amount change and dynamically calculate ANML equivalent based on reserves
    const handleErthChange = (event) => {
        const value = event.target.value;
        setErthAmount(value);

        const parsedValue = parseFloat(value);

        if (!isNaN(parsedValue) && reserves.erth > 0 && reserves.anml > 0) {
            const anmlEquivalent = (parsedValue * reserves.anml) / reserves.erth;
            setAnmlAmount(anmlEquivalent.toFixed(6));  // Adjust decimal places as needed
        } else {
            setAnmlAmount('');
        }
    };

    // Handle ANML amount change and dynamically calculate ERTH equivalent based on reserves
    const handleAnmlChange = (event) => {
        const value = event.target.value;
        setAnmlAmount(value);

        const parsedValue = parseFloat(value);

        if (!isNaN(parsedValue) && reserves.erth > 0 && reserves.anml > 0) {
            const erthEquivalent = (parsedValue * reserves.erth) / reserves.anml;
            setErthAmount(erthEquivalent.toFixed(6));  // Adjust decimal places as needed
        } else {
            setErthAmount('');
        }
    };

    // Provide Liquidity Functionality
    const handleProvideLiquidity = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }

        const tokenErthContract = tokens['ERTH'].contract;
        const tokenErthHash = tokens['ERTH'].hash;
        const tokenBContract = tokens['ANML'].contract;
        const tokenBHash = tokens['ANML'].hash;
        const poolAddress = tokens['ANML'].poolContract;
        const poolHash = tokens['ANML'].poolHash;

        try {
            setLoading(true);

            // Convert amounts to micro units using the toMicroUnits utility function
            const microErthAmount = toMicroUnits(erthAmount, tokens['ERTH']);
            const microAnmlAmount = toMicroUnits(anmlAmount, tokens['ANML']);

            await provideLiquidity(
                tokenErthContract,
                tokenErthHash,
                tokenBContract,
                tokenBHash,
                poolAddress,
                poolHash,
                microErthAmount,
                microAnmlAmount
            );
            console.log("Liquidity provided successfully!");
        } catch (error) {
            console.error("Error providing liquidity:", error);
        } finally {
            setLoading(false);
        }
    };

    // Stake LP Tokens to the Staking Contract
    const handleStakeLpTokens = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }

        const inputAmountInMicroUnits = toMicroUnits(lpTokenAmount, tokens['ANML']); // Convert amount to micro units
        const snipMsg = {
            deposit: {},
        };

        try {
            setLoading(true);

            // Execute the snip interaction, sending to the staking contract
            await snip(
                tokens['ANML'].lp.contract, // LP token contract address
                tokens['ANML'].lp.hash,     // LP token contract hash
                this_contract,                  // Staking contract address
                this_hash,                      // Staking contract hash
                snipMsg,                        // The message (deposit action)
                inputAmountInMicroUnits         // Amount to stake
            );

            console.log("Staking of LP tokens to staking contract successful!");
        } catch (error) {
            console.error("Error staking LP tokens to staking contract:", error);
        } finally {
            setLoading(false);
        }
    };

    // Unstake LP Tokens from the staking contract
    const handleUnstakeLpTokens = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }

        const unstakeAmountInMicroUnits = toMicroUnits(unstakeAmount, tokens['ANML']); // Convert amount to micro units

        const contractMsg = {
            withdraw: {
                pool: tokens['ANML'].poolContract,  // Pool contract address
                amount: unstakeAmountInMicroUnits.toString(),
            }
        };

        try {
            setLoading(true);

            // Execute the unstake contract interaction
            await contract(this_contract, this_hash, contractMsg);

            console.log("Unstaking LP tokens from staking contract successful!");
        } catch (error) {
            console.error("Error unstaking LP tokens from staking contract:", error);
        } finally {
            setLoading(false);
        }
    };

    // Withdraw LP Tokens (snip send to pool)
    const handleWithdrawLpTokens = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }

        const inputAmountInMicroUnits = toMicroUnits(lpTokenAmount, tokens['ANML']); // Convert amount to micro units
        const snipMsg = {
            unbond_liquidity: {},  // Hook message for unbonding liquidity
        };

        try {
            setLoading(true);

            // Execute the snip interaction, sending the unbond message to the pool contract
            await snip(
                tokens['ANML'].lp.contract, // LP token contract address
                tokens['ANML'].lp.hash,     // LP token contract hash
                tokens['ANML'].poolContract,    // Pool contract address for unbonding liquidity
                tokens['ANML'].poolHash,        // Pool contract hash
                snipMsg,                        // The message (unbonding action)
                inputAmountInMicroUnits         // Amount to withdraw
            );

            console.log("Unbonding liquidity from the pool successful!");
        } catch (error) {
            console.error("Error unbonding liquidity from the pool:", error);
        } finally {
            setLoading(false);
        }
    };

    const openTab = (event, tabName) => {
        setActiveTab(tabName);
    };

    return (
        <div className="liquidity-management-box">
            <h2>Manage Liquidity</h2>
            <div className="liquidity-management-close-button" onClick={toggleManageLiquidity}>X</div>

            <div className="liquidity-management-tab">
                <button
                    className={`tablinks ${activeTab === 'Provide' ? 'active' : ''}`}
                    onClick={(e) => openTab(e, 'Provide')}
                >
                    Provide
                </button>
                <button
                    className={`tablinks ${activeTab === 'Stake' ? 'active' : ''}`}
                    onClick={(e) => openTab(e, 'Stake')}
                >
                    Stake
                </button>
                <button
                    className={`tablinks ${activeTab === 'Withdraw' ? 'active' : ''}`}
                    onClick={(e) => openTab(e, 'Withdraw')}
                >
                    Withdraw
                </button>
            </div>

            {/* Provide Liquidity Section */}
            {activeTab === 'Provide' && (
                <div id="Provide" className="liquidity-management-tabcontent">
                    <div className="liquidity-management-input-group">
                        <div className="liquidity-management-label-wrapper">
                            <label htmlFor="provide-erth" className="liquidity-management-input-label">ERTH Amount</label>
                            <span className="balance-label">Balance: {erthBalance || 'Loading...'}</span> {/* Display ERTH balance */}
                        </div>
                        <div className="liquidity-management-input-wrapper">
                            <img id="provide-erth-logo" src="/images/logo.png" alt="ERTH Token" className="liquidity-management-input-logo" />
                            <input
                                type="text"
                                id="provide-erth"
                                value={erthAmount}
                                onChange={handleErthChange}  // Re-added the calculation logic here
                                placeholder="Amount to Provide"
                                className="liquidity-management-input"
                            />
                        </div>
                    </div>

                    <div className="liquidity-management-input-group">
                        <div className="liquidity-management-label-wrapper">
                            <label htmlFor="provide-anml" className="liquidity-management-input-label">ANML Amount</label>
                            <span className="balance-label">Balance: {anmlBalance || 'Loading...'}</span> {/* Display ANML balance */}
                        </div>
                        <div className="liquidity-management-input-wrapper">
                            <img id="provide-anml-logo" src="/images/anml.png" alt="ANML Token" className="liquidity-management-input-logo" />
                            <input
                                type="text"
                                id="provide-anml"
                                value={anmlAmount}
                                onChange={handleAnmlChange}  // Re-added the calculation logic here
                                placeholder="Amount to Provide"
                                className="liquidity-management-input"
                            />
                        </div>
                    </div>

                    <button onClick={handleProvideLiquidity} className="liquidity-management-button" disabled={loading}>
                        {loading ? 'Providing Liquidity...' : 'Provide Liquidity'}
                    </button>
                </div>
            )}

            {/* Stake LP Tokens Section */}
            {activeTab === 'Stake' && (
                <div id="Stake" className="liquidity-management-tabcontent">
                    <div className="liquidity-management-input-group">
                        <label htmlFor="stake-lp" className="liquidity-management-input-label">LP Token Amount</label>
                        <input
                            type="text"
                            id="stake-lp"
                            value={lpTokenAmount}
                            onChange={(e) => setLpTokenAmount(e.target.value)}
                            placeholder="Amount of LP Tokens to Stake"
                            className="liquidity-management-input"
                        />
                        <span className="balance-label">Wallet Balance: {lpTokenWalletBalance || 'Loading...'}</span> {/* Display LP token wallet balance */}
                    </div>
                    <button onClick={handleStakeLpTokens} className="liquidity-management-button" disabled={loading}>
                        {loading ? 'Staking...' : 'Stake LP Tokens'}
                    </button>

                    {/* Unstake LP Tokens Section */}
                    <div className="liquidity-management-input-group">
                        <label htmlFor="unstake-lp" className="liquidity-management-input-label">Unstake LP Token Amount</label>
                        <input
                            type="text"
                            id="unstake-lp"
                            value={unstakeAmount}
                            onChange={(e) => setUnstakeAmount(e.target.value)}
                            placeholder="Amount of LP Tokens to Unstake"
                            className="liquidity-management-input"
                        />
                        <span className="balance-label">Staked Balance: {stakedLpTokenBalance || 'Loading...'}</span> {/* Display staked LP token balance */}
                    </div>
                    <button onClick={handleUnstakeLpTokens} className="liquidity-management-button" disabled={loading}>
                        {loading ? 'Unstaking...' : 'Unstake LP Tokens'}
                    </button>
                </div>
            )}

            {/* Withdraw LP Tokens Section */}
            {activeTab === 'Withdraw' && (
                <div id="Withdraw" className="liquidity-management-tabcontent">
                    <div className="liquidity-management-input-group">
                        <label htmlFor="withdraw-lp" className="liquidity-management-input-label">LP Token Amount</label>
                        <input
                            type="text"
                            id="withdraw-lp"
                            value={lpTokenAmount}
                            onChange={(e) => setLpTokenAmount(e.target.value)}
                            placeholder="Amount of LP Tokens to Withdraw"
                            className="liquidity-management-input"
                        />
                    </div>
                    <button onClick={handleWithdrawLpTokens} className="liquidity-management-button" disabled={loading}>
                        {loading ? 'Withdrawing...' : 'Withdraw LP Tokens'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default LiquidityManagement;
