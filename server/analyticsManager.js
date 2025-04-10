// analyticsManager.js

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { Wallet, SecretNetworkClient } = require("secretjs");

// Use your token details from the front-end tokens file
const tokens = {
  ERTH: {
    contract: "secret16snu3lt8k9u0xr54j2hqyhvwnx9my7kq7ay8lp",
    hash: "638a3e1d50175fbcb8373cf801565283e3eb23d88a9b7b7f99fcc5eb1e6b561e",
    decimals: 6,
    logo: "/images/logo.png",
  },
  ANML: {
    contract: "secret14p6dhjznntlzw0yysl7p6z069nk0skv5e9qjut",
    hash: "638a3e1d50175fbcb8373cf801565283e3eb23d88a9b7b7f99fcc5eb1e6b561e",
    decimals: 6,
    logo: "/images/anml.png",
    lp: {
      contract: "secret1ztcedff57xqmt4lwnpdrz865rtrst037n6d8tq",
      hash: "638a3e1d50175fbcb8373cf801565283e3eb23d88a9b7b7f99fcc5eb1e6b561e",
      decimals: 6,
    },
  },
  FINA: {
    contract: "secret1s3z9xkpdsrhk86300tqnv6u466jmdmlegew2ve",
    hash: "cfecd51a022c520c55429d974363fd7f065d20474af6a362da8737f73b7d9e80",
    decimals: 6,
    logo: "/images/coin/FINA.webp",
    coingeckoId: "fina",
    lp: {
      contract: "secret14ttyephg7pvzzt0n53y888rvmeec5hl0pnf5tw",
      hash: "638a3e1d50175fbcb8373cf801565283e3eb23d88a9b7b7f99fcc5eb1e6b561e",
      decimals: 6,
    },
  },
  sSCRT: {
    contract: "secret1k0jntykt7e4g3y88ltc60czgjuqdy4c9e8fzek",
    hash: "af74387e276be8874f07bec3a87023ee49b0e7ebe08178c49d0a49c3c98ed60e",
    decimals: 6,
    logo: "/images/coin/SSCRT.png",
    coingeckoId: "secret",
    lp: {
      contract: "secret1hk5lj62949s88q7kl892rkxyhxcxdpznzlw924",
      hash: "638a3e1d50175fbcb8373cf801565283e3eb23d88a9b7b7f99fcc5eb1e6b561e",
      decimals: 6,
    },
  },
};

// Where to store persistent data
const ANALYTICS_FILE = path.join(__dirname, "analyticsData.json");

// Utility function to read file contents
function get_value(file) {
  const filePath = path.join(__dirname, file);
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return data.trim(); // Trim to remove any extra whitespace or newlines
  } catch (err) {
    console.error(err);
    return null; // Handle the error as needed
  }
}

// In-memory history
let analyticsHistory = [];
const WALLET_KEY = get_value("WALLET_KEY.txt");
// Initialize wallet and Secret Network client
const wallet = new Wallet(WALLET_KEY);
const secretjs = new SecretNetworkClient({
  url: "https://lcd.erth.network",
  chainId: "secret-4",
  wallet: wallet,
  walletAddress: wallet.address,
});

// Load analytics data from file
function loadAnalyticsData() {
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      const raw = fs.readFileSync(ANALYTICS_FILE, "utf8");
      analyticsHistory = JSON.parse(raw);
      console.log(`[analyticsManager] Loaded ${analyticsHistory.length} historical data points`);
    }
  } catch (err) {
    console.error("Error loading analytics data:", err);
  }
}

// Save analytics data to file
function saveAnalyticsData() {
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analyticsHistory, null, 2), "utf8");
}

// Reset analytics data
function resetAnalyticsData() {
  console.log("[analyticsManager] Resetting analytics data");
  analyticsHistory = [];
  saveAnalyticsData();
  console.log("[analyticsManager] Analytics data has been reset");
}

// Add unified pool query constants
const UNIFIED_POOL_CONTRACT = "secret1rj2phrf6x3v7526jrz60m2dcq58slyq2269kra"; // Exchange contract
const UNIFIED_POOL_HASH = "1c2220105c2a33edf4bbafacecb6cbdf317dac26289ada1df0cec1abc73895bd"; // Correct exchange contract hash

async function updateErthValues() {
  try {
    console.log("[analyticsManager] Updating ERTH analytics...");

    // 1) Fetch token prices from Coingecko (for tokens with coingeckoId)
    const tokenIds = Object.values(tokens)
      .filter((t) => t.coingeckoId)
      .map((t) => t.coingeckoId)
      .join(",");
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${tokenIds}&vs_currencies=usd`);
    const priceData = await priceRes.json();
    console.log("[DEBUG] Coingecko priceData:", priceData);
    const prices = {};
    for (const k in tokens) {
      const t = tokens[k];
      if (t.coingeckoId && priceData[t.coingeckoId]) {
        prices[k] = priceData[t.coingeckoId].usd;
      }
    }
    console.log("[DEBUG] Computed prices:", prices);

    // 2) Query ERTH total supply
    const erthInfo = await secretjs.query.compute.queryContract({
      contract_address: tokens.ERTH.contract,
      code_hash: tokens.ERTH.hash,
      query: { token_info: {} },
    });
    const erthTotalSupply = parseInt(erthInfo.token_info.total_supply) / Math.pow(10, tokens.ERTH.decimals);
    console.log("[DEBUG] ERTH total supply:", erthTotalSupply);

    // 3) Query ANML total supply
    const anmlInfo = await secretjs.query.compute.queryContract({
      contract_address: tokens.ANML.contract,
      code_hash: tokens.ANML.hash,
      query: { token_info: {} },
    });
    const anmlTotalSupply = parseInt(anmlInfo.token_info.total_supply) / Math.pow(10, tokens.ANML.decimals);
    console.log("[DEBUG] ANML total supply:", anmlTotalSupply);

    // 4) Build pool addresses list using each token's contract (for pools)
    const poolQueryTokens = [];
    const poolAddresses = [];
    for (const key in tokens) {
      const tk = tokens[key];
      // For pools we require a price (even if ANML doesn't have one, we check for its existence separately)
      if (key !== "ERTH" && tk.contract && (prices[key] !== undefined || key === "ANML")) {
        poolQueryTokens.push({ tokenKey: key, decimals: tk.decimals });
        poolAddresses.push(tk.contract);
      }
    }
    console.log("[DEBUG] Pool addresses:", poolAddresses);

    // 5) Unified query to fetch all pool info
    const unifiedPoolRes = await secretjs.query.compute.queryContract({
      contract_address: UNIFIED_POOL_CONTRACT,
      code_hash: UNIFIED_POOL_HASH,
      query: { query_pool_info: { pools: poolAddresses } },
    });
    console.log("[DEBUG] Unified pool response:", unifiedPoolRes);

    let totalWeightedPrice = 0;
    let totalLiquidity = 0;
    let poolData = [];
    let anmlPriceFinal = null;
    let anmlTVL = 0;
    let anmlData = null;

    // Process each pool
    for (let i = 0; i < unifiedPoolRes.length; i++) {
      const st = unifiedPoolRes[i];
      const tokenKey = poolQueryTokens[i].tokenKey;
      const tk = tokens[tokenKey];
      const erthReserve = parseInt(st.state.erth_reserve) / Math.pow(10, tokens.ERTH.decimals);
      const tokenReserve = parseInt(st.state.token_b_reserve) / Math.pow(10, tk.decimals);
      console.log(`[DEBUG] Pool ${tokenKey}: erthReserve=${erthReserve}, tokenReserve=${tokenReserve}`);
      if (erthReserve === 0) {
        console.error(`[ERROR] Zero ERTH reserve for pool ${tokenKey}`);
        continue;
      }
      if (tokenKey === "ANML") {
        // Store ANML pool data for later processing (ANML doesn't have a Coingecko price)
        anmlData = { tokenKey, tokenReserve, erthReserve };
      } else {
        // For non‑ANML pools, compute pool price from external token price
        const poolPrice = (tokenReserve / erthReserve) * prices[tokenKey];
        const poolTVL = tokenReserve * prices[tokenKey] + erthReserve * poolPrice;
        totalWeightedPrice += poolPrice * poolTVL;
        totalLiquidity += poolTVL;
        poolData.push({ token: tokenKey, erthPrice: poolPrice, tvl: poolTVL });
      }
    }

    // 6) Compute global ERTH price from non‑ANML pools
    const globalErthPrice = totalLiquidity ? totalWeightedPrice / totalLiquidity : 0;
    console.log("[DEBUG] Global ERTH price:", globalErthPrice);

    // 7) Process ANML pool using its reserves and the global ERTH price
    let anmlMarketCap = 0;
    if (anmlData) {
      // Derive ANML price from pool reserves: (ERTH reserve / ANML reserve) * global ERTH price
      anmlPriceFinal = (anmlData.erthReserve / anmlData.tokenReserve) * globalErthPrice;
      anmlTVL = anmlData.tokenReserve * anmlPriceFinal + anmlData.erthReserve * globalErthPrice;
      anmlMarketCap = anmlPriceFinal * anmlTotalSupply;
      totalLiquidity += anmlTVL;
      poolData.push({ token: "ANML", erthPrice: globalErthPrice, tvl: anmlTVL });
      console.log(`[DEBUG] ANML pool: anmlPrice=${anmlPriceFinal}, anmlTVL=${anmlTVL}, anmlMarketCap=${anmlMarketCap}`);
    }

    // 8) Create a single global data point including all pool data and total TVL, plus explicit ANML fields
    const now = new Date();
    // Set time to midnight (00:00:00) to store only the date part
    now.setHours(0, 0, 0, 0);

    const dataPoint = {
      timestamp: now.getTime(), // Use midnight timestamp to represent just the date
      erthPrice: globalErthPrice,
      erthTotalSupply,
      erthMarketCap: globalErthPrice * erthTotalSupply,
      tvl: totalLiquidity,
      pools: poolData,
      anmlPrice: anmlPriceFinal, // Explicit ANML price
      anmlTotalSupply, // Add ANML supply
      anmlMarketCap, // Add ANML market cap
    };

    // Add the new data point and trim history if needed
    analyticsHistory.push(dataPoint);
    saveAnalyticsData();
    console.log("[analyticsManager] Updated global analytics:", dataPoint);
  } catch (err) {
    console.error("[analyticsManager] Error updating analytics:", err);
  }
}

// Schedule next update to occur once per day at midnight
function scheduleNextUpdate() {
  const now = new Date();
  // Set target time to next midnight
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  // Calculate delay until next midnight
  const delay = tomorrow.getTime() - now.getTime();

  console.log(
    `[analyticsManager] Scheduling next update in ${Math.floor(delay / (1000 * 60 * 60))} hours (at midnight)`
  );

  setTimeout(() => {
    const updateTime = new Date();
    console.log(`[analyticsManager] Running scheduled update at ${updateTime.toLocaleTimeString()}`);
    updateErthValues().then(() => {
      // Schedule the next update after this one completes
      scheduleNextUpdate();
    });
  }, delay);
}

// Initialize analytics: load stored data, check if update is needed, then schedule for next day
function initAnalytics(resetData = false) {
  if (resetData) {
    resetAnalyticsData();
  } else {
    loadAnalyticsData();
  }

  // Check if we need to update (if no data or last entry is older than 1 day)
  const shouldUpdate = () => {
    if (analyticsHistory.length === 0) return true;

    const lastEntry = analyticsHistory[analyticsHistory.length - 1];
    const lastUpdateTime = new Date(lastEntry.timestamp);
    const now = new Date();

    // Calculate difference in days
    const diffTime = Math.abs(now - lastUpdateTime);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    console.log(`[analyticsManager] Last update was ${diffDays} day(s) ago`);
    return diffDays >= 1;
  };

  // Always update after a reset or if data is stale
  if (resetData || shouldUpdate()) {
    console.log("[analyticsManager] Updating analytics data");
    updateErthValues().then(() => {
      // After update, schedule next one for tomorrow
      scheduleNextUpdate();
    });
  } else {
    console.log("[analyticsManager] Analytics data is recent, scheduling next update for tomorrow");
    // Just schedule next update without updating now
    scheduleNextUpdate();
  }
}

// Endpoint helpers
function getLatestData() {
  return analyticsHistory.length ? analyticsHistory[analyticsHistory.length - 1] : null;
}

function getAllData() {
  return analyticsHistory;
}

// Export functions for use in your server
module.exports = {
  initAnalytics,
  getLatestData,
  getAllData,
  resetAnalyticsData,
};
