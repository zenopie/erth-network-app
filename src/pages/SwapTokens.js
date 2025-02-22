import React, { useState, useEffect, useCallback } from 'react';
import { querySnipBalance, query, snip, requestViewingKey } from '../utils/contractUtils';
import contracts from '../utils/contracts'; // e.g. { exchange: { contract, hash } }
import tokens from '../utils/tokens';
import { calculateMinimumReceived } from '../utils/swapTokensUtils'; // Only for minReceive
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

  const [slippage, setSlippage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState('loading');

  // ========== FETCH USER BALANCE & Setup on load ==========
  const fetchData = useCallback(async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr not connected");
      return;
    }
    showLoadingScreen(true);
    try {
      const fromBal = await querySnipBalance(tokens[fromToken]);
      const toBal   = await querySnipBalance(tokens[toToken]);

      setFromBalance(isNaN(fromBal) ? "Error" : parseFloat(fromBal));
      setToBalance(isNaN(toBal) ? "Error" : parseFloat(toBal));
    } catch (err) {
      console.error("[fetchData] error:", err);
      setFromBalance("Error");
      setToBalance("Error");
    } finally {
      showLoadingScreen(false);
    }
  }, [isKeplrConnected, fromToken, toToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ========== Query the contract to simulate a swap ==========
  const simulateSwapQuery = async (inputAmount, fromTk, toTk) => {
    if (!isKeplrConnected) return '';
    if (!inputAmount) return '';

    try {
      // Build the query
      // (We must pass token addresses, amounts in micro, etc. as required by contract)
      const amountInMicro = toMicroUnits(parseFloat(inputAmount), tokens[fromTk]);

      // The query contract expects { simulate_swap: { input_token, amount, output_token } }
      const simulateMsg = {
        simulate_swap: {
          input_token: tokens[fromTk].contract, // e.g. "secret1xyz..."
          amount: amountInMicro.toString(),
          output_token: tokens[toTk].contract
        }
      };

      const result = await query(
        contracts.exchange.contract,
        contracts.exchange.hash,
        simulateMsg
      );

      // result => { output_amount, intermediate_amount, total_fee }
      const out = result.output_amount;

      // Convert out from micro to "macro"
      const decimals = tokens[toTk].decimals || 6;
      const power = 10 ** decimals;
      const outNumber = parseFloat(out) / power;

      return outNumber.toFixed(6);
    } catch (err) {
      console.error("[simulateSwapQuery] error:", err);
      return '';
    }
  };

  // ========== Handle From Amount Change => do a contract simulation ==========
  const handleFromAmountChange = async (val) => {
    setFromAmount(val);
    setToAmount('');
    if (!val || isNaN(val) || parseFloat(val) <= 0) {
      return;
    }

    const simulated = await simulateSwapQuery(val, fromToken, toToken);
    if (simulated) {
      setToAmount(simulated);
    }
  };

  // ========== SWAP BUTTON ==========
  const handleSwap = async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr not connected.");
      return;
    }
    const inputAmount = parseFloat(fromAmount);
    if (isNaN(inputAmount) || inputAmount <= 0) {
      console.warn("Invalid inputAmount");
      return;
    }

    setIsModalOpen(true);
    setAnimationState('loading');

    try {
      // Minimum received (slippage)
      const minReceived = calculateMinimumReceived(toAmount, slippage);
      const inputInMicro = toMicroUnits(inputAmount, tokens[fromToken]);
      // optional:
      const minInMicro = toMicroUnits(minReceived, tokens[toToken]);

      // 1) Build the swap message
      const snipMsg = {
        swap: {
          output_token: tokens[toToken].contract,
          // optionally pass min_received
          // min_received: minInMicro.toString(),
        },
      };

      // 2) Approve & Execute
      await snip(
        tokens[fromToken].contract,
        tokens[fromToken].hash,
        contracts.exchange.contract,
        contracts.exchange.hash,
        snipMsg,
        inputInMicro
      );

      setAnimationState('success');
      setFromAmount('');
      setToAmount('');
    } catch (err) {
      console.error("[handleSwap] error:", err);
      setAnimationState('error');
    } finally {
      // refresh balances
      fetchData();
    }
  };

  // ========== SWAP UI ==========

  const handleFromTokenChange = (e) => {
    const selected = e.target.value;
    if (selected === toToken) {
      setToToken(fromToken);
    }
    setFromToken(selected);
    setFromAmount('');
    setToAmount('');
  };

  const handleToTokenChange = (e) => {
    const selected = e.target.value;
    if (selected === fromToken) {
      setFromToken(toToken);
    }
    setToToken(selected);
    setFromAmount('');
    setToAmount('');
  };

  const handleMaxFromAmount = () => {
    if (typeof fromBalance === 'number') {
      handleFromAmountChange(fromBalance.toString());
    }
  };

  const handleRequestViewingKey = async (tk) => {
    await requestViewingKey(tk);
    fetchData();
  };

  if (!isKeplrConnected) {
    return <div className="error-message">Connect Keplr first</div>;
  }

  return (
    <div className="swap-box">
      <StatusModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        animationState={animationState}
      />

      <h2 className="swap-title">Swap Tokens</h2>

      {/* FROM */}
      <div className="input-group">
        <div className="label-wrapper">
          <label htmlFor="from-token" className="input-label">From</label>
          <select
            id="from-token"
            className="token-select"
            value={fromToken}
            onChange={handleFromTokenChange}
          >
            {Object.keys(tokens).map((tk) => (
              <option key={tk} value={tk}>{tk}</option>
            ))}
          </select>

          <div className="token-balance">
            {fromBalance === "Error" ? (
              <button
                className="max-button"
                onClick={() => handleRequestViewingKey(tokens[fromToken])}
              >
                Get Viewing Key
              </button>
            ) : (
              <>
                Balance: {fromBalance ?? '...'}
                <button className="max-button" onClick={handleMaxFromAmount}>Max</button>
              </>
            )}
          </div>
        </div>

        <div className="input-wrapper">
          <img src={tokens[fromToken].logo} alt={`${fromToken} logo`} className="input-logo" />
          <input
            type="number"
            className="swap-input"
            placeholder="Amount"
            value={fromAmount}
            onChange={(e) => handleFromAmountChange(e.target.value)}
          />
        </div>
      </div>

      {/* TO (read‐only) */}
      <div className="input-group">
        <div className="label-wrapper">
          <label htmlFor="to-token" className="input-label">To</label>
          <select
            id="to-token"
            className="token-select"
            value={toToken}
            onChange={handleToTokenChange}
          >
            {Object.keys(tokens).map((tk) => (
              <option key={tk} value={tk}>{tk}</option>
            ))}
          </select>

          <div className="token-balance">
            {toBalance === "Error" ? (
              <button
                className="max-button"
                onClick={() => handleRequestViewingKey(tokens[toToken])}
              >
                Get Viewing Key
              </button>
            ) : (
              <>Balance: {toBalance ?? '...'} </>
            )}
          </div>
        </div>

        <div className="input-wrapper">
          <img src={tokens[toToken].logo} alt={`${toToken} logo`} className="input-logo" />
          <input
            type="number"
            className="swap-input"
            placeholder="Amount"
            value={toAmount}
            readOnly
          />
        </div>
      </div>

      {/* SWAP BUTTON */}
      <button className="swap-button" onClick={handleSwap}>Swap</button>

      <details className="expandable-info">
        <summary><p>View Details</p></summary>
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
            <span className="info-value">
              {toAmount
                ? calculateMinimumReceived(toAmount, slippage).toFixed(6)
                : ''}
            </span>
          </div>
        </div>
      </details>
    </div>
  );
};

export default SwapTokens;
