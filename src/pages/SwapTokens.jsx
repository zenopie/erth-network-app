import React, { useState, useEffect, useCallback, useRef } from "react";
import * as dex from "../chain/dex";
import { balances } from "../chain/bank";
import { broadcast } from "../chain/tx";
import { UANML, UERTH } from "../chain/config";
import {
  TOKENS,
  clampSlippage,
  formatUnits,
  minimumReceived,
  symbolOf,
  toMacro,
  toMicro,
  tokenInfo,
} from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import useErthPrice from "../hooks/useErthPrice";
import StatusModal from "../components/StatusModal";
import Amount from "../components/Amount";
import { useDisplayCurrency } from "../contexts/DisplayCurrencyContext";
import styles from "./SwapTokens.module.css";

/**
 * Token swaps against x/dex.
 *
 * ERTH is the chain's native gas coin, so there is no wrapped-token dance here:
 * the Secret build had to wrap SCRT into sSCRT and route swaps through SNIP-20
 * send-hooks, whereas on earth a swap is a single MsgSwap over bank denoms.
 * ERTH is also the AMM hub, so a token->token swap routes through it on-chain.
 */
const SwapTokens = () => {
  const { address, isConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, error: txError, execute, closeModal } = useTransaction();

  const [fromDenom, setFromDenom] = useState(UANML);
  const [toDenom, setToDenom] = useState(UERTH);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  // The quote behind toAmount, in whole base units. The swap's floor is taken
  // from this, not from the six-decimal display string.
  const [quoteMicro, setQuoteMicro] = useState("0");
  // Bumped by every edit that invalidates a quote in flight. A quote that
  // comes back to a different number than it left with is dropped: quotes
  // are async, and a slow one for an old amount used to land after a newer
  // one and set the minimum output for a trade the user was no longer making.
  const quoteSeq = useRef(0);

  const [walletBalances, setWalletBalances] = useState({});
  const [slippage, setSlippage] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [pools, setPools] = useState([]);

  const erthPrice = useErthPrice();
  const { currency } = useDisplayCurrency();
  // The secondary figure under each input, in whatever unit is on display.
  const [fromValue, setFromValue] = useState(null);
  const [toValue, setToValue] = useState(null);
  const [priceImpact, setPriceImpact] = useState(null);

  // Swappable denoms: ERTH (the hub) plus every spoke token that has a pool.
  const denomOptions = [UERTH, ...pools.map((p) => p.tokenDenom)];

  const fromBalance = toMacro(walletBalances[fromDenom] ?? 0, fromDenom);
  const toBalance = toMacro(walletBalances[toDenom] ?? 0, toDenom);

  // Pools are public, so quotes work before a wallet is connected.
  useEffect(() => {
    (async () => {
      showLoading();
      try {
        setPools(await dex.pools());
      } finally {
        hideLoading();
      }
    })();
  }, []);

  const fetchBalances = useCallback(async () => {
    if (!address) {
      setWalletBalances({});
      return;
    }
    setWalletBalances(await balances(address));
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  /** Spot price of a denom in ERTH, from pool reserves. */
  const spotRateInErth = useCallback(
    (denom) => {
      if (denom === UERTH) return 1;
      const p = pools.find((x) => x.tokenDenom === denom);
      if (!p || Number(p.tokenReserve) === 0) return null;
      return Number(p.erthReserve) / Number(p.tokenReserve);
    },
    [pools],
  );

  /**
   * What an amount is worth, in the unit currently on display.
   *
   * Everything is priced through the pools, which is the only source that
   * cannot disagree with the swap the page is about to execute. ERTH therefore
   * needs nothing else and is always available; USD additionally needs a price
   * for ERTH, which the chain cannot give until there is a pool against a
   * dollar-denominated asset — so it can come back null, and the caller has to
   * render nothing rather than a zero.
   *
   * This page used to compute the USD branch unconditionally and print
   * `formatUSD(value ?? 0)`, which turned "no price exists" into a confident
   * "$0.00" under every input, in ERTH mode included.
   */
  const displayValue = useCallback(
    (denom, amount) => {
      if (!(parseFloat(amount) > 0)) return null;
      const rate = spotRateInErth(denom);
      if (!rate) return null;

      const inErth = parseFloat(amount) * rate;
      if (currency === "ERTH") return inErth;
      return erthPrice ? inErth * erthPrice : null;
    },
    [currency, erthPrice, spotRateInErth],
  );

  /**
   * Price impact: how far the trade moves the pool(s) it touches. A token->token
   * swap crosses two pools, so the two impacts compound.
   */
  const calcPriceImpact = useCallback(
    (amount) => {
      const micro = Number(toMicro(amount, fromDenom));
      if (!micro) return null;

      if (fromDenom === UERTH) {
        const p = pools.find((x) => x.tokenDenom === toDenom);
        return p ? (micro / (Number(p.erthReserve) + micro)) * 100 : null;
      }
      if (toDenom === UERTH) {
        const p = pools.find((x) => x.tokenDenom === fromDenom);
        return p ? (micro / (Number(p.tokenReserve) + micro)) * 100 : null;
      }
      const pIn = pools.find((x) => x.tokenDenom === fromDenom);
      const pOut = pools.find((x) => x.tokenDenom === toDenom);
      if (!pIn || !pOut) return null;
      const impactA = micro / (Number(pIn.tokenReserve) + micro);
      const erthOut = (Number(pIn.erthReserve) * micro) / (Number(pIn.tokenReserve) + micro);
      const impactB = erthOut / (Number(pOut.erthReserve) + erthOut);
      return (1 - (1 - impactA) * (1 - impactB)) * 100;
    },
    [pools, fromDenom, toDenom],
  );

  useEffect(() => {
    if (parseFloat(fromAmount) > 0) {
      setFromValue(displayValue(fromDenom, fromAmount));
      setPriceImpact(calcPriceImpact(fromAmount));
    } else {
      setFromValue(null);
      setPriceImpact(null);
    }
    setToValue(parseFloat(toAmount) > 0 ? displayValue(toDenom, toAmount) : null);
  }, [fromAmount, toAmount, fromDenom, toDenom, displayValue, calcPriceImpact]);

  const clearAmounts = () => {
    quoteSeq.current += 1;
    setFromAmount("");
    setToAmount("");
    setQuoteMicro("0");
  };

  const handleFromAmountChange = async (val) => {
    const seq = ++quoteSeq.current;
    setFromAmount(val);
    setToAmount("");
    setQuoteMicro("0");
    if (!(parseFloat(val) > 0)) return;
    const outMicro = await dex.quoteSwap(toMicro(val, fromDenom), fromDenom, toDenom);
    if (seq !== quoteSeq.current) return;
    // quoteHop is floating point; floor it so the floor is never above the
    // pool's integer payout.
    const whole = outMicro > 0 ? BigInt(Math.floor(outMicro)).toString() : "0";
    setQuoteMicro(whole);
    setToAmount(whole !== "0" ? formatUnits(whole, toDenom) : "");
  };

  const minOut = minimumReceived(quoteMicro, slippage);

  const handleSwap = async () => {
    if (!isConnected || !(parseFloat(fromAmount) > 0) || minOut === "0") return;
    execute(async () => {
      await broadcast([
        dex.msgSwap(address, fromDenom, toMicro(fromAmount, fromDenom), toDenom, minOut),
      ]);
      clearAmounts();
      fetchBalances();
    });
  };

  const handleFromDenomChange = (e) => {
    const selected = e.target.value;
    if (selected === toDenom) setToDenom(fromDenom);
    setFromDenom(selected);
    clearAmounts();
  };

  const handleToDenomChange = (e) => {
    const selected = e.target.value;
    if (selected === fromDenom) setFromDenom(toDenom);
    setToDenom(selected);
    clearAmounts();
  };

  const handleTogglePair = () => {
    setFromDenom(toDenom);
    setToDenom(fromDenom);
    clearAmounts();
  };

  return (
    <div className={styles.container}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} />

      <div className={styles.titleContainer}>
        <h2 className={styles.title}>Swap Tokens</h2>
      </div>

      <div className={styles.swapSection}>
        {/* FROM */}
        <div className={styles.inputGroup}>
          <div className={styles.labelRow}>
            <label className={styles.inputLabel}>From</label>
            <div className={styles.balance}>
              Balance: {isConnected ? fromBalance.toLocaleString() : "—"}
              <button
                className={styles.maxButton}
                onClick={() => handleFromAmountChange(formatUnits(walletBalances[fromDenom] ?? 0, fromDenom))}
              >
                Max
              </button>
            </div>
          </div>

          <div className={styles.inputWrapper}>
            <img
              src={tokenInfo(fromDenom).logo ?? TOKENS[UERTH].logo}
              alt={`${symbolOf(fromDenom)} logo`}
              className={styles.inputLogo}
            />
            <select className={styles.tokenSelect} value={fromDenom} onChange={handleFromDenomChange}>
              {denomOptions.map((d) => (
                <option key={d} value={d}>
                  {symbolOf(d)}
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
              {/* Nothing at all when the unit on display has no price, rather
                  than a zero that reads as "this is worthless". */}
              <div className={styles.quoteValue}>
                {fromValue !== null && <Amount value={fromValue} mode="price" />}
              </div>
            </div>
          </div>
        </div>

        <button className={styles.toggleButton} onClick={handleTogglePair} aria-label="Swap tokens">
          <i className="bx bx-transfer-alt" aria-hidden="true"></i>
        </button>

        {/* TO (read-only) */}
        <div className={styles.inputGroup}>
          <div className={styles.labelRow}>
            <label className={styles.inputLabel}>To</label>
            <div className={styles.balance}>Balance: {isConnected ? toBalance.toLocaleString() : "—"}</div>
          </div>

          <div className={styles.inputWrapper}>
            <img
              src={tokenInfo(toDenom).logo ?? TOKENS[UERTH].logo}
              alt={`${symbolOf(toDenom)} logo`}
              className={styles.inputLogo}
            />
            <select className={styles.tokenSelect} value={toDenom} onChange={handleToDenomChange}>
              {denomOptions.map((d) => (
                <option key={d} value={d}>
                  {symbolOf(d)}
                </option>
              ))}
            </select>
            <div className={styles.amountContainer}>
              <input
                type="number"
                className={styles.tokenInput}
                placeholder="0.0"
                value={toAmount}
                disabled
                readOnly
              />
              <div className={styles.quoteValue}>
                {toValue !== null && <Amount value={toValue} mode="price" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        className={styles.primaryButton}
        onClick={handleSwap}
        disabled={!isConnected || !fromAmount || parseFloat(fromAmount) <= 0 || minOut === "0"}
      >
        {isConnected ? "Swap" : "Connect Wallet to Swap"}
      </button>

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
                1 {symbolOf(fromDenom)} = {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)}{" "}
                {symbolOf(toDenom)}
              </span>
            </p>
            <p>
              <span>Minimum received:</span>
              <span>
                {formatUnits(minOut, toDenom)} {symbolOf(toDenom)}
              </span>
            </p>
            {priceImpact !== null && (
              <p>
                <span>Price Impact:</span>
                <span
                  className={
                    priceImpact > 5 ? styles.highImpact : priceImpact > 1 ? styles.mediumImpact : ""
                  }
                >
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
              onBlur={() => setSlippage(clampSlippage(slippage))}
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
