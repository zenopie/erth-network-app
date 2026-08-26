import { ERTH_API_BASE_URL } from './config';

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
