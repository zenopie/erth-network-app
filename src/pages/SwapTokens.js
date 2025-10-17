import React, { useState, useEffect, useCallback } from "react";
import { querySnipBalance, query, snip, requestViewingKey } from "../utils/contractUtils";
import contracts from "../utils/contracts";
import tokens from "../utils/tokens";
import { calculateMinimumReceived } from "../utils/swapTokensUtils";
import { showLoadingScreen } from "../utils/uiUtils";
import { toMicroUnits } from "../utils/mathUtils";
import StatusModal from "../components/StatusModal";
import styles from "./SwapTokens.module.css";

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

  // Fetch balances
  const fetchData = useCallback(async (refetch = false) => {
    if (!isKeplrConnected) {
      console.warn("Keplr not connected");
      return;
    }
    if (!refetch) showLoadingScreen(true);
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
      if (!refetch) showLoadingScreen(false);
    }
  }, [isKeplrConnected, fromToken, toToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Simulate swap output
  const simulateSwapQuery = async (inputAmount, fromTk, toTk) => {
    if (!isKeplrConnected) return "";
    if (!inputAmount) return "";
    try {
      const amountInMicro = toMicroUnits(parseFloat(inputAmount), tokens[fromTk]);
      const simulateMsg = {
        simulate_swap: {
          input_token: tokens[fromTk].contract,
          amount: amountInMicro.toString(),
          output_token: tokens[toTk].contract,
        },
      };
      const result = await query(contracts.exchange.contract, contracts.exchange.hash, simulateMsg);
      const out = result.output_amount;
      const decimals = tokens[toTk].decimals || 6;
      const outNumber = parseFloat(out) / 10 ** decimals;
      return outNumber.toFixed(6);
    } catch (err) {
      console.error("[simulateSwapQuery] error:", err);
      return "";
    }
  };

  const handleFromAmountChange = async (val) => {
    setFromAmount(val);
    if (!val || isNaN(val) || parseFloat(val) <= 0) {
      setToAmount("");
      return;
    }
    const simulated = await simulateSwapQuery(val, fromToken, toToken);
    if (simulated) setToAmount(simulated);
  };

  // Execute swap
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
      const minReceived = calculateMinimumReceived(toAmount, slippage);
      const inputInMicro = toMicroUnits(inputAmount, tokens[fromToken]);
      const minInMicro = toMicroUnits(minReceived, tokens[toToken]);
      const snipMsg = {
        swap: {
          output_token: tokens[toToken].contract,
          min_received: minInMicro.toString(),
        },
      };
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
    } catch (err) {
      console.error("[handleSwap] error:", err);
      setAnimationState("error");
    } finally {
      fetchData(true);
    }
  };

  // Token handlers
  const handleFromTokenChange = (e) => {
    const selected = e.target.value;
    if (selected === toToken) setToToken(fromToken);
    setFromToken(selected);
    setFromAmount("");
    setToAmount("");
  };

  const handleToTokenChange = (e) => {
    const selected = e.target.value;
    if (selected === fromToken) setFromToken(toToken);
    setToToken(selected);
    setFromAmount("");
    setToAmount("");
  };

  const handleTogglePair = () => {
    const prevFrom = fromToken;
    const prevTo = toToken;
    setFromToken(prevTo);
    setToToken(prevFrom);
    setFromAmount("");
    setToAmount("");
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

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  if (!isKeplrConnected) {
    return <div className={styles.errorMessage}>Connect Keplr first</div>;
  }

  return (
    <div className={styles.container}>
      <StatusModal isOpen={isModalOpen} onClose={handleModalClose} animationState={animationState} />

      <div className={styles.titleContainer}>
        <h2 className={styles.title}>Swap Tokens</h2>
      </div>

      {/* FROM */}
      <div className={styles.inputGroup}>
        <div className={styles.labelRow}>
          <label className={styles.inputLabel}>From</label>
          <div className={styles.balance}>
            {fromBalance === "Error" ? (
              <button className={styles.vkButton} onClick={() => handleRequestViewingKey(tokens[fromToken])}>
                Get Viewing Key
              </button>
            ) : (
              <>
                Balance: {fromBalance ?? "..."}
                <button className={styles.maxButton} onClick={handleMaxFromAmount}>
                  Max
                </button>
              </>
            )}
          </div>
        </div>

        <div className={styles.inputWrapper}>
          <img src={tokens[fromToken].logo} alt={`${fromToken} logo`} className={styles.inputLogo} />
          <select className={styles.tokenSelect} value={fromToken} onChange={handleFromTokenChange}>
            {Object.keys(tokens).map((tk) => (
              <option key={tk} value={tk}>
                {tk}
              </option>
            ))}
          </select>
          <input
            type="number"
            className={styles.tokenInput}
            placeholder="0.0"
            value={fromAmount}
            onChange={(e) => handleFromAmountChange(e.target.value)}
          />
        </div>
      </div>

      {/* Toggle */}
      <div className={styles.toggleContainer}>
        <button className={styles.toggleButton} onClick={handleTogglePair} aria-label="Swap tokens">
          <i className="bx bx-refresh" aria-hidden="true"></i>
        </button>
      </div>

      {/* TO (read-only) */}
      <div className={styles.inputGroup}>
        <div className={styles.labelRow}>
          <label className={styles.inputLabel}>To</label>
          <div className={styles.balance}>
            {toBalance === "Error" ? (
              <button className={styles.vkButton} onClick={() => handleRequestViewingKey(tokens[toToken])}>
                Get Viewing Key
              </button>
            ) : (
              <>Balance: {toBalance ?? "..."}</>
            )}
          </div>
        </div>

        <div className={styles.inputWrapper}>
          <img src={tokens[toToken].logo} alt={`${toToken} logo`} className={styles.inputLogo} />
          <select className={styles.tokenSelect} value={toToken} onChange={handleToTokenChange}>
            {Object.keys(tokens).map((tk) => (
              <option key={tk} value={tk}>
                {tk}
              </option>
            ))}
          </select>
          <input type="number" className={styles.tokenInput} placeholder="0.0" value={toAmount} disabled readOnly />
        </div>
      </div>

      {/* Action */}
      <button
        className={styles.primaryButton}
        onClick={handleSwap}
        disabled={!fromAmount || parseFloat(fromAmount) <= 0 || !toAmount}
      >
        Swap
      </button>

      {/* Details */}
      {fromAmount && toAmount && (
        <>
          <button className={styles.detailsToggle} onClick={() => setShowDetails(!showDetails)}>
            {showDetails ? "Hide Details" : "Show Details"}
            <span className={`${styles.caretIcon} ${showDetails ? styles.caretIconOpen : ""}`}>▼</span>
          </button>

          <div className={`${styles.priceInfo} ${showDetails ? styles.priceInfoVisible : ""}`}>
            <p>
              <span>Rate:</span>
              <span>
                1 {fromToken} = {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} {toToken}
              </span>
            </p>
            <p>
              <span>Minimum received:</span>
              <span>
                {parseFloat(calculateMinimumReceived(toAmount, slippage)).toFixed(tokens[toToken].decimals)} {toToken}
              </span>
            </p>
            <div className={styles.slippageTolerance}>
              <label htmlFor="slippage" className={styles.slippageLabel}>
                Slippage Tolerance:
              </label>
              <div>
                <input
                  id="slippage"
                  type="number"
                  className={styles.slippageInput}
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
        </>
      )}
    </div>
  );
};

export default SwapTokens;