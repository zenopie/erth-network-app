# /analytics_manager.py
import os
import json
import time
import asyncio
import aiohttp
from typing import List, Dict

# This file would contain the full logic from your original `update_erth_values`
# and its helper functions (load, save, reset). For brevity, I'll skeleton it.
# You would copy your original analytics code here.

analytics_history: List[Dict] = []

def load_analytics_data():
    """Loads analytics data from the JSON file."""
    global analytics_history
    # ... your original load logic ...
    print("[Analytics] Data loaded.")

def save_analytics_data():
    """Saves the current analytics data to a file."""
    # ... your original save logic ...
    print("[Analytics] Data saved.")

async def update_analytics_job():
    """The main job to be run by the scheduler."""
    print("[Analytics] Starting scheduled update...")
    try:
        # Your full update_erth_values logic would go here.
        # This is a placeholder for that complex logic.
        await asyncio.sleep(5) # Simulating network requests
        new_data_point = {
            "timestamp": int(time.time() * 1000),
            "erthPrice": 1.23,
            # ... other fields
        }
        analytics_history.append(new_data_point)
        save_analytics_data()
        print("[Analytics] Update successful.")
    except Exception as e:
        print(f"[Analytics] ERROR: Update failed: {e}")

def init_analytics():
    """Initializes analytics, loading data and running an immediate update if needed."""
    print("[Analytics] Initializing...")
    load_analytics_data()
    # Logic to check if an immediate update is needed
    if not analytics_history or (time.time() - analytics_history[-1]["timestamp"] / 1000) > 86400:
        print("[Analytics] Data is stale or missing. Running initial update.")
        asyncio.run(update_analytics_job())
    else:
        print("[Analytics] Data is up-to-date.")