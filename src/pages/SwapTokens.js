import React, { useState, useEffect, useCallback } from "react";
import { querySnipBalance, query, snip, requestViewingKey } from "../utils/contractUtils";
import contracts from "../utils/contracts"; // e.g. { exchange: { contract, hash } }
import tokens from "../utils/tokens";
import { calculateMinimumReceived } from "../utils/swapTokensUtils"; // Only for minReceive
import { showLoadingScreen } from "../utils/uiUtils";
import { toMicroUnits } from "../utils/mathUtils";
import StatusModal from "../components/StatusModal";
import "./SwapTokens.css";

const SwapTokens = ({ isKeplrConnected }) => {
  const [fromToken, setFromToken] = useState("ANML");
  const [toToken, setToToken] = useState("ERTH");
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");

  const [fromBalance, setFromBalance] = useState(null);
  const [toBalance, setToBalance] = useState(null);

  const [slippage, setSlippage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [showDetails, setShowDetails] = useState(false);
  const [priceImpact, setPriceImpact] = useState(null);

  // ========== FETCH USER BALANCE & Setup on load ==========
  const fetchData = useCallback(async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr not connected");
      return;
    }
    showLoadingScreen(true);
    try {
      const fromBal = await querySnipBalance(tokens[fromToken]);
      const toBal = await querySnipBalance(tokens[toToken]);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ========== Calculate Price Impact ==========
  const calculatePriceImpact = (inputAmount, outputAmount, result) => {
    try {
      // If the contract returns more detailed information about the swap including fees,
      // we can calculate a more accurate price impact
      if (result && result.total_fee) {
        const totalFee = parseFloat(result.total_fee);
        const intermediateAmount = parseFloat(result.intermediate_amount || 0);

        // Price impact can be calculated as the percentage of fees relative to the intermediate amount
        // This is a simplified approach - the exact calculation depends on the AMM model
        if (intermediateAmount > 0) {
          return ((totalFee / intermediateAmount) * 100).toFixed(2);
        }
      }

      // Fallback: simple estimate based on the ratio of expected vs actual output
      // The actual formula would depend on the specific AMM model used
      const inputValue = parseFloat(inputAmount);
      const outputValue = parseFloat(outputAmount);

      if (inputValue > 0 && outputValue > 0) {
        // Simple estimation - may need to be adjusted based on pool sizes and specific AMM model
        const sizeFactor = Math.min(1, inputValue / 1000); // Adjust based on typical trade size
        return (sizeFactor * 2).toFixed(2); // Simple estimation, replace with actual formula
      }

      return "0.00";
    } catch (err) {
      console.error("[calculatePriceImpact] error:", err);
      return "0.00";
    }
  };

  // ========== Query the contract to simulate a swap ==========
  const simulateSwapQuery = async (inputAmount, fromTk, toTk) => {
    if (!isKeplrConnected) return "";
    if (!inputAmount) return "";

    try {
      // Build the query
      // (We must pass token addresses, amounts in micro, etc. as required by contract)
      const amountInMicro = toMicroUnits(parseFloat(inputAmount), tokens[fromTk]);

      // The query contract expects { simulate_swap: { input_token, amount, output_token } }
      const simulateMsg = {
        simulate_swap: {
          input_token: tokens[fromTk].contract, // e.g. "secret1xyz..."
          amount: amountInMicro.toString(),
          output_token: tokens[toTk].contract,
        },
      };

      const result = await query(contracts.exchange.contract, contracts.exchange.hash, simulateMsg);

      // result => { output_amount, intermediate_amount, total_fee }
      const out = result.output_amount;

      // Convert out from micro to "macro"
      const decimals = tokens[toTk].decimals || 6;
      const power = 10 ** decimals;
      const outNumber = parseFloat(out) / power;

      // Calculate price impact
      const impact = calculatePriceImpact(inputAmount, outNumber.toFixed(6), result);
      setPriceImpact(impact);

      return outNumber.toFixed(6);
    } catch (err) {
      console.error("[simulateSwapQuery] error:", err);
      setPriceImpact(null);
      return "";
    }
  };

  // ========== Handle From Amount Change => do a contract simulation ==========
  const handleFromAmountChange = async (val) => {
    setFromAmount(val);

    if (!val || isNaN(val) || parseFloat(val) <= 0) {
      setToAmount("");
      setPriceImpact(null);
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
    setAnimationState("loading");

    try {
      // Minimum received (slippage)
      const minReceived = calculateMinimumReceived(toAmount, slippage);
      const inputInMicro = toMicroUnits(inputAmount, tokens[fromToken]);
      // eslint-disable-next-line no-unused-vars
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

      setAnimationState("success");
      setFromAmount("");
      setToAmount("");
      setPriceImpact(null);
    } catch (err) {
      console.error("[handleSwap] error:", err);
      setAnimationState("error");
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
    setFromAmount("");
    setToAmount("");
    setPriceImpact(null);
  };

  const handleToTokenChange = (e) => {
    const selected = e.target.value;
    if (selected === fromToken) {
      setFromToken(toToken);
    }
    setToToken(selected);
    setFromAmount("");
    setToAmount("");
    setPriceImpact(null);
  };

  const handleMaxFromAmount = () => {
    if (typeof fromBalance === "number") {
      handleFromAmountChange(fromBalance.toString());
    }
  };

  const handleRequestViewingKey = async (tk) => {
    await requestViewingKey(tk);
    fetchData();
  };

  if (!isKeplrConnected) {
    return <div className="swap-error-message">Connect Keplr first</div>;
  }

  return (
    <div className="swap-box">
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      <h2 className="swap-title">Swap Tokens</h2>

      {/* FROM */}
      <div className="swap-input-group">
        <div className="swap-label-wrapper">
          <label htmlFor="from-token" className="swap-input-label">
            From
          </label>
          <select id="from-token" className="swap-token-select" value={fromToken} onChange={handleFromTokenChange}>
            {Object.keys(tokens).map((tk) => (
              <option key={tk} value={tk}>
                {tk}
              </option>
            ))}
          </select>

          <div className="swap-token-balance">
            {fromBalance === "Error" ? (
              <button className="swap-max-button" onClick={() => handleRequestViewingKey(tokens[fromToken])}>
                Get Viewing Key
              </button>
            ) : (
              <>
                Balance: {fromBalance ?? "..."}
                <button className="swap-max-button" onClick={handleMaxFromAmount}>
                  Max
                </button>
              </>
            )}
          </div>
        </div>

        <div className="swap-input-wrapper">
          <img src={tokens[fromToken].logo} alt={`${fromToken} logo`} className="swap-input-logo" />
          <input
            type="number"
            className="swap-token-input"
            placeholder="Amount"
            value={fromAmount}
            onChange={(e) => handleFromAmountChange(e.target.value)}
          />
        </div>
      </div>

      {/* TO (read‐only) */}
      <div className="swap-input-group">
        <div className="swap-label-wrapper">
          <label htmlFor="to-token" className="swap-input-label">
            To
          </label>
          <select id="to-token" className="swap-token-select" value={toToken} onChange={handleToTokenChange}>
            {Object.keys(tokens).map((tk) => (
              <option key={tk} value={tk}>
                {tk}
              </option>
            ))}
          </select>

          <div className="swap-token-balance">
            {toBalance === "Error" ? (
              <button className="swap-max-button" onClick={() => handleRequestViewingKey(tokens[toToken])}>
                Get Viewing Key
              </button>
            ) : (
              <>Balance: {toBalance ?? "..."}</>
            )}
          </div>
        </div>

        <div className="swap-input-wrapper">
          <img src={tokens[toToken].logo} alt={`${toToken} logo`} className="swap-input-logo" />
          <input
            type="number"
            className="swap-token-input"
            placeholder="Output amount"
            value={toAmount}
            disabled
            readOnly
          />
        </div>
      </div>

      {/* Swap Button */}
      <button className="swap-button" onClick={handleSwap} disabled={!fromAmount || fromAmount <= 0 || !toAmount}>
        Swap
      </button>

      {/* Details Toggle Button */}
      {fromAmount && toAmount && (
        <button className="swap-details-toggle" onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? "Hide Details" : "Show Details"}
          <span className={`caret-icon ${showDetails ? "open" : ""}`}>▼</span>
        </button>
      )}

      {/* Info & Notes */}
      {fromAmount && toAmount && (
        <div className={`swap-price-info ${showDetails ? "visible" : ""}`}>
          <p>
            <span>Rate:</span>
            <span>
              1 {fromToken} = {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} {toToken}
            </span>
          </p>
          <p>
            <span>Minimum received:</span>
            <span>
              {calculateMinimumReceived(toAmount, slippage)} {toToken}
            </span>
          </p>
          <p>
            <span>Price Impact:</span>
            <span className={parseFloat(priceImpact) > 3 ? "high-impact" : ""}>{priceImpact || "0.00"}%</span>
          </p>
          <div className="swap-slippage-tolerance">
            <label htmlFor="slippage" className="swap-slippage-label">
              Slippage Tolerance:
            </label>
            <div>
              <input
                id="slippage"
                type="number"
                className="swap-slippage-input"
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                min="0.1"
                max="50"
                step="0.1"
              />
              <span>%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwapTokens;
