import React, { useState, useEffect, useMemo, useCallback } from "react";
import styles from "./Markets.module.css";
import * as dex from "../chain/dex";
import * as allocation from "../chain/allocation";
import { balances, supply } from "../chain/bank";
import { broadcast } from "../chain/tx";
import { UERTH } from "../chain/config";
import { symbolOf, toMacro, toMicro } from "../chain/tokens";
import StatusModal from "../components/StatusModal";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import { formatUSD } from "../utils/apiUtils";
import useErthPrice from "../hooks/useErthPrice";
import { formatPrice, formatCompact } from "../utils/formatUtils";
import Amount from "../components/Amount";
import { useDisplayCurrency } from "../contexts/DisplayCurrencyContext";

// The deflation stream emits a flat 1 ERTH/sec, split across allocation options
// by staker vote. Whatever share lands on the LP-rewards option is what funds
// LP yield, distributed across pools by their share of trading volume.
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

const Markets = () => {
  const { address, isConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, execute, closeModal } = useTransaction();

  const [pools, setPools] = useState([]);
  const [lpSupplies, setLpSupplies] = useState({}); // lpDenom -> total shares
  const [walletBalances, setWalletBalances] = useState({});
  const [lpRewardShare, setLpRewardShare] = useState(0); // 0..1 of the deflation stream
  const [refreshKey, setRefreshKey] = useState(0);
  const erthPrice = useErthPrice();

  // LP management state
  const [expandedPool, setExpandedPool] = useState(null);
  const [lpTab, setLpTab] = useState("Add");
  const [erthAmount, setErthAmount] = useState("");
  const [tokenBAmount, setTokenBAmount] = useState("");
  const [removeAmount, setRemoveAmount] = useState("");
  const { currency } = useDisplayCurrency();
  // In ERTH mode every value is already ERTH-denominated, so the rate is 1 and
  // nothing depends on the price feed. USD mode multiplies by the fetched price
  // — and is disabled precisely because that feed has nothing to report.
  const rate = currency === "USD" ? erthPrice : 1;

  const [sortBy, setSortBy] = useState("liquidityUsd");
  const [sortOrder, setSortOrder] = useState("desc");

  const refreshParent = () => setRefreshKey((p) => p + 1);

  // Pools, LP supplies and the LP-rewards share are all public chain reads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      showLoading();
      try {
        const [ps, options] = await Promise.all([
          dex.pools(),
          allocation.allocationOptions(allocation.STREAM_GROUNDWORKS),
        ]);
        if (cancelled) return;
        setPools(ps);

        const totalWeight = options.reduce((s, o) => s + Number(o.amountAllocated), 0);
        const lpOption = options.find((o) => o.kind === "ALLOCATION_KIND_INTEGRATED");
        setLpRewardShare(
          totalWeight > 0 && lpOption ? Number(lpOption.amountAllocated) / totalWeight : 0,
        );

        const supplies = await Promise.all(ps.map((p) => supply(p.lpDenom)));
        if (cancelled) return;
        setLpSupplies(Object.fromEntries(ps.map((p, i) => [p.lpDenom, supplies[i]])));
      } catch (err) {
        console.error("Error loading markets:", err);
      } finally {
        if (!cancelled) hideLoading();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const fetchBalances = useCallback(async () => {
    setWalletBalances(address ? await balances(address) : {});
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances, refreshKey]);

  const totalVolume = useMemo(
    () => pools.reduce((s, p) => s + Number(p.volume), 0),
    [pools],
  );

  const marketRows = useMemo(
    () =>
      pools.map((p) => {
        const erthReserve = toMacro(p.erthReserve, UERTH);
        const tokenReserve = toMacro(p.tokenReserve, p.tokenDenom);
        // A pool is half ERTH by construction, so TVL is twice the ERTH side.
        const tvlErth = erthReserve * 2;
        const liquidityUsd = tvlErth * (rate ?? 0);
        const volumeErth = toMacro(p.volume, UERTH);

        // This pool's slice of LP rewards is its share of chain-wide volume.
        const volumeShare = totalVolume > 0 ? Number(p.volume) / totalVolume : 0;
        const annualErth = SECONDS_PER_YEAR * lpRewardShare * volumeShare;
        const apr = tvlErth > 0 ? (annualErth / tvlErth) * 100 : 0;

        const price = tokenReserve > 0 ? (erthReserve / tokenReserve) * (rate ?? 0) : 0;

        const userShares = toMacro(walletBalances[p.lpDenom] ?? 0, p.lpDenom);
        const totalShares = toMacro(lpSupplies[p.lpDenom] ?? 0, p.lpDenom);
        const ownership = totalShares > 0 ? (userShares / totalShares) * 100 : 0;

        return {
          pool: p,
          key: p.tokenDenom,
          symbol: symbolOf(p.tokenDenom),
          price,
          volumeErth,
          liquidityUsd,
          tvlErth,
          apr,
          erthReserve,
          tokenReserve,
          userShares,
          totalShares,
          ownership,
          userErth: (erthReserve * ownership) / 100,
          userTokenB: (tokenReserve * ownership) / 100,
        };
      }),
    [pools, rate, totalVolume, lpRewardShare, walletBalances, lpSupplies],
  );

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
    else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const sortedRows = useMemo(
    () =>
      [...marketRows].sort((a, b) => {
        const av = a[sortBy] || 0;
        const bv = b[sortBy] || 0;
        return sortOrder === "desc" ? bv - av : av - bv;
      }),
    [marketRows, sortBy, sortOrder],
  );

  const totalTvlUsd = marketRows.reduce((s, r) => s + r.liquidityUsd, 0);
  const totalVolumeErth = marketRows.reduce((s, r) => s + r.volumeErth, 0);

  // ---- LP management ----

  const togglePool = (key) => {
    if (expandedPool === key) {
      setExpandedPool(null);
      return;
    }
    setExpandedPool(key);
    setLpTab("Add");
    setErthAmount("");
    setTokenBAmount("");
    setRemoveAmount("");
  };

  // Deposits must match the current pool ratio, so editing one side sets the other.
  const handleErthChange = (val, row) => {
    setErthAmount(val);
    const p = parseFloat(val);
    setTokenBAmount(
      Number.isFinite(p) && row.erthReserve > 0
        ? ((p * row.tokenReserve) / row.erthReserve).toFixed(6)
        : "",
    );
  };

  const handleTokenBChange = (val, row) => {
    setTokenBAmount(val);
    const p = parseFloat(val);
    setErthAmount(
      Number.isFinite(p) && row.tokenReserve > 0
        ? ((p * row.erthReserve) / row.tokenReserve).toFixed(6)
        : "",
    );
  };

  const handleAddLiquidity = (row) => {
    if (!isConnected) return;
    execute(async () => {
      await broadcast([
        dex.msgAddLiquidity(
          address,
          row.pool.id,
          UERTH,
          toMicro(erthAmount, UERTH),
          row.pool.tokenDenom,
          toMicro(tokenBAmount, row.pool.tokenDenom),
        ),
      ]);
      setErthAmount("");
      setTokenBAmount("");
      refreshParent();
    });
  };

  const handleRemoveLiquidity = (row) => {
    if (!isConnected) return;
    execute(async () => {
      await broadcast([
        dex.msgRemoveLiquidity(address, row.pool.id, toMicro(removeAmount, row.pool.lpDenom)),
      ]);
      setRemoveAmount("");
      refreshParent();
    });
  };

  const erthBalance = toMacro(walletBalances[UERTH] ?? 0, UERTH);

  return (
    <div className={styles.marketsPage}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} />

      {/* Header */}
      <div className={styles.marketsHeader}>
        <div className={styles.marketsHeaderLeft}>
          <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.marketsErthLogo} />
          <div>
            <span className={styles.marketsErthLabel}>ERTH Price</span>
            <span className={styles.marketsErthPrice}>{formatPrice(erthPrice)}</span>
          </div>
          <div className={styles.marketsHeaderStat}>
            <span className={styles.marketsErthLabel}>Total TVL</span>
            <span className={styles.marketsHeaderVal}><Amount value={totalTvlUsd} /></span>
          </div>
          <div className={styles.marketsHeaderStat}>
            <span className={styles.marketsErthLabel}>Volume</span>
            <span className={styles.marketsHeaderVal}>
              {rate ? <Amount value={totalVolumeErth * rate} /> : "--"}
            </span>
          </div>
        </div>
        <div className={styles.marketsHeaderRight}>
          {/* LP rewards auto-compound into each pool's reserves, so there is
              nothing to claim — your share simply grows in redemption value. */}
          <span className={styles.marketsCountdown}>LP rewards auto-compound</span>
        </div>
      </div>

      {/* Column headers */}
      <div className={styles.poolRowHeader}>
        <div className={styles.poolHeaderPair}>Pair</div>
        <div className={styles.poolRowStats}>
          <div className={styles.poolRowStat}>
            <button
              className={`${styles.poolHeaderLabel} ${sortBy === "liquidityUsd" ? styles.active : ""}`}
              onClick={() => handleSort("liquidityUsd")}
            >
              Liquidity {sortBy === "liquidityUsd" && (sortOrder === "desc" ? "↓" : "↑")}
            </button>
          </div>
          <div className={styles.poolRowStat}>
            <button
              className={`${styles.poolHeaderLabel} ${sortBy === "volumeErth" ? styles.active : ""}`}
              onClick={() => handleSort("volumeErth")}
            >
              Volume {sortBy === "volumeErth" && (sortOrder === "desc" ? "↓" : "↑")}
            </button>
          </div>
          <div className={styles.poolRowStat}>
            <button
              className={`${styles.poolHeaderLabel} ${sortBy === "apr" ? styles.active : ""}`}
              onClick={() => handleSort("apr")}
            >
              APR {sortBy === "apr" && (sortOrder === "desc" ? "↓" : "↑")}
            </button>
          </div>
        </div>
        <div className={styles.poolRowActionsPlaceholder}></div>
      </div>

      {/* Pool cards */}
      {sortedRows.map((row) => {
        const isExpanded = expandedPool === row.key;
        const tokenBalance = toMacro(walletBalances[row.pool.tokenDenom] ?? 0, row.pool.tokenDenom);

        return (
          <div className={styles.poolCard} key={row.key}>
            <div className={styles.poolRowTop}>
              <div className={styles.poolRowPair}>
                <img
                  src={`/images/coin/${row.symbol}.png`}
                  alt={row.symbol}
                  className={styles.poolRowLogo}
                />
                <div>
                  <div className={styles.poolRowName}>
                    <span className={styles.poolRowToken}>{row.symbol}</span>
                    <span className={styles.poolRowSlash}>/ ERTH</span>
                  </div>
                  <span className={styles.poolRowPrice}>{formatPrice(row.price)}</span>
                </div>
              </div>
              <div className={styles.poolRowStats}>
                <div className={styles.poolRowStat}>
                  <span className={styles.poolRowStatVal}><Amount value={row.liquidityUsd} /></span>
                  <span className={styles.poolRowStatLabel}>Liquidity</span>
                </div>
                <div className={styles.poolRowStat}>
                  <span className={styles.poolRowStatVal}>
                    {row.volumeErth > 0 && rate ? <Amount value={row.volumeErth * rate} /> : "--"}
                  </span>
                  <span className={styles.poolRowStatLabel}>Volume</span>
                </div>
                <div className={styles.poolRowStat}>
                  <span className={`${styles.poolRowStatVal} ${row.apr > 0 ? styles.green : ""}`}>
                    {row.apr > 0 ? `${row.apr.toFixed(1)}%` : "--"}
                  </span>
                  <span className={styles.poolRowStatLabel}>APR</span>
                </div>
              </div>
              <div className={styles.poolRowActions}>
                <a href="/swap-tokens" className={`${styles.poolRowBtn} ${styles.primary}`}>
                  Trade
                </a>
                <button
                  className={`${styles.poolRowBtn} ${styles.secondary}`}
                  onClick={() => togglePool(row.key)}
                >
                  {isExpanded ? "Close" : "+ LP"}
                </button>
              </div>
            </div>

            {/* Expanded LP section */}
            {isExpanded && (
              <div className={styles.poolExpand}>
                <div className={styles.poolExpandCols}>
                  <div className={styles.poolExpandInfo}>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>ERTH Reserve</span>
                      <span className={styles.lpInfoVal}>
                        {row.erthReserve.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>{row.symbol} Reserve</span>
                      <span className={styles.lpInfoVal}>
                        {row.tokenReserve.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>Total Shares</span>
                      <span className={styles.lpInfoVal}>{row.totalShares.toLocaleString()}</span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>Your Shares</span>
                      <span className={styles.lpInfoVal}>{row.userShares.toLocaleString()}</span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>Ownership</span>
                      <span className={styles.lpInfoVal}>{row.ownership.toFixed(4)}%</span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>APR</span>
                      <span className={`${styles.lpInfoVal} ${styles.green}`}>
                        {row.apr > 0 ? `${row.apr.toFixed(1)}%` : "--"}
                      </span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>Your ERTH Value</span>
                      <span className={styles.lpInfoVal}>{row.userErth.toFixed(4)}</span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>Your {row.symbol} Value</span>
                      <span className={styles.lpInfoVal}>{row.userTokenB.toFixed(4)}</span>
                    </div>
                  </div>

                  <div className={styles.poolExpandActions}>
                    <div className={styles.lpTabs}>
                      {["Add", "Remove"].map((t) => (
                        <button
                          key={t}
                          className={`${styles.lpTab} ${lpTab === t ? styles.active : ""}`}
                          onClick={() => setLpTab(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    {lpTab === "Add" && (
                      <div className={styles.lpContent}>
                        <div className={styles.lpInputGroup}>
                          <div className={styles.lpInputHeader}>
                            <label>{row.symbol}</label>
                            <span className={styles.lpBalance}>
                              Bal: {tokenBalance.toLocaleString()}{" "}
                              <button
                                className={styles.lpMaxBtn}
                                onClick={() => handleTokenBChange(String(tokenBalance), row)}
                              >
                                Max
                              </button>
                            </span>
                          </div>
                          <div className={styles.lpInputWrapper}>
                            <img
                              src={`/images/coin/${row.symbol}.png`}
                              alt={row.symbol}
                              className={styles.lpInputLogo}
                            />
                            <div className={styles.lpInputInner}>
                              <input
                                type="number"
                                placeholder="0.0"
                                value={tokenBAmount}
                                onChange={(e) => handleTokenBChange(e.target.value, row)}
                                className={styles.lpInput}
                              />
                              <span className={styles.lpInputUsd}>
                                {tokenBAmount && row.price
                                  ? formatUSD(parseFloat(tokenBAmount) * row.price)
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className={styles.lpInputGroup}>
                          <div className={styles.lpInputHeader}>
                            <label>ERTH</label>
                            <span className={styles.lpBalance}>
                              Bal: {erthBalance.toLocaleString()}{" "}
                              <button
                                className={styles.lpMaxBtn}
                                onClick={() => handleErthChange(String(erthBalance), row)}
                              >
                                Max
                              </button>
                            </span>
                          </div>
                          <div className={styles.lpInputWrapper}>
                            <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.lpInputLogo} />
                            <div className={styles.lpInputInner}>
                              <input
                                type="number"
                                placeholder="0.0"
                                value={erthAmount}
                                onChange={(e) => handleErthChange(e.target.value, row)}
                                className={styles.lpInput}
                              />
                              <span className={styles.lpInputUsd}>
                                {erthAmount && erthPrice
                                  ? formatUSD(parseFloat(erthAmount) * erthPrice)
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          className={styles.lpActionBtn}
                          onClick={() => handleAddLiquidity(row)}
                          disabled={
                            !isConnected ||
                            !(parseFloat(erthAmount) > 0 && parseFloat(tokenBAmount) > 0) ||
                            parseFloat(erthAmount) > erthBalance ||
                            parseFloat(tokenBAmount) > tokenBalance
                          }
                        >
                          Add Liquidity
                        </button>
                      </div>
                    )}

                    {lpTab === "Remove" && (
                      <div className={styles.lpContent}>
                        <div className={styles.lpInputGroup}>
                          <div className={styles.lpInputHeader}>
                            <label>Shares</label>
                            <span className={styles.lpBalance}>
                              Bal: {row.userShares.toLocaleString()}{" "}
                              <button
                                className={styles.lpMaxBtn}
                                onClick={() => setRemoveAmount(String(row.userShares))}
                              >
                                Max
                              </button>
                            </span>
                          </div>
                          <div className={styles.lpInputWrapper}>
                            <div className={styles.lpInputInner} style={{ paddingLeft: 16 }}>
                              <input
                                type="number"
                                placeholder="0.0"
                                value={removeAmount}
                                onChange={(e) => setRemoveAmount(e.target.value)}
                                className={styles.lpInput}
                              />
                            </div>
                          </div>
                        </div>
                        <button
                          className={styles.lpActionBtn}
                          onClick={() => handleRemoveLiquidity(row)}
                          disabled={
                            !isConnected ||
                            !parseFloat(removeAmount) ||
                            parseFloat(removeAmount) > row.userShares
                          }
                        >
                          Remove Liquidity
                        </button>
                        {/* Native LP shares redeem immediately — no unbonding queue. */}
                        <p className={styles.lpNote}>Tokens are returned immediately</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Markets;
