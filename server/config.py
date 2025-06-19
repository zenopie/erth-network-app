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
    """
    Loads the wallet mnemonic from the 'WALLET_KEY' environment variable.
    """
    key = os.getenv("WALLET_KEY")
    if not key:
        # This error will be raised if the environment variable is not set or is empty.
        # It will cause the app to fail on startup, which is good practice for missing critical config.
        raise ValueError("FATAL: WALLET_KEY environment variable not set or is empty.")
    return key

# This line now calls the new function.
WALLET_KEY = get_wallet_key()
print("Wallet key loaded from environment variable.")