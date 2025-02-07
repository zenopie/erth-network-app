import React, { useState, useEffect, useCallback } from 'react';
import './LiquidityManagement.css';
import { query, provideLiquidity, querySnipBalance, snip, contract, requestViewingKey } from '../utils/contractUtils';
import tokens from '../utils/tokens';
import contracts from '../utils/contracts.js';
import { toMicroUnits, toMacroUnits } from '../utils/mathUtils';
import StatusModal from '../components/StatusModal'; 

const LiquidityManagement = ({ isKeplrConnected, toggleManageLiquidity, poolInfo }) => {
    const [activeTab, setActiveTab] = useState('Provide');
    const [erthAmount, setErthAmount] = useState('');
    const [tokenBAmount, setTokenBAmount] = useState('');
    const [lpTokenAmount, setLpTokenAmount] = useState('');
    const [unstakeAmount, setUnstakeAmount] = useState('');
    const [reserves, setReserves] = useState({});
    const [erthBalance, setErthBalance] = useState(null);
    const [tokenBBalance, setTokenBBalance] = useState(null);
    const [lpTokenWalletBalance, setLpTokenWalletBalance] = useState(null);
    const [stakedLpTokenBalance, setStakedLpTokenBalance] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [animationState, setAnimationState] = useState('loading'); // 'loading', 'success', 'error'

    // Tokens
    const tokenErthKey = 'ERTH'; // Always ERTH
    const tokenBKey = poolInfo.tokenKey; // The other token in the pool
    const tokenErth = tokens[tokenErthKey];
    const tokenB = tokens[tokenBKey];

    const stakingContract = contracts.lpStaking.contract;
    const stakingHash = contracts.lpStaking.hash;

    const fetchBalancesAndReserves = useCallback(async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }
        if (poolInfo) {
            let amountStaked = toMacroUnits(poolInfo.user_info.amount_staked, tokenB.lp);
            setStakedLpTokenBalance(amountStaked);
        }
        try {
            // Fetch balances
            const erthBalance = await querySnipBalance(tokenErth);
            setErthBalance(erthBalance);

            const tokenBBalance = await querySnipBalance(tokenB);
            setTokenBBalance(tokenBBalance);

            // Fetch LP token wallet balance
            const lpWalletBalance = await querySnipBalance(tokenB.lp);
            setLpTokenWalletBalance(lpWalletBalance);

            // Fetch pool reserves
            const poolDetails = {
                poolContract: tokenB.poolContract,
                poolHash: tokenB.poolHash,
            };
            const resp = await query(poolDetails.poolContract, poolDetails.poolHash, { query_state: {} });
            const stateInfo = resp.state;

            if (stateInfo) {
                setReserves({
                    erthReserve: parseInt(stateInfo.token_erth_reserve),
                    tokenBReserve: parseInt(stateInfo.token_b_reserve),
                });
            } else {
                console.warn("No state information available from the pool query.");
            }
        } catch (err) {
            console.error("Error fetching data:", err);
            setErthBalance("Error");
            setTokenBBalance("Error");
            setLpTokenWalletBalance("Error");
            setStakedLpTokenBalance("Error");
        }
    }, [isKeplrConnected, poolInfo, tokenErth, tokenB]);

    useEffect(() => {
        fetchBalancesAndReserves();
    }, [fetchBalancesAndReserves]);

    const handleRequestViewingKey = async (token) => {
        await requestViewingKey(token);
        fetchBalancesAndReserves(); // Refresh data after viewing key is set
    };

    // Handle ERTH amount change and dynamically calculate tokenB equivalent based on reserves
    const handleErthChange = (event) => {
        const value = event.target.value;
        setErthAmount(value);

        const parsedValue = parseFloat(value);

        if (!isNaN(parsedValue) && reserves.erthReserve > 0 && reserves.tokenBReserve > 0) {
            const tokenBEquivalent = (parsedValue * reserves.tokenBReserve) / reserves.erthReserve;
            setTokenBAmount(tokenBEquivalent.toFixed(6));
        } else {
            setTokenBAmount('');
        }
    };

    // Handle tokenB amount change and dynamically calculate ERTH equivalent based on reserves
    const handleTokenBChange = (event) => {
        const value = event.target.value;
        setTokenBAmount(value);

        const parsedValue = parseFloat(value);

        if (!isNaN(parsedValue) && reserves.erthReserve > 0 && reserves.tokenBReserve > 0) {
            const erthEquivalent = (parsedValue * reserves.erthReserve) / reserves.tokenBReserve;
            setErthAmount(erthEquivalent.toFixed(6));
        } else {
            setErthAmount('');
        }
    };

    // Max buttons handlers
    const handleMaxErthAmount = () => {
        if (erthBalance && !isNaN(erthBalance)) {
            setErthAmount(erthBalance);
            handleErthChange({ target: { value: erthBalance } });
        }
    };

    const handleMaxTokenBAmount = () => {
        if (tokenBBalance && !isNaN(tokenBBalance)) {
            setTokenBAmount(tokenBBalance);
            handleTokenBChange({ target: { value: tokenBBalance } });
        }
    };

    const handleMaxLpTokenWalletBalance = () => {
        if (lpTokenWalletBalance && !isNaN(lpTokenWalletBalance)) {
            setLpTokenAmount(lpTokenWalletBalance);
        }
    };

    const handleMaxStakedLpTokenBalance = () => {
        if (stakedLpTokenBalance && !isNaN(stakedLpTokenBalance)) {
            setUnstakeAmount(stakedLpTokenBalance);
        }
    };

    // Provide Liquidity Functionality
    const handleProvideLiquidity = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }

        const tokenErthContract = tokenErth.contract;
        const tokenErthHash = tokenErth.hash;
        const tokenBContract = tokenB.contract;
        const tokenBHash = tokenB.hash;
        const poolAddress = tokenB.poolContract; // Pool contract is associated with tokenB
        const poolHash = tokenB.poolHash;

        try {
            setIsModalOpen(true);
            setAnimationState('loading');

            // Convert amounts to micro units
            const microErthAmount = toMicroUnits(erthAmount, tokenErth);
            const microTokenBAmount = toMicroUnits(tokenBAmount, tokenB);

            await provideLiquidity(
                tokenErthContract,
                tokenErthHash,
                tokenBContract,
                tokenBHash,
                poolAddress,
                poolHash,
                microErthAmount,
                microTokenBAmount
            );
            console.log("Liquidity provided successfully!");

            setAnimationState('success');

            // Clear inputs
            setErthAmount('');
            setTokenBAmount('');
        } catch (error) {
            console.error("Error providing liquidity:", error);
            setAnimationState('error');
        } finally {
            fetchBalancesAndReserves(); // Refresh data
        }
    };

    // Stake LP Tokens to the Staking Contract
    const handleStakeLpTokens = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }

        const inputAmountInMicroUnits = toMicroUnits(lpTokenAmount, tokenB.lp); // Convert amount to micro units
        const snipMsg = {
            deposit: {},
        };

        try {
            setIsModalOpen(true);
            setAnimationState('loading');

            // Execute the snip interaction, sending to the staking contract
            await snip(
                tokenB.lp.contract,    // LP token contract address
                tokenB.lp.hash,        // LP token contract hash
                stakingContract,       // Staking contract address
                stakingHash,           // Staking contract hash
                snipMsg,               // The message (deposit action)
                inputAmountInMicroUnits // Amount to stake
            );

            console.log("Staking of LP tokens to staking contract successful!");
            setAnimationState('success');

            // Clear input
            setLpTokenAmount('');
        } catch (error) {
            console.error("Error staking LP tokens to staking contract:", error);
            setAnimationState('error');
        } finally {
            fetchBalancesAndReserves(); // Refresh data
        }
    };

    // Unstake LP Tokens from the staking contract
    const handleUnstakeLpTokens = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }

        const unstakeAmountInMicroUnits = toMicroUnits(unstakeAmount, tokenB.lp); // Convert amount to micro units

        const contractMsg = {
            withdraw: {
                pool: tokenB.poolContract,  // Pool contract address
                amount: unstakeAmountInMicroUnits.toString(),
            }
        };

        try {
            setIsModalOpen(true);
            setAnimationState('loading');

            // Execute the unstake contract interaction
            await contract(stakingContract, stakingHash, contractMsg);

            console.log("Unstaking LP tokens from staking contract successful!");
            setAnimationState('success');

            // Clear input
            setUnstakeAmount('');
        } catch (error) {
            console.error("Error unstaking LP tokens from staking contract:", error);
            setAnimationState('error');
        } finally {
            fetchBalancesAndReserves(); // Refresh data
        }
    };

    // Withdraw LP Tokens (snip send to pool)
    const handleWithdrawLpTokens = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }

        const inputAmountInMicroUnits = toMicroUnits(lpTokenAmount, tokenB.lp); // Convert amount to micro units
        const snipMsg = {
            unbond_liquidity: {},  // Hook message for unbonding liquidity
        };

        try {
            setIsModalOpen(true);
            setAnimationState('loading');

            // Execute the snip interaction, sending the unbond message to the pool contract
            await snip(
                tokenB.lp.contract,    // LP token contract address
                tokenB.lp.hash,        // LP token contract hash
                tokenB.poolContract,   // Pool contract address for unbonding liquidity
                tokenB.poolHash,       // Pool contract hash
                snipMsg,               // The message (unbonding action)
                inputAmountInMicroUnits // Amount to withdraw
            );

            console.log("Unbonding liquidity from the pool successful!");
            setAnimationState('success');

            // Clear input
            setLpTokenAmount('');
        } catch (error) {
            console.error("Error unbonding liquidity from the pool:", error);
            setAnimationState('error');
        } finally {
            fetchBalancesAndReserves(); // Refresh data
        }
    };

    return (
        <div className="liquidity-management-box">
            {/* Modal for displaying transaction status */}
            <StatusModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                animationState={animationState}
            />

            <h2>Manage Liquidity (migration soon- DO NOT USE!)</h2>
            <div className="liquidity-management-close-button" onClick={toggleManageLiquidity}>X</div>

            <div className="liquidity-management-tab">
                <button
                    className={`tablinks ${activeTab === 'Provide' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Provide')}
                >
                    Provide
                </button>
                <button
                    className={`tablinks ${activeTab === 'Stake' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Stake')}
                >
                    Stake
                </button>
                <button
                    className={`tablinks ${activeTab === 'Withdraw' ? 'active' : ''}`}
                    onClick={() => setActiveTab('Withdraw')}
                >
                    Withdraw
                </button>
            </div>

            {/* Provide Liquidity Section */}
            {activeTab === 'Provide' && (
                <div id="Provide" className="liquidity-management-tabcontent">
                    {/* Token B Input */}
                    <div className="liquidity-management-input-group">
                        <div className="liquidity-management-label-wrapper">
                            <label htmlFor="provide-tokenB" className="liquidity-management-input-label">{tokenBKey}</label>
                            <div className="balance-container">
                                {tokenBBalance === 'Error' ? (
                                    <button className="max-button" onClick={() => handleRequestViewingKey(tokenB)}>
                                        Get Viewing Key
                                    </button>
                                ) : (
                                    <>
                                        Balance: {tokenBBalance !== null ? tokenBBalance : 'N/A'}
                                        <button className="max-button" onClick={handleMaxTokenBAmount}>Max</button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="liquidity-management-input-wrapper">
                            <img id="provide-tokenB-logo" src={tokenB.logo} alt={`${tokenBKey} Token`} className="liquidity-management-input-logo" />
                            <input
                                type="text"
                                id="provide-tokenB"
                                value={tokenBAmount}
                                onChange={handleTokenBChange}
                                placeholder={`Amount of ${tokenBKey} to Provide`}
                                className="liquidity-management-input"
                            />
                        </div>
                    </div>

                    {/* ERTH Input */}
                    <div className="liquidity-management-input-group">
                        <div className="liquidity-management-label-wrapper">
                            <label htmlFor="provide-erth" className="liquidity-management-input-label">ERTH</label>
                            <div className="balance-container">
                                {erthBalance === 'Error' ? (
                                    <button className="max-button" onClick={() => handleRequestViewingKey(tokenErth)}>
                                        Get Viewing Key
                                    </button>
                                ) : (
                                    <>
                                        Balance: {erthBalance !== null ? erthBalance : 'N/A'}
                                        <button className="max-button" onClick={handleMaxErthAmount}>Max</button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="liquidity-management-input-wrapper">
                            <img id="provide-erth-logo" src={tokenErth.logo} alt="ERTH Token" className="liquidity-management-input-logo" />
                            <input
                                type="text"
                                id="provide-erth"
                                value={erthAmount}
                                onChange={handleErthChange}
                                placeholder="Amount of ERTH to Provide"
                                className="liquidity-management-input"
                            />
                        </div>
                    </div>

                    <button onClick={handleProvideLiquidity} className="liquidity-management-button">
                        Provide Liquidity
                    </button>
                </div>
            )}

            {/* Stake LP Tokens Section */}
            {activeTab === 'Stake' && (
                <div id="Stake" className="liquidity-management-tabcontent">
                    {/* Stake LP Tokens Input */}
                    <div className="liquidity-management-input-group">
                        <div className="liquidity-management-label-wrapper">
                            <label htmlFor="stake-lp" className="liquidity-management-input-label">Unstaked LP Tokens</label>
                            <div className="balance-container">
                                {lpTokenWalletBalance === 'Error' ? (
                                    <button className="max-button" onClick={() => handleRequestViewingKey(tokenB.lp)}>
                                        Get Viewing Key
                                    </button>
                                ) : (
                                    <>
                                        Balance: {lpTokenWalletBalance !== null ? lpTokenWalletBalance : 'N/A'}
                                        <button className="max-button" onClick={handleMaxLpTokenWalletBalance}>Max</button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="liquidity-management-input-wrapper">
                            <input
                                type="text"
                                id="stake-lp"
                                value={lpTokenAmount}
                                onChange={(e) => setLpTokenAmount(e.target.value)}
                                placeholder="Amount of LP Tokens to Stake"
                                className="liquidity-management-input"
                            />
                        </div>
                    </div>
                    <button onClick={handleStakeLpTokens} className="liquidity-management-button">
                        Stake LP
                    </button>

                    {/* Unstake LP Tokens Input */}
                    <div className="liquidity-management-input-group">
                        <div className="liquidity-management-label-wrapper">
                            <label htmlFor="unstake-lp" className="liquidity-management-input-label">Staked LP Tokens</label>
                            <div className="balance-container">
                                {stakedLpTokenBalance === 'Error' ? (
                                    <button className="max-button" onClick={() => handleRequestViewingKey(stakingContract)}>
                                        Get Viewing Key
                                    </button>
                                ) : (
                                    <>
                                        Balance: {stakedLpTokenBalance !== null ? stakedLpTokenBalance : 'N/A'}
                                        <button className="max-button" onClick={handleMaxStakedLpTokenBalance}>Max</button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="liquidity-management-input-wrapper">
                            <input
                                type="text"
                                id="unstake-lp"
                                value={unstakeAmount}
                                onChange={(e) => setUnstakeAmount(e.target.value)}
                                placeholder="Amount of LP Tokens to Unstake"
                                className="liquidity-management-input"
                            />
                        </div>
                    </div>
                    <button onClick={handleUnstakeLpTokens} className="liquidity-management-button">
                        Unstake LP
                    </button>
                </div>
            )}

            {/* Withdraw LP Tokens Section */}
            {activeTab === 'Withdraw' && (
                <div id="Withdraw" className="liquidity-management-tabcontent">
                    {/* Unstaked LP Tokens Input */}
                    <div className="liquidity-management-input-group">
                        <div className="liquidity-management-label-wrapper">
                            <label htmlFor="withdraw-lp" className="liquidity-management-input-label">Unstaked LP Tokens</label>
                            <div className="balance-container">
                                {lpTokenWalletBalance === 'Error' ? (
                                    <button className="max-button" onClick={() => handleRequestViewingKey(tokenB.lp)}>
                                        Get Viewing Key
                                    </button>
                                ) : (
                                    <>
                                        Balance: {lpTokenWalletBalance !== null ? lpTokenWalletBalance : 'N/A'}
                                        <button className="max-button" onClick={handleMaxLpTokenWalletBalance}>Max</button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="liquidity-management-input-wrapper">
                            <input
                                type="text"
                                id="withdraw-lp"
                                value={lpTokenAmount}
                                onChange={(e) => setLpTokenAmount(e.target.value)}
                                placeholder="Amount of LP Tokens to Withdraw"
                                className="liquidity-management-input"
                            />
                        </div>
                    </div>
                    <button onClick={handleWithdrawLpTokens} className="liquidity-management-button">
                        Withdraw LP
                    </button>
                </div>
            )}
        </div>
    );
};

export default LiquidityManagement;
