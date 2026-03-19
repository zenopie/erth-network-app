import { useEffect, useState, useMemo } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";
import "./Analytics.css";
import { ERTH_API_BASE_URL } from "../utils/config";

const ANALYTICS_URL = `${ERTH_API_BASE_URL}/analytics`;
const TICKERS_URL = `${ERTH_API_BASE_URL}/tickers`;

const TIME_RANGES = [
  { id: "24h", label: "24H", hours: 24 },
  { id: "7d", label: "7D", hours: 168 },
  { id: "30d", label: "30D", hours: 720 },
  { id: "all", label: "ALL", hours: Infinity },
];

const Analytics = () => {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [tickers, setTickers] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeToken, setActiveToken] = useState("ERTH");
  const [timeRange, setTimeRange] = useState("7d");

  useEffect(() => {
    const fetchData = () => {
      Promise.all([
        fetch(ANALYTICS_URL).then((r) => {
          if (!r.ok) throw new Error(`Analytics: ${r.status}`);
          return r.json();
        }),
        fetch(TICKERS_URL).then((r) => {
          if (!r.ok) throw new Error(`Tickers: ${r.status}`);
          return r.json();
        }),
      ])
        .then(([analyticsData, tickersData]) => {
          setLatest(analyticsData.latest);
          setHistory(analyticsData.history);
          setTickers(tickersData);
          setError(null);
        })
        .catch((err) => {
          console.error("Error fetching data:", err);
          setError("Failed to load exchange data. Please try again later.");
        })
        .finally(() => {
          setLoading(false);
        });
    };

    fetchData();

    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      Promise.all([
        fetch(ANALYTICS_URL).then((r) => r.json()),
        fetch(TICKERS_URL).then((r) => r.json()),
      ])
        .then(([analyticsData, tickersData]) => {
          setLatest(analyticsData.latest);
          setTickers(tickersData);
        })
        .catch(console.error);
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Merge tickers with analytics pool data for display names
  const enrichedPairs = useMemo(() => {
    if (!tickers.length || !latest?.pools) return [];

    const sortedPools = [...latest.pools].sort((a, b) => b.tvl - a.tvl);
    const sortedTickers = [...tickers].sort(
      (a, b) => parseFloat(b.liquidity_in_usd) - parseFloat(a.liquidity_in_usd)
    );

    return sortedTickers.map((ticker, i) => {
      const pool = sortedPools[i] || null;
      const erthPriceUsd = pool?.erthPrice || latest.erthPrice;
      return {
        tickerId: ticker.ticker_id,
        pairName: pool ? `ERTH / ${pool.token}` : ticker.ticker_id,
        targetToken: pool?.token || "",
        lastPrice: parseFloat(ticker.last_price),
        erthPriceUsd,
        baseVolume: parseFloat(ticker.base_volume),
        targetVolume: parseFloat(ticker.target_volume),
        volumeUsd: parseFloat(ticker.base_volume) * erthPriceUsd,
        liquidityUsd: parseFloat(ticker.liquidity_in_usd),
        bid: parseFloat(ticker.bid),
        ask: parseFloat(ticker.ask),
        tokenPriceUsd: pool?.tokenPrice || 0,
      };
    });
  }, [tickers, latest]);

  // Overview stats
  const totalTvl = latest?.tvl || 0;
  const total24hVolume = useMemo(
    () => enrichedPairs.reduce((sum, p) => sum + p.volumeUsd, 0),
    [enrichedPairs]
  );

  // --- Token analysis logic (existing) ---

  const getFilteredHistory = () => {
    if (!history.length) return [];
    const range = TIME_RANGES.find((r) => r.id === timeRange);
    if (!range || range.hours === Infinity) return history;
    return history.slice(-range.hours);
  };

  const calculatePriceChange = (hours) => {
    if (!history.length) return { value: 0, isPositive: true };
    const priceKey = activeToken === "ERTH" ? "erthPrice" : "anmlPrice";
    const relevantHistory = history.slice(-hours);
    if (relevantHistory.length < 2) return { value: 0, isPositive: true };

    const oldPrice = relevantHistory[0][priceKey];
    const newPrice = relevantHistory[relevantHistory.length - 1][priceKey];
    if (!oldPrice || !newPrice) return { value: 0, isPositive: true };

    const change = ((newPrice - oldPrice) / oldPrice) * 100;
    return {
      value: Math.abs(change).toFixed(2),
      isPositive: change >= 0,
    };
  };

  const getTokenData = () => {
    if (!latest) return null;
    if (activeToken === "ERTH") {
      return {
        name: "ERTH",
        fullName: "Earth Token",
        price: latest.erthPrice,
        marketCap: latest.erthMarketCap,
        totalSupply: latest.erthTotalSupply,
        priceKey: "erthPrice",
        color: "#16a34a",
        bgColor: "rgba(22, 163, 74, 0.1)",
      };
    }
    return {
      name: "ANML",
      fullName: "Animal Token",
      price: latest.anmlPrice,
      marketCap: latest.anmlMarketCap || latest.anmlPrice * latest.anmlTotalSupply,
      totalSupply: latest.anmlTotalSupply,
      priceKey: "anmlPrice",
      color: "#1e3a8a",
      bgColor: "rgba(30, 58, 138, 0.1)",
    };
  };

  const formatPrice = (price) => {
    if (!price) return "$0.00";
    if (price < 0.0001) return `$${price.toFixed(8)}`;
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatNumber = (num) => {
    if (!num) return "$0";
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatRate = (rate) => {
    if (!rate) return "0";
    if (rate < 0.0001) return rate.toFixed(8);
    if (rate < 0.01) return rate.toFixed(6);
    if (rate < 1) return rate.toFixed(4);
    return rate.toFixed(4);
  };

  const getChartLabels = () => {
    const filtered = getFilteredHistory();
    return filtered.map((d) => {
      const date = new Date(d.timestamp);
      if (timeRange === "24h") {
        return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
      } else if (timeRange === "7d") {
        return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      } else {
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
    });
  };

  const token = getTokenData();
  const selectedRange = TIME_RANGES.find((r) => r.id === timeRange);
  const selectedChange = calculatePriceChange(selectedRange?.hours || 168);

  const chartData = {
    labels: getChartLabels(),
    datasets: [
      {
        data: getFilteredHistory().map((d) => d[token?.priceKey]),
        fill: true,
        borderColor: token?.color,
        backgroundColor: token?.bgColor,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: token?.color,
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1f2937",
        titleColor: "#fff",
        bodyColor: "#fff",
        padding: 12,
        displayColors: false,
        callbacks: {
          title: (items) => {
            const idx = items[0].dataIndex;
            const d = getFilteredHistory()[idx];
            return new Date(d.timestamp).toLocaleString();
          },
          label: (context) => formatPrice(context.parsed.y),
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: { display: false },
        ticks: {
          color: "#9ca3af",
          font: { size: 11 },
          maxTicksLimit: timeRange === "24h" ? 8 : timeRange === "7d" ? 7 : 10,
          maxRotation: 0,
        },
      },
      y: {
        display: true,
        position: "right",
        grid: { color: "#f3f4f6", drawBorder: false },
        ticks: {
          color: "#9ca3af",
          font: { size: 11 },
          callback: (value) => formatPrice(value),
        },
      },
    },
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="analytics-container">
        <div className="info-loading">
          <div className="info-spinner"></div>
          <p>Loading exchange data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-container">
        <div className="info-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      {/* Overview Cards */}
      <div className="info-overview">
        <div className="info-card">
          <span className="info-card-label">Total Value Locked</span>
          <span className="info-card-value">{formatNumber(totalTvl)}</span>
        </div>
        <div className="info-card">
          <span className="info-card-label">24h Trading Volume</span>
          <span className="info-card-value">{formatNumber(total24hVolume)}</span>
        </div>
        <div className="info-card">
          <span className="info-card-label">ERTH Price</span>
          <span className="info-card-value">{formatPrice(latest?.erthPrice)}</span>
        </div>
        <div className="info-card">
          <span className="info-card-label">Trading Pairs</span>
          <span className="info-card-value">{enrichedPairs.length}</span>
        </div>
      </div>

      {/* Trading Pairs Table */}
      {enrichedPairs.length > 0 && (
        <div className="pairs-section">
          <h2>Trading Pairs</h2>
          <div className="pairs-table-wrapper">
            <table className="pairs-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pair</th>
                  <th>Last Price</th>
                  <th>24h Volume</th>
                  <th>Liquidity</th>
                  <th>Bid</th>
                  <th>Ask</th>
                </tr>
              </thead>
              <tbody>
                {enrichedPairs.map((pair, i) => (
                  <tr key={pair.tickerId}>
                    <td className="pair-index">{i + 1}</td>
                    <td className="pair-name-cell">
                      <div className="pair-name-content">
                        <div className="pair-logos">
                          <img src="/images/coin/ERTH.png" alt="ERTH" className="pair-logo" />
                          <img
                            src={`/images/coin/${pair.targetToken}.png`}
                            alt={pair.targetToken}
                            className="pair-logo pair-logo-overlap"
                          />
                        </div>
                        <span className="pair-name-text">{pair.pairName}</span>
                      </div>
                    </td>
                    <td>
                      <div className="price-cell">
                        <span className="price-usd">{formatPrice(pair.erthPriceUsd)}</span>
                        <span className="price-rate">
                          {formatRate(pair.lastPrice)} {pair.targetToken}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="volume-cell">
                        <span className="volume-usd">{formatNumber(pair.volumeUsd)}</span>
                        <span className="volume-detail">
                          {pair.baseVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} ERTH
                        </span>
                      </div>
                    </td>
                    <td className="liquidity-value">{formatNumber(pair.liquidityUsd)}</td>
                    <td className="mono">{formatRate(pair.bid)}</td>
                    <td className="mono">{formatRate(pair.ask)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Token Analysis Section */}
      {latest && (
        <div className="token-analysis-section">
          <h2>Token Analysis</h2>

          <div className="token-selector">
            <button
              className={`token-btn ${activeToken === "ERTH" ? "active erth" : ""}`}
              onClick={() => setActiveToken("ERTH")}
            >
              <img src="/images/coin/ERTH.png" alt="ERTH" className="token-logo-small" />
              ERTH
            </button>
            <button
              className={`token-btn ${activeToken === "ANML" ? "active anml" : ""}`}
              onClick={() => setActiveToken("ANML")}
            >
              <img src="/images/coin/ANML.png" alt="ANML" className="token-logo-small" />
              ANML
            </button>
          </div>

          <div className="price-header">
            <div className="price-main">
              <img src={`/images/coin/${token?.name}.png`} alt={token?.name} className="token-logo-large" />
              <div className="price-info">
                <div className="price-text">
                  <span className="token-name">{token?.fullName}</span>
                  <div className="price-row">
                    <span className="current-price">{formatPrice(token?.price)}</span>
                    <span className={`price-badge ${selectedChange.isPositive ? "positive" : "negative"}`}>
                      {selectedChange.isPositive ? "+" : "-"}{selectedChange.value}%
                      <span className="badge-period">({timeRange.toUpperCase()})</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="price-stats">
              <div className="price-stat">
                <span className="price-stat-label">Market Cap</span>
                <span className="price-stat-value">{formatNumber(token?.marketCap)}</span>
              </div>
              <div className="price-stat">
                <span className="price-stat-label">Total Supply</span>
                <span className="price-stat-value">
                  {Math.floor(token?.totalSupply)?.toLocaleString()} {token?.name}
                </span>
              </div>
            </div>
          </div>

          <div className="time-selector">
            {TIME_RANGES.map((range) => (
              <button
                key={range.id}
                className={`time-btn ${timeRange === range.id ? "active" : ""}`}
                onClick={() => setTimeRange(range.id)}
              >
                {range.label}
              </button>
            ))}
          </div>

          <div className="chart-container">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      )}

    </div>
  );
};

export default Analytics;
