import os
import json
import time
import asyncio
import aiohttp
from typing import List, Dict, Any

# Import shared resources and configuration
import config
from dependencies import secret_client

# In-memory cache for analytics data
analytics_history: List[Dict[str, Any]] = []

# --- File Handling ---

def load_analytics_data():
    """
    Loads historical analytics data from the JSON file into the in-memory cache.
    If the file doesn't exist, it initializes an empty list.
    """
    global analytics_history
    try:
        if os.path.exists(config.ANALYTICS_FILE):
            with open(config.ANALYTICS_FILE, "r") as f:
                analytics_history = json.load(f)
                print(f"[Analytics] Loaded {len(analytics_history)} historical data points from {config.ANALYTICS_FILE}")
        else:
            analytics_history = []
            print(f"[Analytics] No analytics file found at {config.ANALYTICS_FILE}. Starting fresh.")
    except Exception as e:
        analytics_history = []
        print(f"[Analytics] ERROR: Could not load analytics data: {e}. Starting fresh.")

def save_analytics_data():
    """Saves the current in-memory analytics history to the JSON file."""
    try:
        with open(config.ANALYTICS_FILE, "w") as f:
            json.dump(analytics_history, f, indent=2)
            print(f"[Analytics] Successfully saved {len(analytics_history)} data points to {config.ANALYTICS_FILE}")
    except Exception as e:
        print(f"[Analytics] ERROR: Could not save analytics data: {e}")

# --- Core Analytics Logic ---

async def update_analytics_job():
    """
    The main job to be run by the scheduler. It fetches all necessary data
    from external APIs and on-chain contracts to build a new analytics data point.
    """
    print("[Analytics] Starting scheduled update...")
    try:
        # 1. Fetch prices for sSCRT and FINA from CoinGecko
        token_ids_to_fetch = [t["coingeckoId"] for t in config.TOKENS.values() if "coingeckoId" in t]
        coingecko_ids_str = ",".join(token_ids_to_fetch)
        price_url = f"https://api.coingecko.com/api/v3/simple/price?ids={coingecko_ids_str}&vs_currencies=usd"
        
        prices = {}
        async with aiohttp.ClientSession() as session:
            print(f"[Analytics] Fetching prices from CoinGecko for: {coingecko_ids_str}")
            async with session.get(price_url) as resp:
                if resp.status != 200:
                    raise Exception(f"CoinGecko API call failed with status {resp.status}: {await resp.text()}")
                price_data = await resp.json()
                print(f"[Analytics] CoinGecko response: {price_data}")

                # Map prices back to our token symbols (sSCRT, FINA)
                for symbol, token_info in config.TOKENS.items():
                    if "coingeckoId" in token_info and token_info["coingeckoId"] in price_data:
                        prices[symbol] = price_data[token_info["coingeckoId"]]["usd"]

        print(f"[Analytics] Fetched prices (USD): {prices}")

        # 2. Query token total supplies
        print("[Analytics] Querying ERTH and ANML total supply...")
        erth_info = secret_client.wasm.contract_query(config.TOKENS['ERTH']['contract'], {"token_info": {}})
        erth_total_supply = int(erth_info["token_info"]["total_supply"]) / (10**config.TOKENS['ERTH']['decimals'])

        anml_info = secret_client.wasm.contract_query(config.TOKENS['ANML']['contract'], {"token_info": {}})
        anml_total_supply = int(anml_info["token_info"]["total_supply"]) / (10**config.TOKENS['ANML']['decimals'])
        print(f"[Analytics] ERTH Supply: {erth_total_supply}, ANML Supply: {anml_total_supply}")

        # 3. Query the unified pool for reserves
        # Get contract addresses for all tokens except ERTH
        pool_addresses = [t["contract"] for k, t in config.TOKENS.items() if k != "ERTH"]
        print(f"[Analytics] Querying unified pool {config.UNIFIED_POOL_CONTRACT}...")
        unified_pool_res = secret_client.wasm.contract_query(
            config.UNIFIED_POOL_CONTRACT, {"query_pool_info": {"pools": pool_addresses}}
        )
        print(f"[Analytics] Unified pool response received.")

        # 4. Calculate ERTH price based on weighted TVL
        total_weighted_price = 0
        total_liquidity_for_erth_calc = 0
        all_pool_data = []
        anml_pool_reserves = None
        global_erth_price = 0

        # First pass: process pools with known prices (sSCRT, FINA) to determine ERTH price
        for i, pool_state in enumerate(unified_pool_res):
            # Determine which token this pool is for. Assumes a consistent order.
            # Skips ERTH (index 0) and maps to ANML, FINA, sSCRT
            token_symbol = list(config.TOKENS.keys())[i + 1]
            token_meta = config.TOKENS[token_symbol]
            
            erth_reserve = int(pool_state["state"]["erth_reserve"]) / (10**config.TOKENS['ERTH']['decimals'])
            token_reserve = int(pool_state["state"]["token_b_reserve"]) / (10**token_meta['decimals'])
            
            if token_symbol == "ANML":
                anml_pool_reserves = {"erth_reserve": erth_reserve, "token_reserve": token_reserve}
                continue # Skip ANML for now, we'll process it after we have ERTH price
            
            # For FINA and sSCRT pools
            token_price_usd = prices[token_symbol]
            pool_erth_price = (token_reserve / erth_reserve) * token_price_usd if erth_reserve else 0
            pool_tvl = (token_reserve * token_price_usd) + (erth_reserve * pool_erth_price)

            total_weighted_price += pool_erth_price * pool_tvl
            total_liquidity_for_erth_calc += pool_tvl

            all_pool_data.append({"token": token_symbol, "tvl": pool_tvl})

        if total_liquidity_for_erth_calc > 0:
            global_erth_price = total_weighted_price / total_liquidity_for_erth_calc
        print(f"[Analytics] Global ERTH Price calculated: ${global_erth_price:.6f}")

        # 5. Second pass: Calculate ANML price and TVL using the now-known ERTH price
        anml_price_usd = 0
        if anml_pool_reserves and anml_pool_reserves["token_reserve"] > 0:
            anml_price_usd = (anml_pool_reserves["erth_reserve"] / anml_pool_reserves["token_reserve"]) * global_erth_price
            anml_tvl = (anml_pool_reserves["token_reserve"] * anml_price_usd) + (anml_pool_reserves["erth_reserve"] * global_erth_price)
            all_pool_data.append({"token": "ANML", "tvl": anml_tvl})
        print(f"[Analytics] ANML Price calculated: ${anml_price_usd:.6f}")

        # 6. Assemble the final data point
        total_tvl = sum(p['tvl'] for p in all_pool_data)
        
        # Normalize timestamp to the beginning of the current day (UTC)
        now_utc_day_start = int(time.time() // 86400 * 86400 * 1000)

        data_point = {
            "timestamp": now_utc_day_start,
            "erthPrice": global_erth_price,
            "erthTotalSupply": erth_total_supply,
            "erthMarketCap": global_erth_price * erth_total_supply,
            "tvl": total_tvl,
            "pools": all_pool_data,
            "anmlPrice": anml_price_usd,
            "anmlTotalSupply": anml_total_supply,
            "anmlMarketCap": anml_price_usd * anml_total_supply,
        }

        # Avoid adding duplicate entries for the same day
        if any(p['timestamp'] == now_utc_day_start for p in analytics_history):
            print(f"[Analytics] Data for timestamp {now_utc_day_start} already exists. Skipping add.")
        else:
            analytics_history.append(data_point)
            print(f"[Analytics] New data point created: {data_point}")
            save_analytics_data()

    except Exception as e:
        print(f"[Analytics] FATAL ERROR during analytics update: {e}")
        # Optionally, re-raise the exception if you want the scheduler to log it as a job failure
        # raise e

# --- Initialization ---

def init_analytics():
    """
    Initializes the analytics manager. This should be called once on application startup.
    It loads historical data and runs an immediate update if the data is stale.
    """
    print("[Analytics] Initializing...")
    load_analytics_data()

    # Check if the last data point is older than 24 hours
    is_stale = True
    if analytics_history:
        last_timestamp_ms = analytics_history[-1]["timestamp"]
        # Convert ms to seconds for comparison
        if (time.time() - last_timestamp_ms / 1000) < 86400: # 24 * 60 * 60 seconds
            is_stale = False

    if is_stale:
        print("[Analytics] Data is stale or missing. Running initial update now.")
        # Run the async update function in a blocking way for startup
        asyncio.run(update_analytics_job())
    else:
        print("[Analytics] Data is up-to-date. Next update will be scheduled.")