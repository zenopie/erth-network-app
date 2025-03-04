import React, { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import "chart.js/auto"; // For Chart.js v4
import "./Analytics.css";
import { showLoadingScreen } from "../utils/uiUtils";

const Analytics = () => {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    fetch("/api/analytics")
      .then((res) => res.json())
      .then((data) => {
        setLatest(data.latest);
        setHistory(data.history);
      })
      .catch(console.error);
    showLoadingScreen(false);
  }, []);

  // Prepare chart data (e.g. x=timestamp, y=ERTH price)
  const chartData = {
    labels: history.map((d) => new Date(d.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: "ERTH Price (USD)",
        data: history.map((d) => d.erthPrice),
        fill: false,
        borderColor: "blue",
        tension: 0.1,
      },
    ],
  };

  return (
    <div className="analytics-page">
      <h2>Analytics</h2>
      {!latest ? (
        <p className="analytics-loading-message">Loading data...</p>
      ) : (
        <>
          <div className="analytics-info">
            <div className="analytics-info-item">
              <span className="analytics-info-label">ERTH Price:</span>
              <span className="analytics-info-value">${latest.erthPrice.toFixed(6)}</span>
            </div>

            <div className="analytics-info-item">
              <span className="analytics-info-label">Market Cap:</span>
              <span className="analytics-info-value">
                $
                {latest.erthMarketCap.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            <div className="analytics-info-item">
              <span className="analytics-info-label">Total Supply:</span>
              <span className="analytics-info-value">{latest.erthTotalSupply.toLocaleString()} ERTH</span>
            </div>

            <div className="analytics-info-item">
              <span className="analytics-info-label">TVL:</span>
              <span className="analytics-info-value">
                $
                {latest.tvl.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            <div className="analytics-info-item">
              <span className="analytics-info-label">ANML Price:</span>
              <span className="analytics-info-value">${latest.anmlPrice.toFixed(6)}</span>
            </div>
          </div>

          {/* Pools table */}
          {latest.pools && latest.pools.length > 0 && (
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Pool</th>
                  <th>ERTH Price</th>
                  <th>Liquidity (USD)</th>
                </tr>
              </thead>
              <tbody>
                {latest.pools.map((pool, i) => (
                  <tr key={i}>
                    <td>ERTH-{pool.token}</td>
                    <td>${pool.erthPrice.toFixed(6)}</td>
                    <td>
                      $
                      {pool.tvl.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Chart */}
          {history.length > 1 && (
            <div className="analytics-chart-container">
              <Line data={chartData} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Analytics;
