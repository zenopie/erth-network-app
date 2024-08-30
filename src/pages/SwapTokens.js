import React, { useState, useEffect } from 'react';
import { querySnipBalance, query, snip } from '../utils/contractUtils';
import { getPoolDetails, calculateOutput, calculateInput, calculateMinimumReceived } from '../utils/swapTokensUtils';
import tokens from '../utils/tokens';
import './SwapTokens.css';
import { showLoadingScreen } from '../utils/uiUtils';
import { toMicroUnits } from '../utils/mathUtils';

const SwapTokens = ({ isKeplrConnected }) => {
    const [fromToken, setFromToken] = useState('ANML');
    const [toToken, setToToken] = useState('ERTH');
    const [fromAmount, setFromAmount] = useState('');
    const [toAmount, setToAmount] = useState('');
    const [fromBalance, setFromBalance] = useState(null);
    const [toBalance, setToBalance] = useState(null);
    const [reserves, setReserves] = useState({});
    const [fees, setFees] = useState({});
    const [loadingBalances, setLoadingBalances] = useState(false);
    const [swapResult, setSwapResult] = useState('');
    const [slippage, setSlippage] = useState(1);  // Default slippage
    const [poolDetails, setPoolDetails] = useState(null);  // Store pool details

    useEffect(() => {
        const fetchData = async () => {
            if (!isKeplrConnected) {
                console.warn("Keplr is not connected.");
                return;
            }
            setLoadingBalances(true);
            showLoadingScreen(true);
            try {
                const fromTokenBalance = await querySnipBalance(tokens[fromToken]);
                const toTokenBalance = await querySnipBalance(tokens[toToken]);

                const poolDetails = getPoolDetails(fromToken, toToken);

                if (!poolDetails || !poolDetails.poolContract || !poolDetails.poolHash) {
                    console.error('Invalid pool details:', poolDetails);
                    throw new Error('Invalid pool details.');
                }

                setPoolDetails(poolDetails); // Store pool details in state

                const reservesData = await query(poolDetails.poolContract, poolDetails.poolHash, { query_state: {} });
                const stateInfo = reservesData.state;

                if (stateInfo) {
                    setReserves({
                        [tokens[fromToken].contract]: fromToken === 'ERTH' ? parseInt(stateInfo.token_erth_reserve) : parseInt(stateInfo.token_b_reserve),
                        [tokens[toToken].contract]: toToken === 'ERTH' ? parseInt(stateInfo.token_erth_reserve) : parseInt(stateInfo.token_b_reserve),
                    });
                    setFees({
                        protocol: parseInt(stateInfo.protocol_fee),
                    });
                }

                setFromBalance(parseFloat(fromTokenBalance));
                setToBalance(parseFloat(toTokenBalance));
            } catch (err) {
                console.error("Error fetching data:", err);
                setFromBalance("Error");
                setToBalance("Error");
            } finally {
                setLoadingBalances(false);
                showLoadingScreen(false);
            }
        };

        fetchData();
    }, [isKeplrConnected, fromToken, toToken]);

    const handleFromAmountChange = (e) => {
        const inputAmount = e.target.value;
        setFromAmount(inputAmount);

        const outputAmount = calculateOutput(inputAmount, tokens[fromToken], tokens[toToken], reserves, fees);
        setToAmount(outputAmount);
    };

    const handleToAmountChange = (e) => {
        const outputAmount = e.target.value;
        setToAmount(outputAmount);
        
        const inputAmount = calculateInput(outputAmount, tokens[toToken], tokens[fromToken], reserves, fees);
        setFromAmount(inputAmount);
    };
    

    const handleFromTokenChange = (e) => {
        const selectedToken = e.target.value;
        if (selectedToken === toToken) {
            setToToken(fromToken);
        }
        setFromToken(selectedToken);
    };

    const handleToTokenChange = (e) => {
        const selectedToken = e.target.value;
        if (selectedToken === fromToken) {
            setFromToken(toToken);
        }
        setToToken(selectedToken);
    };

    const handleSwap = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }

        try {
            showLoadingScreen(true);

            const inputAmount = parseFloat(fromAmount);
            if (isNaN(inputAmount) || inputAmount <= 0) {
                alert("Invalid input amount.");
                return;
            }

            const outputAmount = calculateOutput(inputAmount, tokens[fromToken], tokens[toToken], reserves, fees);
            if (outputAmount === "Insufficient liquidity") {
                alert("Insufficient liquidity.");
                return;
            }

            const minReceived = calculateMinimumReceived(outputAmount, slippage);
            const inputAmountInMicroUnits = toMicroUnits(inputAmount, tokens[fromToken]);
            const minReceivedInMicroUnits = toMicroUnits(minReceived, tokens[toToken]);

            if (!poolDetails || !poolDetails.poolContract || !poolDetails.poolHash) {
                console.error('Invalid pool details:', poolDetails);
                throw new Error('Invalid pool details.');
            }

            const snipmsg = {
                swap: {
                    min_received: minReceivedInMicroUnits.toString(),
                }
            };

            await snip(
                tokens[fromToken].contract,
                tokens[fromToken].hash,
                poolDetails.poolContract,
                poolDetails.poolHash,
                snipmsg,
                inputAmountInMicroUnits
            );
            setSwapResult("Swap executed successfully!");
        } catch (error) {
            console.error('Error executing swap:', error);
            setSwapResult("Error executing swap. Check the console for details.");
        } finally {
            showLoadingScreen(false);
        }
    };

    const calculatePriceImpact = () => {
        const inputMicro = toMicroUnits(fromAmount, tokens[fromToken]);
        const newFromReserve = reserves[tokens[fromToken].contract] + inputMicro;
        const newToReserve = reserves[tokens[toToken].contract] - toMicroUnits(toAmount, tokens[toToken]);
        
        const originalPrice = reserves[tokens[fromToken].contract] / reserves[tokens[toToken].contract];
        const newPrice = newFromReserve / newToReserve;

        const priceImpact = ((newPrice - originalPrice) / originalPrice) * 100;
        return priceImpact.toFixed(2);  // Return as percentage
    };

    const calculateTradeFee = () => {
        const fee = (fees.protocol / 10000) * fromAmount;
        return `${fee.toFixed(6)} ${fromToken}`;  // Show the fee in terms of the fromToken
    };

    const handleMaxFromAmount = () => {
        setFromAmount(fromBalance);
        const outputAmount = calculateOutput(fromBalance, tokens[fromToken], tokens[toToken], reserves, fees);
        setToAmount(outputAmount);
    };

    if (!isKeplrConnected) {
        return <div className="error-message">Keplr is not connected. Please connect to Keplr to proceed.</div>;
    }

    return (
        <div className="swap-box">
            <h2 className="swap-title">Swap Tokens</h2>
            <div className="input-group">
                <div className="label-wrapper">
                    <label htmlFor="from-token" className="input-label">From</label>
                    <select
                        id="from-token"
                        className="token-select"
                        value={fromToken}
                        onChange={handleFromTokenChange}
                    >
                        {Object.keys(tokens).map((tokenKey) => (
                            <option key={tokenKey} value={tokenKey}>
                                {tokenKey}
                            </option>
                        ))}
                    </select>
                    <span className="token-balance">
                        Balance: {loadingBalances ? 'Loading...' : fromBalance !== null ? fromBalance : 'N/A'}
                        {fromBalance && !isNaN(fromBalance) && (
                            <button className="max-button" onClick={handleMaxFromAmount}>Max</button>
                        )}
                    </span>
                </div>
                <div className="input-wrapper">
                    <img
                        src={tokens[fromToken].logo}
                        alt={`${fromToken} logo`}
                        className="input-logo"
                    />
                    <input
                        type="number"
                        className="swap-input"
                        placeholder="Amount"
                        value={fromAmount}
                        onChange={handleFromAmountChange}
                    />
                </div>
            </div>

            <div className="input-group">
                <div className="label-wrapper">
                    <label htmlFor="to-token" className="input-label">To</label>
                    <select
                        id="to-token"
                        className="token-select"
                        value={toToken}
                        onChange={handleToTokenChange}
                    >
                        {Object.keys(tokens).map((tokenKey) => (
                            <option key={tokenKey} value={tokenKey}>
                                {tokenKey}
                            </option>
                        ))}
                    </select>
                    <span className="token-balance">
                        Balance: {loadingBalances ? 'Loading...' : toBalance !== null ? toBalance : 'N/A'}
                    </span>
                </div>
                <div className="input-wrapper">
                    <img
                        src={tokens[toToken].logo}
                        alt={`${toToken} logo`}
                        className="input-logo"
                    />
                    <input
                        type="number"
                        className="swap-input"
                        placeholder="Amount"
                        value={toAmount}
                        onChange={handleToAmountChange}  // Restored toAmount calculation
                    />
                </div>
            </div>

            <button className="swap-button" onClick={handleSwap} disabled={loadingBalances}>
                Swap
            </button>

            {/* Show Details Section */}
            <details className="expandable-info">
                <summary>
                    <p>View Details</p>
                    <i className="bx bx-chevron-down chevron-icon"></i>
                </summary>
                <div className="slippage-tolerance">
                    <label htmlFor="slippage-input" className="slippage-label">Slippage Tolerance (%)</label>
                    <input
                        type="number"
                        id="slippage-input"
                        className="slippage-input"
                        value={slippage}
                        onChange={(e) => setSlippage(e.target.value)}
                        min="0.1"
                        max="5"
                        step="0.1"
                    />
                </div>

                <div className="info-display">
                    <div className="info-row">
                        <span className="info-label">Minimum Received:</span>
                        <span className="info-value" id="min-received">
                            {toAmount && !isNaN(toAmount) ? calculateMinimumReceived(toAmount, slippage).toFixed(6) : ''}
                        </span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">Price Impact:</span>
                        <span className="info-value" id="price-impact">
                            {fromAmount && toAmount && !isNaN(fromAmount) && !isNaN(toAmount) ? `${calculatePriceImpact()}%` : ''}
                        </span>
                    </div>
                    <div className="info-row">
                        <span className="info-label">Trade Fee:</span>
                        <span className="info-value" id="trade-fee">
                            {fromAmount && !isNaN(fromAmount) ? calculateTradeFee() : ''}
                        </span>
                    </div>
                </div>
            </details>
        </div>
    );
};

export default SwapTokens;
