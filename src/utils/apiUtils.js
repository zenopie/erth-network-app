import { ERTH_API_BASE_URL } from './config';

const coingeckoPriceCache = new Map();
const COINGECKO_CACHE_TTL = 60000; // 1 minute cache

/**
 * Fetches the current USD price for a token from CoinGecko
 * @param {string} coingeckoId - The CoinGecko ID for the token
 * @returns {Promise<number|null>} The USD price or null if fetch fails
 */
export async function fetchCoingeckoPrice(coingeckoId) {
  if (!coingeckoId) return null;

  const cached = coingeckoPriceCache.get(coingeckoId);
  if (cached && Date.now() - cached.timestamp < COINGECKO_CACHE_TTL) {
    return cached.price;
  }

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`
    );
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    const price = data[coingeckoId]?.usd ?? null;

    if (price !== null) {
      coingeckoPriceCache.set(coingeckoId, { price, timestamp: Date.now() });
    }
    return price;
  } catch (error) {
    console.error(`Error fetching CoinGecko price for ${coingeckoId}:`, error);
    return null;
  }
}

/**
 * Fetches the current ERTH price from the backend API
 * @returns {Promise<{price: number, timestamp: string, marketCap: number}>}
 */
export async function fetchErthPrice() {
  try {
    const response = await fetch(`${ERTH_API_BASE_URL}/erth-price`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching ERTH price:', error);
    throw error;
  }
}

/**
 * Hook to fetch and cache ERTH price with periodic updates
 * @param {number} updateInterval - Update interval in milliseconds (default: 60000 = 1 minute)
 * @returns {{price: number|null, loading: boolean, error: string|null}}
 */
export function useErthPrice(updateInterval = 60000) {
  // This is a simple implementation that can be enhanced with React hooks in components
  // For now, we'll just export the fetch function
  return null;
}

/**
 * Format a USD value for display
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted USD string
 */
export function formatUSD(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) {
    return '$0.00';
  }
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
