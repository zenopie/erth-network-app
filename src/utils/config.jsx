const isDev = import.meta.env.DEV;
export const ERTH_API_BASE_URL = isDev ? "/api" : "https://api.erth.network";
export const BRIDGE_API_BASE_URL = isDev ? "/bridge-api" : "https://bridge.monero.erth.network";
