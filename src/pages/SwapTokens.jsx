import React, { useState, useEffect, useCallback } from "react";
import * as dex from "../chain/dex";
import { balances } from "../chain/bank";
import { broadcast } from "../chain/tx";
import { UANML, UERTH } from "../chain/config";
import { TOKENS, minimumReceived, symbolOf, toMacro, toMicro, tokenInfo } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import { fetchCoingeckoPrice, formatUSD } from "../utils/apiUtils";
import useErthPrice from "../hooks/useErthPrice";
import StatusModal from "../components/StatusModal";
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
  const { isModalOpen, animationState, execute, closeModal } = useTransaction();

  const [fromDenom, setFromDenom] = useState(UANML);
  const [toDenom, setToDenom] = useState(UERTH);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");

  const [walletBalances, setWalletBalances] = useState({});
  const [slippage, setSlippage] = useState(1);
  const [showDetails, setShowDetails] = useState(false);
  const [pools, setPools] = useState([]);

  const erthPrice = useErthPrice();
  const [fromUsd, setFromUsd] = useState(null);
  const [toUsd, setToUsd] = useState(null);
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

  const usdValue = useCallback(
    async (denom, amount) => {
      if (!(parseFloat(amount) > 0)) return null;
      const info = tokenInfo(denom);
      if (info.coingeckoId) {
        const cg = await fetchCoingeckoPrice(info.coingeckoId);
        if (cg !== null) return parseFloat(amount) * cg;
      }
      if (!erthPrice) return null;
      const rate = spotRateInErth(denom);
      return rate ? parseFloat(amount) * rate * erthPrice : null;
    },
    [erthPrice, spotRateInErth],
  );

  /**
   * Price impact: how far the trade moves the pool(s) it touches. A token->token
   * swap crosses two pools, so the two impacts compound.
   */
  const calcPriceImpact = useCallback(
    (amount) => {
      const micro = toMicro(amount, fromDenom);
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
    (async () => {
      if (parseFloat(fromAmount) > 0) {
        setFromUsd(await usdValue(fromDenom, fromAmount));
        setPriceImpact(calcPriceImpact(fromAmount));
      } else {
        setFromUsd(null);
        setPriceImpact(null);
      }
      setToUsd(parseFloat(toAmount) > 0 ? await usdValue(toDenom, toAmount) : null);
    })();
  }, [fromAmount, toAmount, fromDenom, toDenom, usdValue, calcPriceImpact]);

  const handleFromAmountChange = async (val) => {
    setFromAmount(val);
    if (!(parseFloat(val) > 0)) {
      setToAmount("");
      return;
    }
    const outMicro = await dex.quoteSwap(toMicro(val, fromDenom), fromDenom, toDenom);
    setToAmount(outMicro ? toMacro(outMicro, toDenom).toFixed(6) : "");
  };

  const handleSwap = async () => {
    if (!isConnected || !(parseFloat(fromAmount) > 0) || !toAmount) return;
    execute(async () => {
      const minOut = toMicro(minimumReceived(toAmount, slippage), toDenom);
      await broadcast([
        dex.msgSwap(address, fromDenom, toMicro(fromAmount, fromDenom), toDenom, minOut),
      ]);
      setFromAmount("");
      setToAmount("");
      fetchBalances();
    });
  };

  const handleFromDenomChange = (e) => {
    const selected = e.target.value;
    if (selected === toDenom) setToDenom(fromDenom);
    setFromDenom(selected);
    setFromAmount("");
    setToAmount("");
  };

  const handleToDenomChange = (e) => {
    const selected = e.target.value;
    if (selected === fromDenom) setFromDenom(toDenom);
    setToDenom(selected);
    setFromAmount("");
    setToAmount("");
  };

  const handleTogglePair = () => {
    setFromDenom(toDenom);
    setToDenom(fromDenom);
    setFromAmount("");
    setToAmount("");
  };

  return (
    <div className={styles.container}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} />

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
                onClick={() => handleFromAmountChange(String(fromBalance))}
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
              <div className={styles.usdValue}>{formatUSD(fromUsd ?? 0)}</div>
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
              <div className={styles.usdValue}>{formatUSD(toUsd ?? 0)}</div>
            </div>
          </div>
        </div>
      </div>

      <button
        className={styles.primaryButton}
        onClick={handleSwap}
        disabled={!isConnected || !fromAmount || parseFloat(fromAmount) <= 0 || !toAmount}
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
                {minimumReceived(toAmount, slippage).toFixed(6)} {symbolOf(toDenom)}
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
