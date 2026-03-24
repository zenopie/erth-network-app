import React, { useState, useEffect, useMemo } from "react";
import styles from "./Markets.module.css";
import tokens from "../utils/tokens";
import { query, contract, getQueryAddress, querySnipBalance, provideLiquidity, requestViewingKey } from "../utils/contractUtils";
import contracts from "../utils/contracts";
import StatusModal from "../components/StatusModal";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import { toMicroUnits, toMacroUnits } from "../utils/mathUtils";
import { ERTH_API_BASE_URL } from "../utils/config";
import useErthPrice from "../hooks/useErthPrice";
import { formatPrice, formatCompact } from "../utils/formatUtils";

const ANALYTICS_URL = `${ERTH_API_BASE_URL}/analytics`;
const TICKERS_URL = `${ERTH_API_BASE_URL}/tickers`;
const UNBOND_SECONDS = 7 * 24 * 60 * 60;

const Markets = () => {
  const { isKeplrConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, execute, closeModal } = useTransaction();

  const [allPoolsData, setAllPoolsData] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const erthPrice = useErthPrice();
  const [countdown, setCountdown] = useState("");
  const [tickers, setTickers] = useState([]);
  const [analyticsLatest, setAnalyticsLatest] = useState(null);

  // LP management state
  const [expandedPool, setExpandedPool] = useState(null);
  const [lpTab, setLpTab] = useState("Add");
  const [erthAmount, setErthAmount] = useState("");
  const [tokenBAmount, setTokenBAmount] = useState("");
  const [removeAmount, setRemoveAmount] = useState("");
  const [erthBalance, setErthBalance] = useState(null);
  const [tokenBBalance, setTokenBBalance] = useState(null);
  const [unbondRequests, setUnbondRequests] = useState([]);
  const [sortBy, setSortBy] = useState("liquidityUsd");
  const [sortOrder, setSortOrder] = useState("desc");

  // Countdown
  useEffect(() => {
    const tick = () => {
      const now = new Date(), t = new Date(now);
      t.setUTCHours(0,0,0,0);
      if (now >= t) t.setUTCDate(t.getUTCDate()+1);
      const d = t - now;
      setCountdown(`${String(Math.floor(d/3600000)).padStart(2,'0')}:${String(Math.floor((d%3600000)/60000)).padStart(2,'0')}:${String(Math.floor((d%60000)/1000)).padStart(2,'0')}`);
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, []);

  const tokenKeys = useMemo(() => Object.keys(tokens).filter(t => t !== "ERTH"), []);

  // Tickers + analytics
  useEffect(() => {
    const f = () => Promise.all([
      fetch(ANALYTICS_URL).then(r => r.ok ? r.json() : null),
      fetch(TICKERS_URL).then(r => r.ok ? r.json() : null),
    ]).then(([a,t]) => { if(a?.latest) setAnalyticsLatest(a.latest); if(t) setTickers(t); }).catch(console.error);
    f(); const id = setInterval(f, 60000); return () => clearInterval(id);
  }, []);

  // Pool data
  useEffect(() => {
    const ex = contracts.exchange?.contract;
    const pools = tokenKeys.map(k => tokens[k]?.contract).filter(Boolean);
    if (!pools.length || !ex) return;
    let cancelled = false;
    showLoading();
    query(ex, contracts.exchange.hash, { query_user_info: { pools, user: getQueryAddress() } })
      .then(res => {
        if (cancelled) return;
        const d = {};
        tokenKeys.forEach((k,i) => { d[k] = {...res[i], tokenKey: k}; });
        setAllPoolsData(d);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) hideLoading(); });
    return () => { cancelled = true; hideLoading(); };
  }, [isKeplrConnected, refreshKey, tokenKeys, showLoading, hideLoading]);

  const tickerByToken = useMemo(() => {
    if (!tickers.length || !analyticsLatest?.pools) return {};
    const sp = [...analyticsLatest.pools].sort((a,b) => b.tvl - a.tvl);
    const st = [...tickers].sort((a,b) => parseFloat(b.liquidity_in_usd) - parseFloat(a.liquidity_in_usd));
    const m = {};
    st.forEach((t,i) => { const p = sp[i]; if(p) m[p.token] = { tokenPriceUsd: p.tokenPrice||0, liquidityUsd: parseFloat(t.liquidity_in_usd), arbDepth: p.arbDepth||0 }; });
    return m;
  }, [tickers, analyticsLatest]);

  const marketRows = useMemo(() => tokenKeys.map(key => {
    const t = tickerByToken[key], pd = allPoolsData[key], st = pd?.pool_info?.state, ui = pd?.user_info;
    const erthRes = toMacroUnits(Number(st?.erth_reserve||0), tokens.ERTH);
    const tvl = erthRes * 2;
    const volume7d = toMacroUnits((st?.daily_volumes||[]).slice(0,7).reduce((a,v) => a+Number(v), 0), tokens.ERTH);
    const weekRewards = toMacroUnits((st?.daily_rewards||[]).slice(0,7).reduce((a,v) => a+Number(v), 0), tokens.ERTH);
    const apr = tvl > 0 ? (weekRewards/tvl) * 52 * 100 : 0;
    const userRewards = toMacroUnits(ui?.pending_rewards||0, tokens.ERTH);
    return { key, price: t?.tokenPriceUsd||0, volume7d, liquidityUsd: t?.liquidityUsd||(tvl*(erthPrice||0)), arbDepth: t?.arbDepth||0, tvl, apr, userRewards, poolData: pd };
  }), [tokenKeys, tickerByToken, allPoolsData, erthPrice]);

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(o => o === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortOrder("desc"); }
  };

  const sortedRows = useMemo(() => [...marketRows].sort((a, b) => {
    const av = a[sortBy]||0, bv = b[sortBy]||0;
    return sortOrder === "desc" ? bv - av : av - bv;
  }), [marketRows, sortBy, sortOrder]);

  const totalRewards = marketRows.reduce((s,r) => s + r.userRewards, 0);
  const totalTvlUsd = marketRows.reduce((s,r) => s + r.liquidityUsd, 0);
  const totalVolume7d = marketRows.reduce((s,r) => s + r.volume7d, 0);

  const refreshParent = () => setRefreshKey(p => p+1);

  // ---- LP Management ----
  const togglePool = (key) => {
    if (expandedPool === key) { setExpandedPool(null); return; }
    setExpandedPool(key);
    setLpTab("Add");
    setErthAmount(""); setTokenBAmount(""); setRemoveAmount("");
    setErthBalance(null); setTokenBBalance(null); setUnbondRequests([]);
    // Fetch balances and unbond requests for this pool
    if (isKeplrConnected) {
      fetchBalances(key);
      fetchUnbonds(key);
    }
  };

  const fetchBalances = async (key) => {
    try {
      const eb = await querySnipBalance(tokens.ERTH);
      setErthBalance(eb);
      const tb = await querySnipBalance(tokens[key]);
      setTokenBBalance(tb);
    } catch(e) { console.error(e); }
  };

  const fetchUnbonds = async (key) => {
    if (!contracts.exchange?.contract || !tokens[key]?.contract || !window.secretjs?.address) return;
    try {
      const resp = await query(contracts.exchange.contract, contracts.exchange.hash, {
        query_unbonding_requests: { pool: tokens[key].contract, user: window.secretjs.address }
      });
      setUnbondRequests(resp || []);
    } catch(e) { console.error(e); }
  };

  const getPoolCalcs = (key) => {
    const pd = allPoolsData[key];
    const st = pd?.pool_info?.state;
    const ui = pd?.user_info;
    const erthRes = Number(st?.erth_reserve||0);
    const tokenBRes = Number(st?.token_b_reserve||0);
    const totalShares = toMacroUnits(st?.total_shares||'0', {decimals:6});
    const userShares = toMacroUnits(ui?.amount_staked||'0', {decimals:6});
    const ownership = totalShares > 0 ? (userShares/totalShares)*100 : 0;
    const userErth = ownership > 0 ? (toMacroUnits(erthRes, tokens.ERTH)*ownership)/100 : 0;
    const userTokenB = ownership > 0 ? (toMacroUnits(tokenBRes, tokens[key])*ownership)/100 : 0;
    return { erthRes, tokenBRes, totalShares, userShares, ownership, userErth, userTokenB };
  };

  const handleErthChange = (val, key) => {
    setErthAmount(val);
    const pd = allPoolsData[key]?.pool_info?.state;
    const er = Number(pd?.erth_reserve||0), tr = Number(pd?.token_b_reserve||0);
    if (er && tr) {
      const p = parseFloat(val);
      if (!isNaN(p)) {
        const erm = toMacroUnits(er, tokens.ERTH), trm = toMacroUnits(tr, tokens[key]);
        setTokenBAmount(((p * trm) / erm).toFixed(6));
      } else setTokenBAmount("");
    }
  };

  const handleTokenBChange = (val, key) => {
    setTokenBAmount(val);
    const pd = allPoolsData[key]?.pool_info?.state;
    const er = Number(pd?.erth_reserve||0), tr = Number(pd?.token_b_reserve||0);
    if (er && tr) {
      const p = parseFloat(val);
      if (!isNaN(p)) {
        const erm = toMacroUnits(er, tokens.ERTH), trm = toMacroUnits(tr, tokens[key]);
        setErthAmount(((p * erm) / trm).toFixed(6));
      } else setErthAmount("");
    }
  };

  const handleAddLiquidity = async (key) => {
    if (!isKeplrConnected) return;
    execute(async () => {
      await provideLiquidity(tokens.ERTH.contract, tokens.ERTH.hash, tokens[key].contract, tokens[key].hash, toMicroUnits(erthAmount, tokens.ERTH), toMicroUnits(tokenBAmount, tokens[key]));
      setErthAmount(""); setTokenBAmount(""); refreshParent(); fetchBalances(key);
    });
  };

  const handleRemoveLiquidity = async (key) => {
    if (!isKeplrConnected) return;
    execute(async () => {
      await contract(contracts.exchange.contract, contracts.exchange.hash, { remove_liquidity: { pool: tokens[key].contract, amount: toMicroUnits(removeAmount, tokens[key]).toString() } });
      setRemoveAmount(""); refreshParent(); fetchUnbonds(key);
    });
  };

  const handleCompleteUnbond = async (key) => {
    if (!isKeplrConnected) return;
    execute(async () => {
      await contract(contracts.exchange.contract, contracts.exchange.hash, { claim_unbond_liquidity: { pool: tokens[key].contract } });
      refreshParent(); fetchUnbonds(key); fetchBalances(key);
    });
  };

  const handleClaim = async (poolKey) => {
    if (!isKeplrConnected) return;
    execute(async () => {
      await contract(contracts.exchange.contract, contracts.exchange.hash, { claim_rewards: { pools: [tokens[poolKey].contract] } });
      refreshParent();
    });
  };

  const handleClaimAll = async () => {
    if (!isKeplrConnected) return;
    const pools = marketRows.filter(r => r.userRewards > 0).map(r => tokens[r.key].contract);
    if (!pools.length) return;
    execute(async () => {
      await contract(contracts.exchange.contract, contracts.exchange.hash, { claim_rewards: { pools } });
      refreshParent();
    });
  };

  const handleRequestVK = async (token, key) => { await requestViewingKey(token); fetchBalances(key); };


  const hasClaimableUnbond = unbondRequests.some(r => Date.now() >= (r.start_time + UNBOND_SECONDS) * 1000);

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
            <span className={styles.marketsHeaderVal}>{formatCompact(totalTvlUsd)}</span>
          </div>
          <div className={styles.marketsHeaderStat}>
            <span className={styles.marketsErthLabel}>Volume (7d)</span>
            <span className={styles.marketsHeaderVal}>{erthPrice ? formatCompact(totalVolume7d * erthPrice) : "--"}</span>
          </div>
        </div>
        <div className={styles.marketsHeaderRight}>
          <span className={styles.marketsCountdown}>Rewards in <span className={styles.marketsTimer}>{countdown}</span></span>
          {totalRewards > 0 && isKeplrConnected && (
            <button className={styles.marketsClaimAll} onClick={handleClaimAll}>
              Claim {totalRewards.toLocaleString(undefined, {maximumFractionDigits: 1})} ERTH
            </button>
          )}
        </div>
      </div>

      {/* Column Headers */}
      <div className={styles.poolRowHeader}>
        <div className={styles.poolHeaderPair}>Pair</div>
        <div className={styles.poolRowStats}>
          <div className={styles.poolRowStat}><button className={`${styles.poolHeaderLabel} ${sortBy === "liquidityUsd" ? styles.active : ""}`} onClick={() => handleSort("liquidityUsd")}>Liquidity {sortBy === "liquidityUsd" && (sortOrder === "desc" ? "↓" : "↑")}</button></div>
          <div className={styles.poolRowStat}><button className={`${styles.poolHeaderLabel} ${sortBy === "volume7d" ? styles.active : ""}`} onClick={() => handleSort("volume7d")}>Vol (7d) {sortBy === "volume7d" && (sortOrder === "desc" ? "↓" : "↑")}</button></div>
          <div className={styles.poolRowStat}><button className={`${styles.poolHeaderLabel} ${sortBy === "apr" ? styles.active : ""}`} onClick={() => handleSort("apr")}>APR {sortBy === "apr" && (sortOrder === "desc" ? "↓" : "↑")}</button></div>
          <div className={styles.poolRowStat}><button className={`${styles.poolHeaderLabel} ${sortBy === "arbDepth" ? styles.active : ""}`} onClick={() => handleSort("arbDepth")}>Arb {sortBy === "arbDepth" && (sortOrder === "desc" ? "↓" : "↑")} <span className={styles.arbTooltip}>?<span className={styles.arbTooltipText}>Positive = ERTH underpriced (buy ERTH). Negative = ERTH overpriced (sell ERTH).</span></span></button></div>
        </div>
        <div className={styles.poolRowActionsPlaceholder}></div>
      </div>

      {/* Pool Cards */}
      {sortedRows.map(row => {
        const isExpanded = expandedPool === row.key;
        const calcs = isExpanded ? getPoolCalcs(row.key) : null;

        return (
          <div className={styles.poolCard} key={row.key}>
            {/* Top row */}
            <div className={styles.poolRowTop}>
              <div className={styles.poolRowPair}>
                <img src={`/images/coin/${row.key}.png`} alt={row.key} className={styles.poolRowLogo} />
                <div>
                  <div className={styles.poolRowName}><span className={styles.poolRowToken}>{row.key}</span><span className={styles.poolRowSlash}>/ ERTH</span></div>
                  <span className={styles.poolRowPrice}>{formatPrice(row.price)}</span>
                </div>
              </div>
              <div className={styles.poolRowStats}>
                <div className={styles.poolRowStat}><span className={styles.poolRowStatVal}>{formatCompact(row.liquidityUsd)}</span><span className={styles.poolRowStatLabel}>Liquidity</span></div>
                <div className={styles.poolRowStat}><span className={styles.poolRowStatVal}>{row.volume7d > 0 && erthPrice ? formatCompact(row.volume7d * erthPrice) : "--"}</span><span className={styles.poolRowStatLabel}>Vol (7d)</span></div>
                <div className={styles.poolRowStat}><span className={`${styles.poolRowStatVal} ${row.apr > 0 ? styles.green : ""}`}>{row.apr > 0 ? `${row.apr.toFixed(1)}%` : "--"}</span><span className={styles.poolRowStatLabel}>APR</span></div>
                <div className={styles.poolRowStat}><span className={`${styles.poolRowStatVal} ${row.arbDepth > 0 ? styles.green : row.arbDepth < 0 ? styles.red : ""}`}>{row.arbDepth !== 0 ? `${row.arbDepth > 0 ? "+" : "-"}¤${Math.abs(row.arbDepth).toLocaleString(undefined,{maximumFractionDigits:0})}` : "¤0"}</span><span className={styles.poolRowStatLabel}>Arb</span></div>
              </div>
              <div className={styles.poolRowActions}>
                <a href="/swap-tokens" className={`${styles.poolRowBtn} ${styles.primary}`}>Trade</a>
                <button className={`${styles.poolRowBtn} ${styles.secondary}`} onClick={() => togglePool(row.key)}>{isExpanded ? "Close" : "+ LP"}</button>
                {row.userRewards > 0 && <button className={`${styles.poolRowBtn} ${styles.claim}`} onClick={() => handleClaim(row.key)}>Claim</button>}
              </div>
            </div>

            {/* Expanded LP section */}
            {isExpanded && calcs && (
              <div className={styles.poolExpand}>
                <div className={styles.poolExpandCols}>
                  {/* Left: pool info */}
                  <div className={styles.poolExpandInfo}>
                    <div className={styles.lpInfoItem}><span className={styles.lpInfoLabel}>ERTH Reserve</span><span className={styles.lpInfoVal}>{toMacroUnits(calcs.erthRes, tokens.ERTH).toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>
                    <div className={styles.lpInfoItem}><span className={styles.lpInfoLabel}>{row.key} Reserve</span><span className={styles.lpInfoVal}>{toMacroUnits(calcs.tokenBRes, tokens[row.key]).toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>
                    <div className={styles.lpInfoItem}><span className={styles.lpInfoLabel}>Total Shares</span><span className={styles.lpInfoVal}>{calcs.totalShares.toLocaleString()}</span></div>
                    <div className={styles.lpInfoItem}><span className={styles.lpInfoLabel}>Your Shares</span><span className={styles.lpInfoVal}>{calcs.userShares.toLocaleString()}</span></div>
                    <div className={styles.lpInfoItem}><span className={styles.lpInfoLabel}>Ownership</span><span className={styles.lpInfoVal}>{calcs.ownership.toFixed(4)}%</span></div>
                    <div className={styles.lpInfoItem}><span className={styles.lpInfoLabel}>APR</span><span className={`${styles.lpInfoVal} ${styles.green}`}>{row.apr > 0 ? `${row.apr.toFixed(1)}%` : "--"}</span></div>
                    <div className={styles.lpInfoItem}><span className={styles.lpInfoLabel}>Your ERTH Value</span><span className={styles.lpInfoVal}>{calcs.userErth.toFixed(4)}</span></div>
                    <div className={styles.lpInfoItem}><span className={styles.lpInfoLabel}>Your {row.key} Value</span><span className={styles.lpInfoVal}>{calcs.userTokenB.toFixed(4)}</span></div>
                  </div>

                  {/* Right: tabs + actions */}
                  <div className={styles.poolExpandActions}>
                <div className={styles.lpTabs}>
                  {["Add", "Remove", "Unbond"].map(t => (
                    <button key={t} className={`${styles.lpTab} ${lpTab === t ? styles.active : ""}`} onClick={() => setLpTab(t)}>{t}</button>
                  ))}
                </div>

                {lpTab === "Add" && (
                  <div className={styles.lpContent}>
                    <div className={styles.lpInputGroup}>
                      <div className={styles.lpInputHeader}>
                        <label>{row.key}</label>
                        <span className={styles.lpBalance}>
                          {tokenBBalance === "Error" ? <button className={styles.lpVkBtn} onClick={() => handleRequestVK(tokens[row.key], row.key)}>Get Viewing Key</button> : <>Bal: {tokenBBalance ?? "..."} <button className={styles.lpMaxBtn} onClick={() => handleTokenBChange(String(tokenBBalance), row.key)}>Max</button></>}
                        </span>
                      </div>
                      <div className={styles.lpInputWrapper}>
                        <img src={`/images/coin/${row.key}.png`} alt={row.key} className={styles.lpInputLogo} />
                        <input type="number" placeholder="0.0" value={tokenBAmount} onChange={e => handleTokenBChange(e.target.value, row.key)} className={styles.lpInput} />
                      </div>
                    </div>
                    <div className={styles.lpInputGroup}>
                      <div className={styles.lpInputHeader}>
                        <label>ERTH</label>
                        <span className={styles.lpBalance}>
                          {erthBalance === "Error" ? <button className={styles.lpVkBtn} onClick={() => handleRequestVK(tokens.ERTH, row.key)}>Get Viewing Key</button> : <>Bal: {erthBalance ?? "..."} <button className={styles.lpMaxBtn} onClick={() => handleErthChange(String(erthBalance), row.key)}>Max</button></>}
                        </span>
                      </div>
                      <div className={styles.lpInputWrapper}>
                        <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.lpInputLogo} />
                        <input type="number" placeholder="0.0" value={erthAmount} onChange={e => handleErthChange(e.target.value, row.key)} className={styles.lpInput} />
                      </div>
                    </div>
                    <button className={styles.lpActionBtn} onClick={() => handleAddLiquidity(row.key)} disabled={!(parseFloat(erthAmount) > 0 && parseFloat(tokenBAmount) > 0) || parseFloat(erthAmount) > parseFloat(erthBalance) || parseFloat(tokenBAmount) > parseFloat(tokenBBalance)}>Add Liquidity</button>
                  </div>
                )}

                {lpTab === "Remove" && calcs && (
                  <div className={styles.lpContent}>
                    <div className={styles.lpInputGroup}>
                      <div className={styles.lpInputHeader}>
                        <label>Shares</label>
                        <span className={styles.lpBalance}>Bal: {calcs.userShares.toLocaleString()} <button className={styles.lpMaxBtn} onClick={() => setRemoveAmount(String(calcs.userShares))}>Max</button></span>
                      </div>
                      <div className={styles.lpInputWrapper}>
                        <input type="number" placeholder="0.0" value={removeAmount} onChange={e => setRemoveAmount(e.target.value)} className={styles.lpInput} />
                      </div>
                    </div>
                    <button className={styles.lpActionBtn} onClick={() => handleRemoveLiquidity(row.key)} disabled={!parseFloat(removeAmount) || parseFloat(removeAmount) > calcs.userShares}>Remove Liquidity</button>
                    <p className={styles.lpNote}>7-day unbonding period before you can claim tokens</p>
                  </div>
                )}

                {lpTab === "Unbond" && (
                  <div className={styles.lpContent}>
                    {hasClaimableUnbond && <button className={styles.lpActionBtn} onClick={() => handleCompleteUnbond(row.key)}>Complete Unbond</button>}
                    {unbondRequests.length > 0 ? unbondRequests.map((req, i) => {
                      const claimAt = (req.start_time + UNBOND_SECONDS) * 1000;
                      const shares = toMacroUnits(req.amount, {decimals:6});
                      return (
                        <div key={i} className={styles.lpUnbondItem}>
                          <div><span className={styles.lpUnbondLabel}>Shares:</span> {shares.toLocaleString()}</div>
                          <div><span className={styles.lpUnbondLabel}>Claimable:</span> {new Date(claimAt).toLocaleString()}</div>
                          <div><span className={styles.lpUnbondLabel}>Status:</span> {Date.now() >= claimAt ? <span className={styles.green}>Ready</span> : "Unbonding"}</div>
                        </div>
                      );
                    }) : <p className={styles.lpNote}>No unbonding requests</p>}
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
