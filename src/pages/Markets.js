import React, { useState, useEffect, useMemo } from "react";
import "./Markets.css";
import LiquidityManagement from "../components/LiquidityManagement";
import tokens from "../utils/tokens";
import { query, contract, getQueryAddress } from "../utils/contractUtils";
import contracts from "../utils/contracts";
import StatusModal from "../components/StatusModal";
import { showLoadingScreen } from "../utils/uiUtils";
import { toMacroUnits } from "../utils/mathUtils.js";
import { fetchErthPrice, formatUSD } from "../utils/apiUtils";
import { ERTH_API_BASE_URL } from "../utils/config";

const ANALYTICS_URL = `${ERTH_API_BASE_URL}/analytics`;
const TICKERS_URL = `${ERTH_API_BASE_URL}/tickers`;

const Markets = ({ isKeplrConnected }) => {
  const [isManagingLiquidity, setIsManagingLiquidity] = useState(false);
  const [poolInfo, setPoolInfo] = useState(null);
  const [allPoolsData, setAllPoolsData] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [erthPrice, setErthPrice] = useState(null);
  const [countdown, setCountdown] = useState("");
  const [tickers, setTickers] = useState([]);
  const [analyticsLatest, setAnalyticsLatest] = useState(null);

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

  useEffect(() => {
    const u = async () => { try { setErthPrice((await fetchErthPrice()).price); } catch(e){} };
    u(); const id = setInterval(u, 60000); return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const f = () => Promise.all([
      fetch(ANALYTICS_URL).then(r => r.ok ? r.json() : null),
      fetch(TICKERS_URL).then(r => r.ok ? r.json() : null),
    ]).then(([a,t]) => { if(a?.latest) setAnalyticsLatest(a.latest); if(t) setTickers(t); }).catch(console.error);
    f(); const id = setInterval(f, 60000); return () => clearInterval(id);
  }, []);

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
    const tokenRes = toMacroUnits(Number(st?.token_b_reserve||0), tokens[key]||{decimals:6});
    const erthPerToken = tokenRes > 0 ? erthRes / tokenRes : 0;
    return { key, price: t?.tokenPriceUsd||0, erthPerToken, volume7d, liquidityUsd: t?.liquidityUsd||(tvl*(erthPrice||0)), arbDepth: t?.arbDepth||0, tvl, apr, userRewards, poolData: pd };
  }), [tokenKeys, tickerByToken, allPoolsData, erthPrice]);

  const [sortBy, setSortBy] = useState("liquidityUsd");
  const [sortOrder, setSortOrder] = useState("desc");

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(o => o === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortOrder("desc"); }
  };

  const sortedRows = useMemo(() => [...marketRows].sort((a, b) => {
    const av = a[sortBy] || 0, bv = b[sortBy] || 0;
    return sortOrder === "desc" ? bv - av : av - bv;
  }), [marketRows, sortBy, sortOrder]);

  const totalRewards = marketRows.reduce((s,r) => s + r.userRewards, 0);
  const totalTvlUsd = marketRows.reduce((s,r) => s + r.liquidityUsd, 0);
  const totalVolume7d = marketRows.reduce((s,r) => s + r.volume7d, 0);
  const refreshParent = () => setRefreshKey(p => p+1);
  const toggleManageLiquidity = (pd = null) => { setPoolInfo(pd); setIsManagingLiquidity(p => !p); };

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

  const fmt = p => { if(!p) return "$0.00"; if(p<0.0001) return `$${p.toFixed(8)}`; if(p<0.01) return `$${p.toFixed(6)}`; if(p<1) return `$${p.toFixed(4)}`; return `$${p.toFixed(2)}`; };
  const fmtN = n => { if(!n) return "$0"; if(n>=1e9) return `$${(n/1e9).toFixed(2)}B`; if(n>=1e6) return `$${(n/1e6).toFixed(2)}M`; if(n>=1e3) return `$${(n/1e3).toFixed(2)}K`; return `$${n.toFixed(2)}`; };

  return (
    <div className="markets-page">
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      {isManagingLiquidity ? (
        <LiquidityManagement toggleManageLiquidity={toggleManageLiquidity} isKeplrConnected={isKeplrConnected} poolData={poolInfo} refreshParent={refreshParent} />
      ) : (
        <>
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
            <div className="pool-row-pair">Pair</div>
            <div className="pool-row-stats">
              <div className="pool-row-stat"><button className={`pool-header-label ${sortBy === "liquidityUsd" ? "active" : ""}`} onClick={() => handleSort("liquidityUsd")}>Liquidity {sortBy === "liquidityUsd" && (sortOrder === "desc" ? "↓" : "↑")}</button></div>
              <div className="pool-row-stat"><button className={`pool-header-label ${sortBy === "volume7d" ? "active" : ""}`} onClick={() => handleSort("volume7d")}>Vol (7d) {sortBy === "volume7d" && (sortOrder === "desc" ? "↓" : "↑")}</button></div>
              <div className="pool-row-stat"><button className={`pool-header-label ${sortBy === "apr" ? "active" : ""}`} onClick={() => handleSort("apr")}>APR {sortBy === "apr" && (sortOrder === "desc" ? "↓" : "↑")}</button></div>
              <div className="pool-row-stat"><button className={`pool-header-label ${sortBy === "arbDepth" ? "active" : ""}`} onClick={() => handleSort("arbDepth")}>Arb {sortBy === "arbDepth" && (sortOrder === "desc" ? "↓" : "↑")}</button></div>
            </div>
            <div className="pool-row-actions-placeholder"></div>
          </div>

          {/* Pool Cards */}
          {sortedRows.map(row => (
            <div className="pool-row" key={row.key}>
              {/* Left: pair info */}
              <div className="pool-row-pair">
                <img src={`/images/coin/${row.key}.png`} alt={row.key} className="pool-row-logo" />
                <div>
                  <div className="pool-row-name">
                    <span className="pool-row-token">{row.key}</span>
                    <span className="pool-row-slash">/ ERTH</span>
                  </div>
                  <span className="pool-row-price">{fmt(row.price)}</span>
                </div>
              </div>

              {/* Middle: stats */}
              <div className="pool-row-stats">
                <div className="pool-row-stat">
                  <span className="pool-row-stat-val">{fmtN(row.liquidityUsd)}</span>
                  <span className="pool-row-stat-label">Liquidity</span>
                </div>
                <div className="pool-row-stat">
                  <span className="pool-row-stat-val">{row.volume7d > 0 && erthPrice ? fmtN(row.volume7d * erthPrice) : "--"}</span>
                  <span className="pool-row-stat-label">Vol (7d)</span>
                </div>
                <div className="pool-row-stat">
                  <span className={`pool-row-stat-val ${row.apr > 0 ? "green" : ""}`}>{row.apr > 0 ? `${row.apr.toFixed(1)}%` : "--"}</span>
                  <span className="pool-row-stat-label">APR</span>
                </div>
                <div className="pool-row-stat">
                  <span className={`pool-row-stat-val ${row.arbDepth > 0 ? "green" : row.arbDepth < 0 ? "red" : ""}`}>
                    {row.arbDepth !== 0 ? `${row.arbDepth > 0 ? "+" : "-"}¤${Math.abs(row.arbDepth).toLocaleString(undefined,{maximumFractionDigits:0})}` : "¤0"}
                  </span>
                  <span className="pool-row-stat-label">Arb</span>
                </div>
              </div>

              {/* Right: actions */}
              <div className="pool-row-actions">
                <a href="/swap-tokens" className="pool-row-btn primary">Trade</a>
                <button className="pool-row-btn secondary" onClick={() => toggleManageLiquidity(row.poolData)}>+ LP</button>
                {row.userRewards > 0 && <button className="pool-row-btn claim" onClick={() => handleClaim(row.key)}>Claim</button>}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default Markets;
