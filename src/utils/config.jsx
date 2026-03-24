const isDev = import.meta.env.DEV;
export const ERTH_API_BASE_URL = isDev ? "/api" : "https://api.erth.network";
