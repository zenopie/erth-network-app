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
    }
  } catch (err) {
    console.error("Error loading analytics data:", err);
  }
}



// Save analytics data to file
function saveAnalyticsData() {
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analyticsHistory, null, 2), "utf8");
}

// Add unified pool query constants
const UNIFIED_POOL_CONTRACT = "secret1rj2phrf6x3v7526jrz60m2dcq58slyq2269kra"; // update this
const UNIFIED_POOL_HASH = "181961565c71048fc45fcded880edd943a1c8095e5031148f7f3e6f6d8d6d722"; // update this

async function updateErthValues() {
  try {
    console.log("[analyticsManager] Updating ERTH analytics...");

    // 1) Fetch token prices from Coingecko
    const tokenIds = Object.values(tokens)
      .filter(t => t.coingeckoId)
      .map(t => t.coingeckoId)
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
      query: { token_info: {} }
    });
    console.log("[DEBUG] ERTH token info:", erthInfo);
    const erthTotalSupply = parseInt(erthInfo.token_info.total_supply) / Math.pow(10, tokens.ERTH.decimals);
    console.log("[DEBUG] ERTH total supply:", erthTotalSupply);

    // 3) Build pool address list for tokens with pool info
    const poolQueryTokens = [];
    const poolAddresses = [];
    for (const key in tokens) {
      const tk = tokens[key];
      if (key !== "ERTH" && tk.poolContract && prices[key]) {
        poolQueryTokens.push({ tokenKey: key, decimals: tk.decimals });
        poolAddresses.push(tk.poolContract);
      }
    }
    console.log("[DEBUG] Pool addresses:", poolAddresses);

    // Unified query call to fetch all pool info in one go
    const unifiedPoolRes = await secretjs.query.compute.queryContract({
      contract_address: UNIFIED_POOL_CONTRACT,
      code_hash: UNIFIED_POOL_HASH,
      query: { query_pool_info: { pools: poolAddresses } }
    });
    console.log("[DEBUG] Unified pool response:", unifiedPoolRes);

    // 4) Process pool info to calculate ERTH price and TVL
    let poolData = [];
    let totalWeightedPrice = 0;
    let totalLiquidity = 0;

    for (let i = 0; i < unifiedPoolRes.length; i++) {
      const st = unifiedPoolRes[i];
      const tokenKey = poolQueryTokens[i].tokenKey;
      const tk = tokens[tokenKey];

      const erthReserveRaw = st.token_erth_reserve;
      const tokenReserveRaw = st.token_b_reserve;
      const erthReserve = parseInt(erthReserveRaw) / Math.pow(10, tokens.ERTH.decimals);
      const tokenReserve = parseInt(tokenReserveRaw) / Math.pow(10, tk.decimals);
      console.log(`[DEBUG] Pool ${tokenKey}: erthReserveRaw=${erthReserveRaw}, tokenReserveRaw=${tokenReserveRaw}`);
      console.log(`[DEBUG] Pool ${tokenKey}: erthReserve=${erthReserve}, tokenReserve=${tokenReserve}`);

      if (erthReserve === 0) {
        console.error(`[ERROR] Zero ERTH reserve for pool ${tokenKey}`);
        continue;
      }

      const poolPrice = (tokenReserve / erthReserve) * prices[tokenKey];
      const poolTVL = (tokenReserve * prices[tokenKey]) + (erthReserve * poolPrice);
      console.log(`[DEBUG] Pool ${tokenKey}: poolPrice=${poolPrice}, poolTVL=${poolTVL}`);

      totalWeightedPrice += poolPrice * poolTVL;
      totalLiquidity += poolTVL;

      poolData.push({ token: tokenKey, erthPrice: poolPrice, tvl: poolTVL });
    }

    console.log("[DEBUG] totalWeightedPrice:", totalWeightedPrice, "totalLiquidity:", totalLiquidity);

    const avgErthPrice = totalLiquidity ? totalWeightedPrice / totalLiquidity : 0;
    const erthMarketCap = avgErthPrice * erthTotalSupply;

    // 5) Save analytics data
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
  setInterval(updateErthValues,   1 * 60 * 60 * 1000);
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
