import React, { useState, useEffect, useMemo, useCallback } from "react";
import "./Markets.css";
import tokens from "../utils/tokens";
import { query, contract, getQueryAddress, querySnipBalance, provideLiquidity, requestViewingKey } from "../utils/contractUtils";
import contracts from "../utils/contracts";
import StatusModal from "../components/StatusModal";
import { showLoadingScreen } from "../utils/uiUtils";
import { toMicroUnits, toMacroUnits } from "../utils/mathUtils.js";
import { fetchErthPrice, formatUSD } from "../utils/apiUtils";
import { ERTH_API_BASE_URL } from "../utils/config";

const ANALYTICS_URL = `${ERTH_API_BASE_URL}/analytics`;
const TICKERS_URL = `${ERTH_API_BASE_URL}/tickers`;
const UNBOND_SECONDS = 7 * 24 * 60 * 60;

const Markets = ({ isKeplrConnected }) => {
  const [allPoolsData, setAllPoolsData] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [erthPrice, setErthPrice] = useState(null);
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

  // ERTH price
  useEffect(() => {
    const u = async () => { try { setErthPrice((await fetchErthPrice()).price); } catch(e){} };
    u(); const id = setInterval(u, 60000); return () => clearInterval(id);
  }, []);

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
    showLoadingScreen(true);
    query(ex, contracts.exchange.hash, { query_user_info: { pools, user: getQueryAddress() } })
      .then(res => { const d = {}; tokenKeys.forEach((k,i) => { d[k] = {...res[i], tokenKey: k}; }); setAllPoolsData(d); })
      .catch(console.error).finally(() => showLoadingScreen(false));
  }, [isKeplrConnected, refreshKey, tokenKeys]);

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
    setIsModalOpen(true); setAnimationState("loading");
    try {
      await provideLiquidity(tokens.ERTH.contract, tokens.ERTH.hash, tokens[key].contract, tokens[key].hash, toMicroUnits(erthAmount, tokens.ERTH), toMicroUnits(tokenBAmount, tokens[key]));
      setAnimationState("success"); setErthAmount(""); setTokenBAmount(""); refreshParent(); fetchBalances(key);
    } catch(e) { console.error(e); setAnimationState("error"); }
  };

  const handleRemoveLiquidity = async (key) => {
    if (!isKeplrConnected) return;
    setIsModalOpen(true); setAnimationState("loading");
    try {
      await contract(contracts.exchange.contract, contracts.exchange.hash, { remove_liquidity: { pool: tokens[key].contract, amount: toMicroUnits(removeAmount, tokens[key]).toString() } });
      setAnimationState("success"); setRemoveAmount(""); refreshParent(); fetchUnbonds(key);
    } catch(e) { console.error(e); setAnimationState("error"); }
  };

  const handleCompleteUnbond = async (key) => {
    if (!isKeplrConnected) return;
    setIsModalOpen(true); setAnimationState("loading");
    try {
      await contract(contracts.exchange.contract, contracts.exchange.hash, { claim_unbond_liquidity: { pool: tokens[key].contract } });
      setAnimationState("success"); refreshParent(); fetchUnbonds(key); fetchBalances(key);
    } catch(e) { console.error(e); setAnimationState("error"); }
  };

  const handleClaim = async (poolKey) => {
    if (!isKeplrConnected) return;
    setIsModalOpen(true); setAnimationState("loading");
    try { await contract(contracts.exchange.contract, contracts.exchange.hash, { claim_rewards: { pools: [tokens[poolKey].contract] } }); setAnimationState("success"); refreshParent(); }
    catch(e) { console.error(e); setAnimationState("error"); }
  };

  const handleClaimAll = async () => {
    if (!isKeplrConnected) return;
    const pools = marketRows.filter(r => r.userRewards > 0).map(r => tokens[r.key].contract);
    if (!pools.length) return;
    setIsModalOpen(true); setAnimationState("loading");
    try { await contract(contracts.exchange.contract, contracts.exchange.hash, { claim_rewards: { pools } }); setAnimationState("success"); refreshParent(); }
    catch(e) { console.error(e); setAnimationState("error"); }
  };

  const handleRequestVK = async (token, key) => { await requestViewingKey(token); fetchBalances(key); };

  const fmt = p => { if(!p) return "$0.00"; if(p<0.0001) return `$${p.toFixed(8)}`; if(p<0.01) return `$${p.toFixed(6)}`; if(p<1) return `$${p.toFixed(4)}`; return `$${p.toFixed(2)}`; };
  const fmtN = n => { if(!n) return "$0"; if(n>=1e9) return `$${(n/1e9).toFixed(2)}B`; if(n>=1e6) return `$${(n/1e6).toFixed(2)}M`; if(n>=1e3) return `$${(n/1e3).toFixed(2)}K`; return `$${n.toFixed(2)}`; };

  const hasClaimableUnbond = unbondRequests.some(r => Date.now() >= (r.start_time + UNBOND_SECONDS) * 1000);

  return (
    <div className="markets-page">
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      {/* Header */}
      <div className="markets-header">
        <div className="markets-header-left">
          <img src="/images/coin/ERTH.png" alt="ERTH" className="markets-erth-logo" />
          <div>
            <span className="markets-erth-label">ERTH Price</span>
            <span className="markets-erth-price">{fmt(erthPrice)}</span>
          </div>
          <div className="markets-header-stat">
            <span className="markets-erth-label">Total TVL</span>
            <span className="markets-header-val">{fmtN(totalTvlUsd)}</span>
          </div>
          <div className="markets-header-stat">
            <span className="markets-erth-label">Volume (7d)</span>
            <span className="markets-header-val">{erthPrice ? fmtN(totalVolume7d * erthPrice) : "--"}</span>
          </div>
        </div>
        <div className="markets-header-right">
          <span className="markets-countdown">Rewards in <span className="markets-timer">{countdown}</span></span>
          {totalRewards > 0 && isKeplrConnected && (
            <button className="markets-claim-all" onClick={handleClaimAll}>
              Claim {totalRewards.toLocaleString(undefined, {maximumFractionDigits: 1})} ERTH
            </button>
          )}
        </div>
      </div>

      {/* Column Headers */}
      <div className="pool-row-header">
        <div className="pool-header-pair">Pair</div>
        <div className="pool-row-stats">
          <div className="pool-row-stat"><button className={`pool-header-label ${sortBy === "liquidityUsd" ? "active" : ""}`} onClick={() => handleSort("liquidityUsd")}>Liquidity {sortBy === "liquidityUsd" && (sortOrder === "desc" ? "↓" : "↑")}</button></div>
          <div className="pool-row-stat"><button className={`pool-header-label ${sortBy === "volume7d" ? "active" : ""}`} onClick={() => handleSort("volume7d")}>Vol (7d) {sortBy === "volume7d" && (sortOrder === "desc" ? "↓" : "↑")}</button></div>
          <div className="pool-row-stat"><button className={`pool-header-label ${sortBy === "apr" ? "active" : ""}`} onClick={() => handleSort("apr")}>APR {sortBy === "apr" && (sortOrder === "desc" ? "↓" : "↑")}</button></div>
          <div className="pool-row-stat"><button className={`pool-header-label ${sortBy === "arbDepth" ? "active" : ""}`} onClick={() => handleSort("arbDepth")}>Arb {sortBy === "arbDepth" && (sortOrder === "desc" ? "↓" : "↑")} <span className="arb-tooltip">?<span className="arb-tooltip-text">Positive = ERTH underpriced (buy ERTH). Negative = ERTH overpriced (sell ERTH).</span></span></button></div>
        </div>
        <div className="pool-row-actions-placeholder"></div>
      </div>

      {/* Pool Cards */}
      {sortedRows.map(row => {
        const isExpanded = expandedPool === row.key;
        const calcs = isExpanded ? getPoolCalcs(row.key) : null;

        return (
          <div className={`pool-card ${isExpanded ? "expanded" : ""}`} key={row.key}>
            {/* Top row */}
            <div className="pool-row-top">
              <div className="pool-row-pair">
                <img src={`/images/coin/${row.key}.png`} alt={row.key} className="pool-row-logo" />
                <div>
                  <div className="pool-row-name"><span className="pool-row-token">{row.key}</span><span className="pool-row-slash">/ ERTH</span></div>
                  <span className="pool-row-price">{fmt(row.price)}</span>
                </div>
              </div>
              <div className="pool-row-stats">
                <div className="pool-row-stat"><span className="pool-row-stat-val">{fmtN(row.liquidityUsd)}</span><span className="pool-row-stat-label">Liquidity</span></div>
                <div className="pool-row-stat"><span className="pool-row-stat-val">{row.volume7d > 0 && erthPrice ? fmtN(row.volume7d * erthPrice) : "--"}</span><span className="pool-row-stat-label">Vol (7d)</span></div>
                <div className="pool-row-stat"><span className={`pool-row-stat-val ${row.apr > 0 ? "green" : ""}`}>{row.apr > 0 ? `${row.apr.toFixed(1)}%` : "--"}</span><span className="pool-row-stat-label">APR</span></div>
                <div className="pool-row-stat"><span className={`pool-row-stat-val ${row.arbDepth > 0 ? "green" : row.arbDepth < 0 ? "red" : ""}`}>{row.arbDepth !== 0 ? `${row.arbDepth > 0 ? "+" : "-"}¤${Math.abs(row.arbDepth).toLocaleString(undefined,{maximumFractionDigits:0})}` : "¤0"}</span><span className="pool-row-stat-label">Arb</span></div>
              </div>
              <div className="pool-row-actions">
                <a href="/swap-tokens" className="pool-row-btn primary">Trade</a>
                <button className="pool-row-btn secondary" onClick={() => togglePool(row.key)}>{isExpanded ? "Close" : "+ LP"}</button>
                {row.userRewards > 0 && <button className="pool-row-btn claim" onClick={() => handleClaim(row.key)}>Claim</button>}
              </div>
            </div>

            {/* Expanded LP section */}
            {isExpanded && calcs && (
              <div className="pool-expand">
                <div className="pool-expand-cols">
                  {/* Left: pool info */}
                  <div className="pool-expand-info">
                    <div className="lp-info-item"><span className="lp-info-label">ERTH Reserve</span><span className="lp-info-val">{toMacroUnits(calcs.erthRes, tokens.ERTH).toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>
                    <div className="lp-info-item"><span className="lp-info-label">{row.key} Reserve</span><span className="lp-info-val">{toMacroUnits(calcs.tokenBRes, tokens[row.key]).toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>
                    <div className="lp-info-item"><span className="lp-info-label">Total Shares</span><span className="lp-info-val">{calcs.totalShares.toLocaleString()}</span></div>
                    <div className="lp-info-item"><span className="lp-info-label">Your Shares</span><span className="lp-info-val">{calcs.userShares.toLocaleString()}</span></div>
                    <div className="lp-info-item"><span className="lp-info-label">Ownership</span><span className="lp-info-val">{calcs.ownership.toFixed(4)}%</span></div>
                    <div className="lp-info-item"><span className="lp-info-label">APR</span><span className="lp-info-val green">{row.apr > 0 ? `${row.apr.toFixed(1)}%` : "--"}</span></div>
                    <div className="lp-info-item"><span className="lp-info-label">Your ERTH Value</span><span className="lp-info-val">{calcs.userErth.toFixed(4)}</span></div>
                    <div className="lp-info-item"><span className="lp-info-label">Your {row.key} Value</span><span className="lp-info-val">{calcs.userTokenB.toFixed(4)}</span></div>
                  </div>

                  {/* Right: tabs + actions */}
                  <div className="pool-expand-actions">
                <div className="lp-tabs">
                  {["Add", "Remove", "Unbond"].map(t => (
                    <button key={t} className={`lp-tab ${lpTab === t ? "active" : ""}`} onClick={() => setLpTab(t)}>{t}</button>
                  ))}
                </div>

                {lpTab === "Add" && (
                  <div className="lp-content">
                    <div className="lp-input-group">
                      <div className="lp-input-header">
                        <label>{row.key}</label>
                        <span className="lp-balance">
                          {tokenBBalance === "Error" ? <button className="lp-vk-btn" onClick={() => handleRequestVK(tokens[row.key], row.key)}>Get Viewing Key</button> : <>Bal: {tokenBBalance ?? "..."} <button className="lp-max-btn" onClick={() => handleTokenBChange(String(tokenBBalance), row.key)}>Max</button></>}
                        </span>
                      </div>
                      <div className="lp-input-wrapper">
                        <img src={`/images/coin/${row.key}.png`} alt={row.key} className="lp-input-logo" />
                        <input type="number" placeholder="0.0" value={tokenBAmount} onChange={e => handleTokenBChange(e.target.value, row.key)} className="lp-input" />
                      </div>
                    </div>
                    <div className="lp-input-group">
                      <div className="lp-input-header">
                        <label>ERTH</label>
                        <span className="lp-balance">
                          {erthBalance === "Error" ? <button className="lp-vk-btn" onClick={() => handleRequestVK(tokens.ERTH, row.key)}>Get Viewing Key</button> : <>Bal: {erthBalance ?? "..."} <button className="lp-max-btn" onClick={() => handleErthChange(String(erthBalance), row.key)}>Max</button></>}
                        </span>
                      </div>
                      <div className="lp-input-wrapper">
                        <img src="/images/coin/ERTH.png" alt="ERTH" className="lp-input-logo" />
                        <input type="number" placeholder="0.0" value={erthAmount} onChange={e => handleErthChange(e.target.value, row.key)} className="lp-input" />
                      </div>
                    </div>
                    <button className="lp-action-btn" onClick={() => handleAddLiquidity(row.key)} disabled={!(parseFloat(erthAmount) > 0 && parseFloat(tokenBAmount) > 0) || parseFloat(erthAmount) > parseFloat(erthBalance) || parseFloat(tokenBAmount) > parseFloat(tokenBBalance)}>Add Liquidity</button>
                  </div>
                )}

                {lpTab === "Remove" && calcs && (
                  <div className="lp-content">
                    <div className="lp-input-group">
                      <div className="lp-input-header">
                        <label>Shares</label>
                        <span className="lp-balance">Bal: {calcs.userShares.toLocaleString()} <button className="lp-max-btn" onClick={() => setRemoveAmount(String(calcs.userShares))}>Max</button></span>
                      </div>
                      <div className="lp-input-wrapper">
                        <input type="number" placeholder="0.0" value={removeAmount} onChange={e => setRemoveAmount(e.target.value)} className="lp-input" />
                      </div>
                    </div>
                    <button className="lp-action-btn" onClick={() => handleRemoveLiquidity(row.key)} disabled={!parseFloat(removeAmount) || parseFloat(removeAmount) > calcs.userShares}>Remove Liquidity</button>
                    <p className="lp-note">7-day unbonding period before you can claim tokens</p>
                  </div>
                )}

                {lpTab === "Unbond" && (
                  <div className="lp-content">
                    {hasClaimableUnbond && <button className="lp-action-btn" onClick={() => handleCompleteUnbond(row.key)}>Complete Unbond</button>}
                    {unbondRequests.length > 0 ? unbondRequests.map((req, i) => {
                      const claimAt = (req.start_time + UNBOND_SECONDS) * 1000;
                      const shares = toMacroUnits(req.amount, {decimals:6});
                      return (
                        <div key={i} className="lp-unbond-item">
                          <div><span className="lp-unbond-label">Shares:</span> {shares.toLocaleString()}</div>
                          <div><span className="lp-unbond-label">Claimable:</span> {new Date(claimAt).toLocaleString()}</div>
                          <div><span className="lp-unbond-label">Status:</span> {Date.now() >= claimAt ? <span className="green">Ready</span> : "Unbonding"}</div>
                        </div>
                      );
                    }) : <p className="lp-note">No unbonding requests</p>}
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
