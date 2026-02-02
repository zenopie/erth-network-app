import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto";
import "./Analytics.css";
import { showLoadingScreen } from "../utils/uiUtils";
import { ERTH_API_BASE_URL } from "../utils/config";

const API_URL = `${ERTH_API_BASE_URL}/analytics`;

const TIME_RANGES = [
  { id: "24h", label: "24H", hours: 24 },
  { id: "7d", label: "7D", hours: 168 },
  { id: "30d", label: "30D", hours: 720 },
  { id: "all", label: "ALL", hours: Infinity },
];

const Analytics = () => {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [activeToken, setActiveToken] = useState("ERTH");
  const [timeRange, setTimeRange] = useState("7d");

  useEffect(() => {
    showLoadingScreen(true);

    fetch(API_URL)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setLatest(data.latest);
        setHistory(data.history);
        setError(null);
      })
      .catch((err) => {
        console.error("Error fetching analytics data:", err);
        setError("Failed to load analytics data. Please try again later.");
      })
      .finally(() => {
        showLoadingScreen(false);
      });
  }, []);

  // Get filtered history based on time range
  const getFilteredHistory = () => {
    if (!history.length) return [];
    const range = TIME_RANGES.find((r) => r.id === timeRange);
    if (!range || range.hours === Infinity) return history;
    return history.slice(-range.hours);
  };

  // Calculate price change
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

  // Get current token data
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
        description: "ERTH is the native utility and governance token of the Earth Network. It serves as the primary medium of exchange across all liquidity pools, enables governance participation, and provides access to ecosystem services. Earth network fees burn ERTH tokens. Earth network distibutions are defined as 4 ERTH minted per second, 1 each to buyback and burn ANML token, ERTH stakers, Deflation fund, and the Caretaker Fund.",
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
      description: "ANML is the proof of Identity token of the Earth Network. It is distributed at the rate of 1 ANML per person per day. 1/4 of ERTH emmissions buy back and burn ANML at the rate of 1 ERTH per second."
    };
  };

  // Format price
  const formatPrice = (price) => {
    if (!price) return "$0.00";
    if (price < 0.0001) return `$${price.toFixed(8)}`;
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  // Format large numbers
  const formatNumber = (num) => {
    if (!num) return "$0";
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  // Get chart labels
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

  // Chart configuration
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
    interaction: {
      mode: "index",
      intersect: false,
    },
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
        grid: {
          color: "#f3f4f6",
          drawBorder: false,
        },
        ticks: {
          color: "#9ca3af",
          font: { size: 11 },
          callback: (value) => formatPrice(value),
        },
      },
    },
  };

  if (error) {
    return (
      <div className="analytics-container">
        <div className="analytics-error">{error}</div>
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="analytics-container">
        <div className="analytics-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      {/* Token Selector */}
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

      {/* Price Header */}
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
        <div className="price-details">
          <div className="price-stats">
            <div className="price-stat">
              <span className="price-stat-label">Market Cap</span>
              <span className="price-stat-value">{formatNumber(token?.marketCap)}</span>
            </div>
            <div className="price-stat">
              <span className="price-stat-label">Total Supply</span>
              <span className="price-stat-value">{token?.totalSupply?.toLocaleString()} {token?.name}</span>
            </div>
          </div>
          <div className={`token-description ${activeToken.toLowerCase()}`}>
            <h4>About {token?.fullName}</h4>
            <p>{token?.description}</p>
          </div>
        </div>
      </div>

      {/* Time Range Selector */}
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

      {/* Chart */}
      <div className="chart-container">
        <Line data={chartData} options={chartOptions} />
      </div>

      {/* Stats Grid */}
      {latest?.pools && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total TVL</span>
            <span className="stat-value">
              {formatNumber(latest.pools.reduce((sum, p) => sum + p.tvl, 0))}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active Pools</span>
            <span className="stat-value">{latest.pools.length}</span>
          </div>
        </div>
      )}

      {/* Pools Section */}
      {latest?.pools?.length > 0 && (
        <div className="pools-section">
          <h3>Liquidity Pools</h3>
          <table className="pools-table">
            <thead>
              <tr>
                <th>Pool</th>
                <th>ERTH Price</th>
                <th>Token Price</th>
                <th>TVL</th>
                <th>
                  Arb Depth
                  <span className="arb-tooltip">
                    ?
                    <span className="arb-tooltip-text">
                      Positive = ERTH underpriced (buy ERTH). Negative = ERTH overpriced (sell ERTH).
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {latest.pools.map((pool, i) => (
                <tr key={i}>
                  <td className="pool-name-cell">
                    <div className="pool-name-cell-content">
                      <div className="pool-pair-logos">
                        <img src="/images/coin/ERTH.png" alt="ERTH" className="pool-logo" />
                        <img src={`/images/coin/${pool.token}.png`} alt={pool.token} className="pool-logo pool-logo-overlap" />
                      </div>
                      ERTH-{pool.token}
                    </div>
                  </td>
                  <td>{formatPrice(pool.erthPrice)}</td>
                  <td>{formatPrice(pool.tokenPrice)}</td>
                  <td>{formatNumber(pool.tvl)}</td>
                  <td>
                    <span className={`arb-value ${pool.arbDepth > 0 ? "positive" : pool.arbDepth < 0 ? "negative" : ""}`}>
                      {pool.arbDepth > 0 ? "+" : ""}{pool.arbDepth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Analytics;
