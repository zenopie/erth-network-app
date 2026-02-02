import React, { useState, useEffect, useCallback } from "react";
import { querySnipBalance, query, snip, requestViewingKey } from "../utils/contractUtils";
import contracts from "../utils/contracts";
import tokens from "../utils/tokens";
import { calculateMinimumReceived } from "../utils/swapTokensUtils";
import { showLoadingScreen } from "../utils/uiUtils";
import { toMicroUnits } from "../utils/mathUtils";
import { fetchErthPrice, formatUSD } from "../utils/apiUtils";
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

  const [erthPrice, setErthPrice] = useState(null);
  const [fromUsd, setFromUsd] = useState(null);
  const [toUsd, setToUsd] = useState(null);
  const [priceImpact, setPriceImpact] = useState(null);

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

  // Fetch ERTH price for USD display
  useEffect(() => {
    const updateErthPrice = async () => {
      try {
        const priceData = await fetchErthPrice();
        setErthPrice(priceData.price);
      } catch (error) {
        console.error('Failed to fetch ERTH price:', error);
      }
    };
    updateErthPrice();
    const interval = setInterval(updateErthPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  // Query pool reserves for a token pair
  const getPoolReserves = useCallback(async (token) => {
    if (token === "ERTH" || !isKeplrConnected) return null;

    try {
      const msg = {
        query_user_info: {
          pools: [tokens[token].contract],
          user: window.secretjs.address,
        },
      };
      const result = await query(contracts.exchange.contract, contracts.exchange.hash, msg);
      const poolState = result[0]?.pool_info?.state;
      if (poolState) {
        return {
          erthReserve: Number(poolState.erth_reserve || 0),
          tokenReserve: Number(poolState.token_b_reserve || 0),
        };
      }
      return null;
    } catch (err) {
      console.error("[getPoolReserves] error:", err);
      return null;
    }
  }, [isKeplrConnected]);

  // Calculate price impact from pool reserves
  const calculatePriceImpact = useCallback(async (inputAmount, inputToken, outputToken) => {
    if (!inputAmount || parseFloat(inputAmount) <= 0) return null;

    try {
      // For swaps through ERTH, calculate impact on the relevant pool(s)
      const inputAmountMicro = toMicroUnits(parseFloat(inputAmount), tokens[inputToken]);

      if (inputToken === "ERTH") {
        // ERTH -> Token: impact on output token's pool
        const reserves = await getPoolReserves(outputToken);
        if (!reserves) return null;
        // Price impact = input / (input_reserve + input)
        const impact = (inputAmountMicro / (reserves.erthReserve + inputAmountMicro)) * 100;
        return impact;
      } else if (outputToken === "ERTH") {
        // Token -> ERTH: impact on input token's pool
        const reserves = await getPoolReserves(inputToken);
        if (!reserves) return null;
        const impact = (inputAmountMicro / (reserves.tokenReserve + inputAmountMicro)) * 100;
        return impact;
      } else {
        // Token -> Token: impact on both pools (A -> ERTH -> B)
        const fromReserves = await getPoolReserves(inputToken);
        const toReserves = await getPoolReserves(outputToken);
        if (!fromReserves || !toReserves) return null;

        // First leg: Token A -> ERTH
        const impactA = inputAmountMicro / (fromReserves.tokenReserve + inputAmountMicro);
        // Estimate ERTH output from first leg (simplified)
        const erthOutput = (fromReserves.erthReserve * inputAmountMicro) / (fromReserves.tokenReserve + inputAmountMicro);
        // Second leg: ERTH -> Token B
        const impactB = erthOutput / (toReserves.erthReserve + erthOutput);
        // Combined impact (approximate)
        const totalImpact = (1 - (1 - impactA) * (1 - impactB)) * 100;
        return totalImpact;
      }
    } catch (err) {
      console.error("[calculatePriceImpact] error:", err);
      return null;
    }
  }, [getPoolReserves]);

  // Get spot rate for a token (price per 1 token in ERTH, from pool reserves)
  const getSpotRate = useCallback(async (token) => {
    if (token === "ERTH") return 1;

    const reserves = await getPoolReserves(token);
    if (!reserves || reserves.tokenReserve === 0) return null;

    // Spot rate = ERTH reserve / Token reserve
    return reserves.erthReserve / reserves.tokenReserve;
  }, [getPoolReserves]);

  // Calculate USD values and price impact when amounts change
  useEffect(() => {
    const calculateValues = async () => {
      // Reset if no ERTH price
      if (!erthPrice) {
        setFromUsd(null);
        setToUsd(null);
        setPriceImpact(null);
        return;
      }

      // Calculate FROM USD using spot rate
      if (fromAmount && parseFloat(fromAmount) > 0) {
        const spotRate = await getSpotRate(fromToken);
        setFromUsd(spotRate ? parseFloat(fromAmount) * spotRate * erthPrice : null);

        // Calculate price impact
        const impact = await calculatePriceImpact(fromAmount, fromToken, toToken);
        setPriceImpact(impact);
      } else {
        setFromUsd(null);
        setPriceImpact(null);
      }

      // Calculate TO USD using spot rate of output token
      if (toAmount && parseFloat(toAmount) > 0) {
        const spotRate = await getSpotRate(toToken);
        setToUsd(spotRate ? parseFloat(toAmount) * spotRate * erthPrice : null);
      } else {
        setToUsd(null);
      }
    };

    calculateValues();
  }, [fromAmount, toAmount, fromToken, toToken, erthPrice, getSpotRate, calculatePriceImpact]);

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

      {/* Swap Section with overlapping toggle */}
      <div className={styles.swapSection}>
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
            <div className={styles.amountContainer}>
              <input
                type="number"
                className={styles.tokenInput}
                placeholder="0.0"
                value={fromAmount}
                onChange={(e) => handleFromAmountChange(e.target.value)}
              />
              <div className={styles.usdValue}>{formatUSD(fromUsd ?? 0)}</div>
            </div>
          </div>
        </div>

        {/* Toggle - overlapping */}
        <button className={styles.toggleButton} onClick={handleTogglePair} aria-label="Swap tokens">
          <i className="bx bx-transfer-alt" aria-hidden="true"></i>
        </button>

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
          <div className={styles.amountContainer}>
            <input type="number" className={styles.tokenInput} placeholder="0.0" value={toAmount} disabled readOnly />
            <div className={styles.usdValue}>{formatUSD(toUsd ?? 0)}</div>
          </div>
        </div>
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
      <button className={styles.detailsToggle} onClick={() => setShowDetails(!showDetails)}>
        {showDetails ? "Hide Details" : "Show Details"}
        <span className={`${styles.caretIcon} ${showDetails ? styles.caretIconOpen : ""}`}>▼</span>
      </button>

      <div className={`${styles.priceInfo} ${showDetails ? styles.priceInfoVisible : ""}`}>
        {fromAmount && toAmount && (
          <>
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
            {priceImpact !== null && (
              <p>
                <span>Price Impact:</span>
                <span className={priceImpact > 5 ? styles.highImpact : priceImpact > 1 ? styles.mediumImpact : ""}>
                  {priceImpact.toFixed(2)}%
                </span>
              </p>
            )}
          </>
        )}
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
    </div>
  );
};

export default SwapTokens;