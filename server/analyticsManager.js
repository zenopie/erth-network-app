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
    logo: "/images/logo.png"
    // Optionally add a coingeckoId if available (e.g., "erth") if needed for pricing
  },
  ANML: {
    contract: "secret14p6dhjznntlzw0yysl7p6z069nk0skv5e9qjut",
    hash: "638a3e1d50175fbcb8373cf801565283e3eb23d88a9b7b7f99fcc5eb1e6b561e",
    decimals: 6,
    poolContract: "secret1dduup4qyg8qpt94gaf93e8nctzfnzy43gj7ky3",
    poolHash: "c85cd2154b020b868c2e0790091cd092273c88fb35c6a560eaf24e3488c5a039",
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
    poolContract: "secret1tfrkp459jtvlhkev39yr6avkq3qjmffu8sc6c7",
    poolHash: "c85cd2154b020b868c2e0790091cd092273c88fb35c6a560eaf24e3488c5a039",
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
    poolContract: "secret1qp8ed8qdnf9q8l6w3jqehnda4d5m842ch79600",
    poolHash: "c85cd2154b020b868c2e0790091cd092273c88fb35c6a560eaf24e3488c5a039",
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
    }
  } catch (err) {
    console.error("Error loading analytics data:", err);
  }
}



// Save analytics data to file
function saveAnalyticsData() {
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analyticsHistory, null, 2), "utf8");
}

// Core function: fetch prices, query pools, compute ERTH stats
async function updateErthValues() {
  try {
    console.log("[analyticsManager] Updating ERTH analytics...");

    // 1) Fetch token prices from Coingecko (only tokens with coingeckoId)
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

    // 2) Query ERTH total supply
    const erthInfo = await secretjs.query.compute.queryContract({
        contractAddress: tokens.ERTH.contract,
        codeHash: tokens.ERTH.hash,
        query: { token_info: {} }
      });
      
    const totalSupplyRaw = erthInfo.token_info.total_supply;
    const erthTotalSupply = parseInt(totalSupplyRaw) / Math.pow(10, tokens.ERTH.decimals);

    // 3) Query pools and calculate ERTH price & TVL
    let poolData = [];
    let totalWeightedPrice = 0;
    let totalLiquidity = 0;

    for (const key in tokens) {
      const tk = tokens[key];
      if (key !== "ERTH" && tk.poolContract && prices[key]) {
        const poolRes = await secretjs.query.compute.queryContract({
            contractAddress: tk.poolContract,
            codeHash: tk.poolHash,
            query: { query_state: {} }
        });
        const st = poolRes.state;
        if (!st) continue;

        const erthReserve = parseInt(st.token_erth_reserve) / Math.pow(10, tokens.ERTH.decimals);
        const tokenReserve = parseInt(st.token_b_reserve) / Math.pow(10, tk.decimals);

        const poolPrice = (tokenReserve / erthReserve) * prices[key];
        const poolTVL = (tokenReserve * prices[key]) + (erthReserve * poolPrice);

        totalWeightedPrice += poolPrice * poolTVL;
        totalLiquidity += poolTVL;

        poolData.push({ token: key, erthPrice: poolPrice, tvl: poolTVL });
      }
    }

    const avgErthPrice = totalLiquidity ? totalWeightedPrice / totalLiquidity : 0;
    const erthMarketCap = avgErthPrice * erthTotalSupply;

    // Build a data record
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

// Initialize analytics: load stored data, update immediately, then schedule every 5 minutes
function initAnalytics() {
  loadAnalyticsData();
  updateErthValues();
  setInterval(updateErthValues, 5 * 60 * 1000);
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
};
