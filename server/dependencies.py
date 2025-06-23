# /dependencies.py
from secret_sdk.client.lcd import LCDClient
from secret_sdk.key.mnemonic import MnemonicKey
from ollama import Client, AsyncClient
import config

# --- Secret Network Client ---
# This client is synchronous, which is fine for its usage pattern here.
secret_client = LCDClient(url=config.SECRET_LCD_URL, chain_id=config.SECRET_CHAIN_ID)
wallet = secret_client.wallet(MnemonicKey(mnemonic=config.WALLET_KEY))
print(f"Secret Wallet Initialized. Address: {wallet.key.acc_address}")

# --- Ollama Client ---
ollama_client = Client(
    host=config.SECRET_AI_URL,
    headers={"Authorization": f"Bearer {config.SECRET_AI_API_KEY}"}
)

ollama_async_client = AsyncClient(
    host=config.SECRET_AI_URL,
    headers={"Authorization": f"Bearer {config.SECRET_AI_API_KEY}"}
)

print("Ollama Client Initialized.")