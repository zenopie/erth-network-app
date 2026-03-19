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

  // Countdown
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const target = new Date(now);
      target.setUTCHours(0, 0, 0, 0);
      if (now >= target) target.setUTCDate(target.getUTCDate() + 1);
      const diff = target - now;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const tokenKeys = useMemo(() => Object.keys(tokens).filter((t) => t !== "ERTH"), []);

  // ERTH price
  useEffect(() => {
    const update = async () => {
      try { setErthPrice((await fetchErthPrice()).price); } catch (e) { console.error(e); }
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  // Tickers + analytics
  useEffect(() => {
    const fetch_ = () => {
      Promise.all([
        fetch(ANALYTICS_URL).then(r => r.ok ? r.json() : null),
        fetch(TICKERS_URL).then(r => r.ok ? r.json() : null),
      ]).then(([a, t]) => {
        if (a?.latest) setAnalyticsLatest(a.latest);
        if (t) setTickers(t);
      }).catch(console.error);
    };
    fetch_();
    const id = setInterval(fetch_, 60000);
    return () => clearInterval(id);
  }, []);

  // Pool data from contract
  useEffect(() => {
    const ex = contracts.exchange?.contract;
    const pools = tokenKeys.map(k => tokens[k]?.contract).filter(Boolean);
    if (!pools.length || !ex) return;

    showLoadingScreen(true);
    query(ex, contracts.exchange.hash, { query_user_info: { pools, user: getQueryAddress() } })
      .then(res => {
        const data = {};
        tokenKeys.forEach((k, i) => { data[k] = { ...res[i], tokenKey: k }; });
        setAllPoolsData(data);
      })
      .catch(console.error)
      .finally(() => showLoadingScreen(false));
  }, [isKeplrConnected, refreshKey, tokenKeys]);

  // Build ticker lookup by token name
  const tickerByToken = useMemo(() => {
    if (!tickers.length || !analyticsLatest?.pools) return {};
    const sortedPools = [...analyticsLatest.pools].sort((a, b) => b.tvl - a.tvl);
    const sortedTickers = [...tickers].sort((a, b) => parseFloat(b.liquidity_in_usd) - parseFloat(a.liquidity_in_usd));
    const map = {};
    sortedTickers.forEach((t, i) => {
      const pool = sortedPools[i];
      if (pool) {
        const ep = analyticsLatest.erthPrice;
        map[pool.token] = {
          tokenPriceUsd: pool.tokenPrice || 0,
          lastPrice: parseFloat(t.last_price),
          volumeUsd: parseFloat(t.base_volume) * (pool.erthPrice || ep),
          liquidityUsd: parseFloat(t.liquidity_in_usd),
          bid: parseFloat(t.bid),
          ask: parseFloat(t.ask),
          tickerId: t.ticker_id,
          arbDepth: pool.arbDepth || 0,
        };
      }
    });
    return map;
  }, [tickers, analyticsLatest]);

  // Unified market rows
  const marketRows = useMemo(() => {
    return tokenKeys.map(key => {
      const t = tickerByToken[key];
      const pd = allPoolsData[key];
      const st = pd?.pool_info?.state;
      const ui = pd?.user_info;

      const erthRes = toMacroUnits(Number(st?.erth_reserve || 0), tokens.ERTH);
      const tvl = erthRes * 2;
      const dv = st?.daily_volumes || [];
      const volume7d = toMacroUnits(dv.slice(0, 7).reduce((a, v) => a + Number(v), 0), tokens.ERTH);
      const dr = st?.daily_rewards || [];
      const weekRewards = toMacroUnits(dr.slice(0, 7).reduce((a, v) => a + Number(v), 0), tokens.ERTH);
      const apr = tvl > 0 ? (weekRewards / tvl) * 52 * 100 : 0;
      const userRewards = toMacroUnits(ui?.pending_rewards || 0, tokens.ERTH);

      // Token price: from tickers API, or derive from pool reserves
      const tokenPriceUsd = t?.tokenPriceUsd || 0;
      // ERTH price per token (how many ERTH for 1 of this token)
      const tokenRes = toMacroUnits(Number(st?.token_b_reserve || 0), tokens[key] || { decimals: 6 });
      const erthPerToken = tokenRes > 0 ? erthRes / tokenRes : 0;

      return {
        key,
        price: tokenPriceUsd,
        erthPerToken,
        volume7d,
        liquidityUsd: t?.liquidityUsd || (tvl * (erthPrice || 0)),
        arbDepth: t?.arbDepth || 0,
        tvl,
        apr,
        userRewards,
        poolData: pd,
      };
    });
  }, [tokenKeys, tickerByToken, allPoolsData, erthPrice]);

  const totalTvlUsd = marketRows.reduce((s, r) => s + r.liquidityUsd, 0);
  const totalVolume7d = marketRows.reduce((s, r) => s + r.volume7d, 0);
  const totalRewards = marketRows.reduce((s, r) => s + r.userRewards, 0);

  const refreshParent = () => setRefreshKey(p => p + 1);
  const toggleManageLiquidity = (pd = null) => { setPoolInfo(pd); setIsManagingLiquidity(p => !p); };

  const handleClaim = async (poolKey) => {
    if (!isKeplrConnected) return;
    setIsModalOpen(true);
    setAnimationState("loading");
    try {
      await contract(contracts.exchange.contract, contracts.exchange.hash, {
        claim_rewards: { pools: [tokens[poolKey].contract] },
      });
      setAnimationState("success");
      refreshParent();
    } catch (e) {
      console.error(e);
      setAnimationState("error");
    }
  };

  const handleClaimAll = async () => {
    if (!isKeplrConnected) return;
    const pools = marketRows.filter(r => r.userRewards > 0).map(r => tokens[r.key].contract);
    if (!pools.length) return;
    setIsModalOpen(true);
    setAnimationState("loading");
    try {
      await contract(contracts.exchange.contract, contracts.exchange.hash, { claim_rewards: { pools } });
      setAnimationState("success");
      refreshParent();
    } catch (e) {
      console.error(e);
      setAnimationState("error");
    }
  };

  const fmt = (price) => {
    if (!price) return "$0.00";
    if (price < 0.0001) return `$${price.toFixed(8)}`;
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  const fmtN = (n) => {
    if (!n) return "$0";
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  };

  const fmtR = (r) => {
    if (!r) return "0";
    if (r < 0.0001) return r.toFixed(8);
    if (r < 0.01) return r.toFixed(6);
    return r.toFixed(4);
  };

  return (
    <div className="markets-page">
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      {isManagingLiquidity ? (
        <LiquidityManagement
          toggleManageLiquidity={toggleManageLiquidity}
          isKeplrConnected={isKeplrConnected}
          poolData={poolInfo}
          refreshParent={refreshParent}
        />
      ) : (
        <>
          {/* Header */}
          <div className="markets-header">
            <div className="markets-header-top">
              <h1 className="markets-title">Markets</h1>
              <p className="markets-subtitle">Trade and provide liquidity on Earth Exchange</p>
            </div>
            <div className="markets-header-stats">
              <div className="markets-header-stat">
                <span className="markets-header-stat-label">ERTH Price</span>
                <div className="markets-header-stat-row">
                  <img src="/images/coin/ERTH.png" alt="ERTH" className="markets-erth-logo" />
                  <span className="markets-header-stat-value green">{fmt(erthPrice)}</span>
                </div>
              </div>
              <div className="markets-header-divider" />
              <div className="markets-header-stat">
                <span className="markets-header-stat-label">Volume (7d)</span>
                <span className="markets-header-stat-value">{erthPrice ? fmtN(totalVolume7d * erthPrice) : "--"}</span>
                {totalVolume7d > 0 && <span className="markets-header-stat-sub">¤{Math.floor(totalVolume7d).toLocaleString()}</span>}
              </div>
              <div className="markets-header-divider" />
              <div className="markets-header-stat">
                <span className="markets-header-stat-label">Total TVL</span>
                <span className="markets-header-stat-value">{fmtN(totalTvlUsd)}</span>
                {marketRows.some(r => r.tvl > 0) && <span className="markets-header-stat-sub">¤{Math.floor(marketRows.reduce((s, r) => s + r.tvl, 0)).toLocaleString()}</span>}
              </div>
              <div className="markets-header-divider" />
              <div className="markets-header-stat">
                <span className="markets-header-stat-label">Next Rewards</span>
                <span className="markets-header-stat-value mono">{countdown}</span>
              </div>
            </div>
          </div>

          {/* Rewards Banner */}
          {totalRewards > 0 && isKeplrConnected && (
            <div className="markets-rewards-banner">
              <div className="markets-rewards-left">
                <span className="markets-rewards-label">Unclaimed Rewards</span>
                <span className="markets-rewards-amount">
                  {totalRewards.toLocaleString(undefined, { maximumFractionDigits: 2 })} ERTH
                </span>
                {erthPrice && <span className="markets-rewards-usd">{formatUSD(totalRewards * erthPrice)}</span>}
              </div>
              <button className="markets-claim-btn" onClick={handleClaimAll}>Claim All</button>
            </div>
          )}

          {/* Markets Table */}
          <div className="markets-table-card">
            <table className="markets-table">
              <thead>
                <tr>
                  <th className="th-pair">Pair</th>
                  <th>Price</th>
                  <th>Volume (7d)</th>
                  <th>Liquidity</th>
                  <th>APR</th>
                  <th>
                    Arb Depth
                    <span className="arb-tooltip">
                      ?
                      <span className="arb-tooltip-text">
                        Positive = ERTH underpriced (buy ERTH). Negative = ERTH overpriced (sell ERTH).
                      </span>
                    </span>
                  </th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {marketRows.map((row) => (
                  <tr key={row.key}>
                    <td className="td-pair">
                      <div className="pair-cell">
                        <img src={`/images/coin/${row.key}.png`} alt={row.key} className="pair-logo" />
                        <div className="pair-names">
                          <span className="pair-base">{row.key}</span>
                          <span className="pair-quote">/ ERTH</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="cell-primary green">{fmt(row.price)}</span>
                      {row.erthPerToken > 0 && (
                        <span className="cell-secondary">¤{row.erthPerToken.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      )}
                    </td>
                    <td>
                      <span className="cell-primary">{row.volume7d > 0 && erthPrice ? fmtN(row.volume7d * erthPrice) : "--"}</span>
                      {row.volume7d > 0 && (
                        <span className="cell-secondary">¤{Math.floor(row.volume7d).toLocaleString()}</span>
                      )}
                    </td>
                    <td>
                      <span className="cell-primary">{fmtN(row.liquidityUsd)}</span>
                      {row.tvl > 0 && (
                        <span className="cell-secondary">¤{Math.floor(row.tvl).toLocaleString()}</span>
                      )}
                    </td>
                    <td>
                      <span className={`cell-primary ${row.apr > 0 ? "green" : ""}`}>
                        {row.apr > 0 ? `${row.apr.toFixed(1)}%` : "--"}
                      </span>
                    </td>
                    <td>
                      <span className={`cell-primary ${row.arbDepth > 0 ? "green" : row.arbDepth < 0 ? "red" : ""}`}>
                        {row.arbDepth !== 0 ? `${row.arbDepth > 0 ? "+" : "-"}¤${Math.abs(row.arbDepth).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "¤0"}
                      </span>
                    </td>
                    <td className="td-actions">
                      <a href="/swap-tokens" className="action-btn trade-btn">Trade</a>
                      <button className="action-btn lp-btn" onClick={() => toggleManageLiquidity(row.poolData)}>
                        + LP
                      </button>
                      {row.userRewards > 0 && (
                        <button className="action-btn claim-btn" onClick={() => handleClaim(row.key)}>
                          Claim
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default Markets;
