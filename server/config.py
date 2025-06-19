# /config.py
import os

# --- Environment & Ports ---
WEBHOOK_PORT = 5000
ALLOWED_ORIGINS = [
    "https://erth.network",
    # "http://localhost:3000"
]

# --- File Paths ---
ANALYTICS_FILE = "analyticsData.json"
WALLET_KEY_FILE = "WALLET_KEY.txt"

# --- Secret Network ---
SECRET_LCD_URL = "https://lcd.erth.network"
SECRET_CHAIN_ID = "secret-4"
REGISTRATION_CONTRACT = "secret12q72eas34u8fyg68k6wnerk2nd6l5gaqppld6p"
REGISTRATION_HASH = "a31a5c5311f8e0d0a48116b11f349ca1ebb7be5d51bdecead3c79a66a2ab74d3"

# --- Secret AI / Ollama ---
SECRET_AI_URL = "https://secretai-rytn.scrtlabs.com:21434"
SECRET_AI_API_KEY = "sk-MiojMS-qLCH3sT597TIRWS1q1atz_V_oo3GSoKJphHL_852IKGbmvbLuh43aAXSy-B-0--1y"
OLLAMA_MODEL = "gemma3:4b"

# --- Wallet Key Loading ---
def get_wallet_key() -> str:
    try:
        with open(WALLET_KEY_FILE, "r") as f:
            key = f.read().strip()
            if not key:
                raise ValueError("Wallet key file is empty.")
            return key
    except FileNotFoundError:
        print(f"FATAL: Wallet key file not found at '{WALLET_KEY_FILE}'")
        raise
    except Exception as e:
        print(f"FATAL: Error reading wallet key: {e}")
        raise

WALLET_KEY = get_wallet_key()