// analyticsManager.js

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // if needed
const { SecretNetworkClient } = require("secretjs");

// Example token config
const tokens = {
  ERTH: {
    contract: "secret1...",
    hash: "xxx",
    decimals: 6,
    coingeckoId: "your-erth-id",
  },
  ANML: {
    contract: "secret1...",
    hash: "xxx",
    decimals: 6,
    coingeckoId: "your-anml-id",
    poolContract: "secret1poolcontract...",
    poolHash: "yyy",
  },
  // etc...
};

// Where to store persistent data
const ANALYTICS_FILE = path.join(__dirname, "analyticsData.json");

// In-memory history
let analyticsHistory = [];

// Secret client (use your actual settings)
const WALLET_KEY = "your_key";
const secretjs = new SecretNetworkClient({
  url: "https://lcd.archive.scrt.marionode.com",
  chainId: "secret-4",
  walletAddress: "secret1...", // or create a Wallet and pass in
});

// Load from file
function loadAnalyticsData() {
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      const raw = fs.readFileSync(ANALYTICS_FILE, "utf8");
      analyticsHistory = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error loading analytics data:", err);
  }
}

// Save to file
function saveAnalyticsData() {
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analyticsHistory, null, 2), "utf8");
}

// Core function: fetch prices, query pools, compute ERTH stats
async function updateErthValues() {
  try {
    console.log("[analyticsManager] Updating ERTH analytics...");

    // 1) Coingecko
    const tokenIds = Object.values(tokens)
      .filter(t => t.coingeckoId)
      .map(t => t.coingeckoId)
      .join(",");
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${tokenIds}&vs_currencies=usd`);
    const priceData = await priceRes.json();

    const prices = {};
    for (const k in tokens) {
      const t = tokens[k];
      if (t.coingeckoId && priceData[t.coingeckoId]) {
        prices[k] = priceData[t.coingeckoId].usd;
      }
    }

    // 2) ERTH supply
    const erthInfo = await secretjs.query.contractSmart(tokens.ERTH.contract, { token_info: {} });
    const totalSupplyRaw = erthInfo.token_info.total_supply;
    const erthTotalSupply = parseInt(totalSupplyRaw) / 10 ** tokens.ERTH.decimals;

    // 3) Pools -> ERTH price, TVL
    let poolData = [];
    let totalWeightedPrice = 0;
    let totalLiquidity = 0;

    for (const key in tokens) {
      const tk = tokens[key];
      if (key !== "ERTH" && tk.poolContract && prices[key]) {
        const poolRes = await secretjs.query.contractSmart(tk.poolContract, { query_state: {} });
        const st = poolRes.state;
        if (!st) continue;

        const erthReserve = parseInt(st.token_erth_reserve) / 10 ** tokens.ERTH.decimals;
        const tokenReserve = parseInt(st.token_b_reserve) / 10 ** tk.decimals;

        const poolPrice = (tokenReserve / erthReserve) * prices[key];
        const poolTVL = (tokenReserve * prices[key]) + (erthReserve * poolPrice);

        totalWeightedPrice += poolPrice * poolTVL;
        totalLiquidity += poolTVL;

        poolData.push({ token: key, erthPrice: poolPrice, tvl: poolTVL });
      }
    }

    const avgErthPrice = totalLiquidity ? totalWeightedPrice / totalLiquidity : 0;
    const erthMarketCap = avgErthPrice * erthTotalSupply;

    // Build record
    const dataPoint = {
      timestamp: Date.now(),
      erthPrice: avgErthPrice,
      erthTotalSupply,
      erthMarketCap,
      tvl: totalLiquidity,
      pools: poolData
    };

    analyticsHistory.push(dataPoint);
    saveAnalyticsData();

    console.log("[analyticsManager] Updated ERTH analytics:", dataPoint.erthPrice);
  } catch (err) {
    console.error("[analyticsManager] Error updating analytics:", err);
  }
}

// Allow the server to initialize and schedule
function initAnalytics() {
  // 1) load from file
  loadAnalyticsData();
  // 2) do immediate update
  updateErthValues();
  // 3) schedule every 5 minutes
  setInterval(updateErthValues, 5 * 60 * 1000);
}

// For server endpoints
function getLatestData() {
  if (!analyticsHistory.length) return null;
  return analyticsHistory[analyticsHistory.length - 1];
}
function getAllData() {
  return analyticsHistory;
}

// Export everything needed
module.exports = {
  initAnalytics,
  getLatestData,
  getAllData,
};
