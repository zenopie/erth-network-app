# /routers/analytics.py
import os
import json
import time
import asyncio
import aiohttp
from typing import List, Dict, Any
from fastapi import APIRouter

# Import shared resources and configuration
import config
from dependencies import secret_client

# --- Module-level variables for this router ---
router = APIRouter()
analytics_history: List[Dict[str, Any]] = []

# --- File Handling ---

def load_analytics_data():
    """
    Loads historical analytics data from the JSON file into the in-memory cache.
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
    to build and save a new analytics data point using the correct logic.
    """
    print("[Analytics] Starting scheduled update...")
    try:
        # 1. Fetch prices for sSCRT and FINA from CoinGecko
        token_ids_to_fetch = [t["coingeckoId"] for t in config.TOKENS.values() if "coingeckoId" in t]
        coingecko_ids_str = ",".join(token_ids_to_fetch)
        price_url = f"https://api.coingecko.com/api/v3/simple/price?ids={coingecko_ids_str}&vs_currencies=usd"
        
        prices = {}
        async with aiohttp.ClientSession() as session:
            async with session.get(price_url) as resp:
                resp.raise_for_status()
                price_data = await resp.json()
                for symbol, token_info in config.TOKENS.items():
                    if "coingeckoId" in token_info and token_info["coingeckoId"] in price_data:
                        prices[symbol] = price_data[token_info["coingeckoId"]]["usd"]
        
        print(f"[Analytics] Fetched prices (USD): {prices}")

        # 2. Query token total supplies
        erth_info = secret_client.wasm.contract_query(config.TOKENS['ERTH']['contract'], {"token_info": {}})
        erth_total_supply = int(erth_info["token_info"]["total_supply"]) / (10**config.TOKENS['ERTH']['decimals'])
        anml_info = secret_client.wasm.contract_query(config.TOKENS['ANML']['contract'], {"token_info": {}})
        anml_total_supply = int(anml_info["token_info"]["total_supply"]) / (10**config.TOKENS['ANML']['decimals'])

        # 3. Query the unified pool for reserves
        pool_addresses = [t["contract"] for k, t in config.TOKENS.items() if k != "ERTH"]
        unified_pool_res = secret_client.wasm.contract_query(config.UNIFIED_POOL_CONTRACT, {"query_pool_info": {"pools": pool_addresses}})

        # 4. First Pass: Calculate ERTH price based on pools with known USD value
        total_weighted_price = 0
        total_liquidity = 0 # This will accumulate TVL from all pools
        all_pool_data = []
        anml_data = None # Store ANML reserves here for the second pass

        for i, pool_state in enumerate(unified_pool_res):
            token_symbol = list(config.TOKENS.keys())[i + 1] # Skips ERTH
            token_meta = config.TOKENS[token_symbol]
            erth_reserve = int(pool_state["state"]["erth_reserve"]) / (10**config.TOKENS['ERTH']['decimals'])
            token_reserve = int(pool_state["state"]["token_b_reserve"]) / (10**token_meta['decimals'])

            if token_symbol == "ANML":
                anml_data = {"token_reserve": token_reserve, "erth_reserve": erth_reserve}
            else:
                # This block is for sSCRT and FINA
                pool_erth_price = (token_reserve / erth_reserve) * prices[token_symbol] if erth_reserve > 0 else 0
                pool_tvl = (token_reserve * prices[token_symbol]) + (erth_reserve * pool_erth_price)
                
                total_weighted_price += pool_erth_price * pool_tvl
                total_liquidity += pool_tvl
                
                all_pool_data.append({"token": token_symbol, "erthPrice": pool_erth_price, "tvl": pool_tvl})
        
        # 5. Calculate the global ERTH price
        global_erth_price = total_weighted_price / total_liquidity if total_liquidity > 0 else 0
        print(f"[Analytics] Global ERTH Price calculated: ${global_erth_price:.6f}")

        # 6. Second Pass: Now calculate ANML price and TVL using the global ERTH price
        anml_price_final = 0
        if anml_data:
            anml_price_final = (anml_data["erth_reserve"] / anml_data["token_reserve"]) * global_erth_price if anml_data["token_reserve"] > 0 else 0
            anml_tvl = (anml_data["token_reserve"] * anml_price_final) + (anml_data["erth_reserve"] * global_erth_price)
            
            total_liquidity += anml_tvl
            
            # The ERTH price in the ANML pool is the global ERTH price
            all_pool_data.append({"token": "ANML", "erthPrice": global_erth_price, "tvl": anml_tvl})
        
        print(f"[Analytics] Final ANML Price calculated: ${anml_price_final:.6f}")

        # 7. Assemble the final data point
        now_utc_day_start = int(time.time() // 86400 * 86400 * 1000)

        data_point = {
            "timestamp": now_utc_day_start,
            "erthPrice": global_erth_price,
            "erthTotalSupply": erth_total_supply,
            "erthMarketCap": global_erth_price * erth_total_supply,
            "tvl": total_liquidity, # Use the final accumulated TVL
            "pools": all_pool_data,
            "anmlPrice": anml_price_final,
            "anmlTotalSupply": anml_total_supply,
            "anmlMarketCap": anml_price_final * anml_total_supply,
        }

        if not any(p['timestamp'] == now_utc_day_start for p in analytics_history):
            analytics_history.append(data_point)
            save_analytics_data()
        else:
            print(f"[Analytics] Data for timestamp {now_utc_day_start} already exists. Skipping add.")
            
    except Exception as e:
        print(f"[Analytics] FATAL ERROR during analytics update: {e}")


# --- Initialization and API Endpoint (No Changes Below) ---

def init_analytics():
    print("[Analytics] Initializing...")
    load_analytics_data()
    is_stale = not analytics_history or (time.time() - analytics_history[-1]["timestamp"] / 1000) >= 86400
    if is_stale:
        print("[Analytics] Data is stale or missing. Running initial update now.")
        asyncio.run(update_analytics_job())
    else:
        print("[Analytics] Data is up-to-date. Next update will be scheduled.")

@router.get("/analytics", summary="Get ERTH Analytics Data")
async def get_analytics():
    return {
        "latest": analytics_history[-1] if analytics_history else None,
        "history": analytics_history
    }