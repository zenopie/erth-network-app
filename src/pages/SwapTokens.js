import React, { useState, useEffect, useCallback } from 'react';
import { querySnipBalance, query, snip, requestViewingKey } from '../utils/contractUtils';
import contracts from '../utils/contracts'; // e.g. { exchange: { contract, hash } }
import tokens from '../utils/tokens';
import {
  getPoolDetails,            // If you still want to keep it for checking isHop
  calculateOutput,
  calculateInput,
  calculateMinimumReceived,
  calculateOutputWithHop,
} from '../utils/swapTokensUtils';
import { showLoadingScreen } from '../utils/uiUtils';
import { toMicroUnits } from '../utils/mathUtils';
import StatusModal from '../components/StatusModal';
import './SwapTokens.css';

const SwapTokens = ({ isKeplrConnected }) => {
  const [fromToken, setFromToken] = useState('ANML');
  const [toToken, setToToken] = useState('ERTH');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [fromBalance, setFromBalance] = useState(null);
  const [toBalance, setToBalance] = useState(null);

  // Reserves & fees for each pool, e.g.: reserves["ANML-ERTH"] = { ANML: 1234, ERTH: 5678 }
  const [reserves, setReserves] = useState({});
  const [fees, setFees] = useState({});

  // Keep existing states
  const [slippage, setSlippage] = useState(1);  // Default slippage
  const [poolDetails, setPoolDetails] = useState(null);  // We’ll set isHop, etc.
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState('loading'); // 'loading', 'success', 'error'

  // ============== Fetch user balance & pool info ==============
  const fetchData = useCallback(async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected.");
      return;
    }
    showLoadingScreen(true);

    try {
      // 1) Fetch user wallet balances
      const fromTokenBalance = await querySnipBalance(tokens[fromToken]);
      const toTokenBalance = await querySnipBalance(tokens[toToken]);
      setFromBalance(isNaN(fromTokenBalance) ? "Error" : parseFloat(fromTokenBalance));
      setToBalance(isNaN(toTokenBalance) ? "Error" : parseFloat(toTokenBalance));

      // 2) Decide if it’s single-hop or double-hop
      //    (If you’re still using getPoolDetails for that logic, do so here)
      const details = getPoolDetails(fromToken, toToken);
      if (!details) {
        throw new Error('Invalid pool details.');
      }
      setPoolDetails(details);

      // 3) Identify which pools we need to query from the unified exchange
      //    If a token is “ERTH,” no separate pool needed. Otherwise, we need that token’s pool.
      const tokensToQuery = [];
      if (fromToken !== 'ERTH') tokensToQuery.push(tokens[fromToken].contract);
      if (toToken !== 'ERTH')   tokensToQuery.push(tokens[toToken].contract);

      const newReserves = {};
      const newFees = {};

      if (tokensToQuery.length > 0) {
        // Query the unified exchange for pool info
        const poolInfos = await query(contracts.exchange.contract, contracts.exchange.hash, {
          query_pool_info: { pools: tokensToQuery },
        });
        // poolInfos is an array, each item looks like:
        // {
        //   state: {
        //     erth_reserve: "6994179889999",
        //     token_b_reserve: "51278261",
        //     protocol_fee: "30", // or it might be in state or config
        //     ...
        //   },
        //   config: {
        //     token_b_contract: "secret14p6d...",
        //     token_b_symbol: "ANML",
        //     ...
        //   }
        // }

        // 4) Convert these to your reserves/fees structure
        poolInfos.forEach((info) => {
          const sym = info.config.token_b_symbol;          // e.g. "ANML"
          //const tokenAddr = info.config.token_b_contract;  // "secret14p6dh..."

          // Pull reserves from "state"
          const tReserve = parseInt(info.state.token_b_reserve);
          const eReserve = parseInt(info.state.erth_reserve);

          // If the fee is in "state.protocol_fee", parse it:
          const protocolFee = info.state.protocol_fee
            ? parseInt(info.state.protocol_fee)
            : 0;

          // Build the key "ANML-ERTH" or "FINA-ERTH", etc.
          const poolKey = `${sym}-ERTH`;
          newReserves[poolKey] = { [sym]: tReserve, ERTH: eReserve };
          newFees[poolKey] = protocolFee;
        });
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

  // On mount or token change, refetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============== Local input => output calculations ==============
  const handleFromAmountChange = (inputAmount) => {
    setFromAmount(inputAmount);

    if (!poolDetails) {
      setToAmount('');
      return;
    }

    let outputAmount;
    if (!poolDetails.isHop) {
      // Single swap
      outputAmount = calculateOutput(inputAmount, fromToken, toToken, reserves, fees);
    } else {
      // Double-hop
      outputAmount = calculateOutputWithHop(inputAmount, fromToken, toToken, reserves, fees);
    }
    setToAmount(outputAmount);
  };

  const handleToAmountChange = (e) => {
    const outputAmount = e.target.value;
    setToAmount(outputAmount);
    const inputAmount = calculateInput(outputAmount, tokens[toToken], tokens[fromToken], reserves, fees);
    setFromAmount(inputAmount);
  };

  // ============== UI handlers for token selects ==============
  const handleFromTokenChange = (e) => {
    const selectedToken = e.target.value;
    if (selectedToken === toToken) {
      setToToken(fromToken);
    }
    setFromToken(selectedToken);
    setFromAmount('');
    setToAmount('');
  };

  const handleToTokenChange = (e) => {
    const selectedToken = e.target.value;
    if (selectedToken === fromToken) {
      setFromToken(toToken);
    }
    setToToken(selectedToken);
    setFromAmount('');
    setToAmount('');
  };

  // ============== SWAP button ==============
  const handleSwap = async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected.");
      return;
    }

    const inputAmount = parseFloat(fromAmount);
    if (isNaN(inputAmount) || inputAmount <= 0) return;

    setIsModalOpen(true);
    setAnimationState('loading');

    try {
      // Compute min received for slippage
      const minReceived = calculateMinimumReceived(toAmount, slippage);
      const inputInMicro = toMicroUnits(inputAmount, tokens[fromToken]);
      const minInMicro   = toMicroUnits(minReceived, tokens[toToken]);

      // We now call the unified exchange, not a specific pool contract
      const snipmsg = {
        swap: {
          output_token: tokens[toToken].contract,
          //min_received: minInMicro.toString(),
          // If needed, your contract might require "hop: true/false", etc.
        },
      };

      // Approve & execute
      await snip(
        tokens[fromToken].contract,
        tokens[fromToken].hash,
        contracts.exchange.contract,  // unified exchange
        contracts.exchange.hash,
        snipmsg,
        inputInMicro
      );

      setAnimationState('success');
      setFromAmount('');
      setToAmount('');
    } catch (error) {
      console.error('Error executing swap:', error);
      setAnimationState('error');
    } finally {
      // Reload user balances and pool info
      fetchData();
    }
  };

  // ============== Additional UI (max, viewing key, slippage, etc.) ==============
  const handleMaxFromAmount = () => {
    if (typeof fromBalance === 'number') {
      handleFromAmountChange(fromBalance.toString());
    }
  };

  const handleRequestViewingKey = async (token) => {
    await requestViewingKey(token);
    fetchData();
  };

  // ============== Price Impact & Fee (optional) ==============
  const calculatePriceImpact = () => {
    // If missing data, just return ''
    if (!fromAmount || !toAmount || !poolDetails) return '';
    const inputNum = parseFloat(fromAmount);
    if (isNaN(inputNum) || inputNum <= 0) return '';

    // For single hop: key = "ANML-ERTH" or "ERTH-ANML"
    // For double hop: you might need to do partial calculations
    // (or just skip it or do it in the withHop style).
    if (!poolDetails.isHop) {
      // Single hop
      const poolKey = fromToken === 'ERTH' 
        ? `ERTH-${toToken}`
        : `${fromToken}-ERTH`;

      const pool = reserves[poolKey];
      if (!pool) return '';

      const fromReserve = pool[fromToken] || 0;
      const toReserve   = pool[toToken]   || 0;

      const inputMicro = toMicroUnits(fromAmount, tokens[fromToken]);
      const outputMicro = toMicroUnits(toAmount, tokens[toToken]);

      const newFromReserve = fromReserve + inputMicro;
      const newToReserve   = toReserve - outputMicro;
      if (fromReserve === 0 || toReserve === 0 || newToReserve <= 0) return '';

      const originalPrice = fromReserve / toReserve;
      const newPrice = newFromReserve / newToReserve;
      const impact = ((newPrice - originalPrice) / originalPrice) * 100;
      return `${impact.toFixed(2)}%`;
    } else {
      // Double-hop: you'd do partial for fromToken->ERTH, then ERTH->toToken
      // or do some simplified approach. For brevity, returning '' or do your own logic.
      return '';
    }
  };

  const calculateTradeFee = () => {
    if (!poolDetails || !fromAmount) return '';
    const amt = parseFloat(fromAmount);
    if (isNaN(amt) || amt <= 0) return '';

    const poolKey = fromToken === 'ERTH'
      ? `ERTH-${toToken}`
      : `${fromToken}-ERTH`;

    const protocolFee = fees[poolKey] || 0;
    const feePercent = protocolFee / 10000; 
    const feeAmount = feePercent * amt;
    return `${feeAmount.toFixed(6)} ${fromToken}`;
  };

  // If user not connected
  if (!isKeplrConnected) {
    return <div className="error-message">Keplr is not connected. Please connect to Keplr to proceed.</div>;
  }

  return (
    <div className="swap-box">
      <StatusModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        animationState={animationState}
      />
      <h2 className="swap-title">Swap Tokens</h2>

      {/* FROM input section */}
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
              <button
                className="max-button"
                onClick={() => handleRequestViewingKey(tokens[fromToken])}
              >
                Get Viewing Key
              </button>
            ) : (
              <>
                Balance: {fromBalance !== null ? fromBalance : 'N/A'}
                <button className="max-button" onClick={handleMaxFromAmount}>
                  Max
                </button>
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

      {/* TO input section */}
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
              <button
                className="max-button"
                onClick={() => handleRequestViewingKey(tokens[toToken])}
              >
                Get Viewing Key
              </button>
            ) : (
              <>Balance: {toBalance !== null ? toBalance : 'N/A'}</>
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
            onChange={handleToAmountChange}
          />
        </div>
      </div>

      {/* SWAP button */}
      <button className="swap-button" onClick={handleSwap}>
        Swap
      </button>

      {/* Details for slippage, min received, fees, etc. */}
      <details className="expandable-info">
        <summary>
          <p>View Details</p>
          <i className="bx bx-chevron-down chevron-icon"></i>
        </summary>

        <div className="slippage-tolerance">
          <label htmlFor="slippage-input" className="slippage-label">
            Slippage Tolerance (%)
          </label>
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
              {toAmount && !isNaN(toAmount)
                ? calculateMinimumReceived(toAmount, slippage).toFixed(6)
                : ''}
            </span>
          </div>

          <div className="info-row">
            <span className="info-label">Price Impact:</span>
            <span className="info-value" id="price-impact">
              {fromAmount && toAmount && !isNaN(fromAmount) && !isNaN(toAmount)
                ? calculatePriceImpact()
                : ''}
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
