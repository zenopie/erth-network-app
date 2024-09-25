import React, { useState, useEffect, useCallback } from 'react';
import { querySnipBalance, query, snip, requestViewingKey } from '../utils/contractUtils';
import { getPoolDetails, calculateOutput, calculateInput, calculateMinimumReceived,
    calculateOutputWithHop,
} from '../utils/swapTokensUtils';
import tokens from '../utils/tokens';
import './SwapTokens.css';
import { showLoadingScreen } from '../utils/uiUtils';
import { toMicroUnits } from '../utils/mathUtils';
import StatusModal from '../components/StatusModal'; 

const SwapTokens = ({ isKeplrConnected }) => {
    const [fromToken, setFromToken] = useState('ANML');
    const [toToken, setToToken] = useState('ERTH');
    const [fromAmount, setFromAmount] = useState('');
    const [toAmount, setToAmount] = useState('');
    const [fromBalance, setFromBalance] = useState(null);
    const [toBalance, setToBalance] = useState(null);
    const [reserves, setReserves] = useState({});
    const [fees, setFees] = useState({});
    const [slippage, setSlippage] = useState(1);  // Default slippage
    const [poolDetails, setPoolDetails] = useState(null);  // Store pool details
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [animationState, setAnimationState] = useState('loading'); // 'loading', 'success', 'error'

    const fetchData = useCallback(async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }
        showLoadingScreen(true);
        try {
            const fromTokenBalance = await querySnipBalance(tokens[fromToken]);
            const toTokenBalance = await querySnipBalance(tokens[toToken]);

             // Ensure balance is only set if it's a valid number
            setFromBalance(isNaN(fromTokenBalance) || fromTokenBalance === "Error" ? "Error" : parseFloat(fromTokenBalance));
            setToBalance(isNaN(toTokenBalance) || toTokenBalance === "Error" ? "Error" : parseFloat(toTokenBalance));

            const poolDetails = getPoolDetails(fromToken, toToken);

            if (!poolDetails) {
                console.error('Invalid pool details:', poolDetails);
                throw new Error('Invalid pool details.');
            }

            setPoolDetails(poolDetails); // Store pool details in state

            let newReserves = {};
            let newFees = {};
            if (!poolDetails.isHop) {
                
                const reservesData = await query(poolDetails.poolContract, poolDetails.poolHash, { query_state: {} });
                const stateInfo = reservesData.state;

                if (stateInfo) {
                    if (fromToken === 'ERTH') {
                        // When fromToken is ERTH
                        newReserves[`${fromToken}-${toToken}`] = {
                            [fromToken]: parseInt(stateInfo.token_erth_reserve),
                            [toToken]: parseInt(stateInfo.token_b_reserve),
                        };
                    } else {
                        // When toToken is ERTH or neither token is ERTH
                        newReserves[`${fromToken}-${toToken}`] = {
                            [fromToken]: parseInt(stateInfo.token_b_reserve),
                            [toToken]: parseInt(stateInfo.token_erth_reserve),
                        };
                    }
                    newFees[`${fromToken}-${toToken}`] = parseInt(stateInfo.protocol_fee);
                }
                
            } else {

                // FromToken -> ERTH
                const reservesFromData = await query(poolDetails.firstPoolContract, poolDetails.firstPoolHash, { query_state: {} });
                const fromState = reservesFromData.state;

                if (fromState) {
                    newReserves[`${fromToken}-${'ERTH'}`] = {
                        [fromToken]: parseInt(fromState.token_b_reserve),
                        'ERTH': parseInt(fromState.token_erth_reserve),
                    };
                    newFees[`${fromToken}-${'ERTH'}`] = parseInt(fromState.protocol_fee);
                }

                // ERTH -> ToToken
                const reservesToData = await query(poolDetails.secondPoolContract, poolDetails.secondPoolHash, { query_state: {} });
                const toState = reservesToData.state;

                if (toState) {
                    newReserves[`ERTH-${toToken}`] = {
                        'ERTH': parseInt(toState.token_erth_reserve),
                        [toToken]: parseInt(toState.token_b_reserve),
                    };
                    newFees[`ERTH-${toToken}`] = parseInt(toState.protocol_fee);
                }
                
            }

            setReserves(newReserves);
            setFees(newFees);
        } catch (err) {
            console.error("Error fetching data:", err);
            setFromBalance("Error");
            setToBalance("Error");
        } finally {
            showLoadingScreen(false);
        }
    }, [isKeplrConnected, fromToken, toToken]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    

    const handleFromAmountChange = (inputAmount) => {
        setFromAmount(inputAmount);
    
        let outputAmount;
    
        if (poolDetails) {
            if (!poolDetails.isHop) {
                outputAmount = calculateOutput(inputAmount, fromToken, toToken, reserves, fees);
            } else {
                outputAmount = calculateOutputWithHop(inputAmount, fromToken, toToken, reserves, fees);
            }
        } else {
            outputAmount = '';
        }
    
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
        setFromAmount('');  // Clear input after token change
        setToAmount('');    // Clear output after token change
    };

    const handleToTokenChange = (e) => {
        const selectedToken = e.target.value;
        if (selectedToken === fromToken) {
            setFromToken(toToken);
        }
        setToToken(selectedToken);
        setFromAmount('');  // Clear input after token change
        setToAmount('');    // Clear output after token change
    };

    const handleSwap = async () => {
        if (!isKeplrConnected) {
            console.warn("Keplr is not connected.");
            return;
        }
        
        try {
            const inputAmount = parseFloat(fromAmount);
            if (isNaN(inputAmount) || inputAmount <= 0) {
                return;
            }
    
            setIsModalOpen(true);  // Open the modal and show loading animation
            setAnimationState('loading');  // Set the state to loading when the swap starts
            
            const minReceived = calculateMinimumReceived(toAmount, slippage);
            const inputAmountInMicroUnits = toMicroUnits(inputAmount, tokens[fromToken]);
            const minReceivedInMicroUnits = toMicroUnits(minReceived, tokens[toToken]);
    
            let snipmsg;
    
            if (!poolDetails.isHop) {
                snipmsg = {
                    swap: {
                        min_received: minReceivedInMicroUnits.toString(),
                    }
                };
    
                try {
                    await snip(
                        tokens[fromToken].contract,
                        tokens[fromToken].hash,
                        poolDetails.poolContract,
                        poolDetails.poolHash,
                        snipmsg,
                        inputAmountInMicroUnits
                    );
                } catch (error) {
                    console.error("Error during non-hop swap:", error);
                }
    
            } else {
    
                const hop = {
                    contract: poolDetails.secondPoolContract,
                    hash: poolDetails.secondPoolHash,
                };
    
                snipmsg = {
                    swap: {
                        min_received: minReceivedInMicroUnits.toString(),
                        hop: hop,
                    }
                };
    
                try {
                    await snip(
                        tokens[fromToken].contract,
                        tokens[fromToken].hash,
                        poolDetails.firstPoolContract,
                        poolDetails.firstPoolHash,
                        snipmsg,
                        inputAmountInMicroUnits
                    );
                } catch (error) {
                    console.error("Error during hop swap:", error);
                }
            }
    
            setAnimationState('success'); // Set the animation state to success after a successful swap
            setFromAmount('');  // Clear input after token change
            setToAmount('');    // Clear output after token change
        } catch (error) {
            console.error('Error executing swap:', error);
            setAnimationState('error');  // Set the animation state to error if an exception occurs
        } finally {
            fetchData(); // Re-fetch balances after the swap
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
        handleFromAmountChange(fromBalance);
    };

    const handleRequestViewingKey = async (token) => {
        await requestViewingKey(token); // Call the universal function
        fetchData(); // Refresh balances after viewing key is set
    };
    

    if (!isKeplrConnected) {
        return <div className="error-message">Keplr is not connected. Please connect to Keplr to proceed.</div>;
    }

    return (
        <div className="swap-box">
            {/* Modal for displaying swap status */}
            <StatusModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                animationState={animationState}
            />
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
                    <div className="token-balance">
                        {fromBalance === 'Error' ? (
                            <button className="max-button" onClick={() => handleRequestViewingKey(tokens[fromToken])}>
                                Get Viewing Key
                            </button>
                        ) : (
                            <>
                                Balance: {fromBalance !== null ? fromBalance : 'N/A'}
                                <button className="max-button" onClick={handleMaxFromAmount}>Max</button>
                            </>
                        )}
                    </div>


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
                        onChange={(e) => handleFromAmountChange(e.target.value)}
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
                    <div className="token-balance">
                        {toBalance === 'Error' ? (
                            <button className="max-button" onClick={() => handleRequestViewingKey(tokens[toToken])}>
                                Get Viewing Key
                            </button>
                        ) : (
                            <>
                                Balance: {toBalance !== null ? toBalance : 'N/A'}
                            </>
                        )}
                    </div>
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

            <button className="swap-button" onClick={handleSwap}>
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
