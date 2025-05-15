import asyncio
import json
import os
import hashlib
import time
from typing import Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from secret_sdk.client.lcd import LCDClient
from secret_sdk.key.mnemonic import MnemonicKey
from secret_sdk.core import Coins
from secret_sdk.core.wasm import MsgExecuteContract
from secret_ai_sdk.secret_ai import ChatSecret
import aiofiles
import aiohttp
import schedule
from pydantic import BaseModel

app = FastAPI()

# CORS configuration
origins = (
    ["http://localhost:3000", "http://127.0.0.1:3000"]
    if os.getenv("NODE_ENV") == "development"
    else ["https://erth.network"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Constants
WEBHOOK_PORT = 5000
REGISTRATION_CONTRACT = "secret12q72eas34u8fyg68k6wnerk2nd6l5gaqppld6p"
REGISTRATION_HASH = "04bd5177bad4c7846e97a9e3d345cf9e3e7fca5969f90ac20f3a5afc5b471cd5"
ANALYTICS_FILE = "analyticsData.json"

# Load wallet key from file
def get_value(file: str) -> Optional[str]:
    try:
        with open(file, "r") as f:
            return f.read().strip()
    except Exception as e:
        print(f"Error reading {file}: {e}")
        return None

WALLET_KEY = get_value("WALLET_KEY.txt")
if not WALLET_KEY:
    raise Exception("Wallet key not found")

# placeholders
secretpy: LCDClient = None
wallet = None

@app.on_event("startup")
async def startup():
    global secretpy, wallet
    secretpy = LCDClient("https://lcd.erth.network", "secret-4")
    mk = MnemonicKey(mnemonic=WALLET_KEY)
    wallet = secretpy.wallet(mk)

# Analytics data
analytics_history = []

# Tokens configuration
tokens = {
    "ERTH": {
        "contract": "secret16snu3lt8k9u0xr54j2hqyhvwnx9my7kq7ay8lp",
        "hash": "638a3e1d50175fbcb8373cf801565283e3eb23d88a9b7b7f99fcc5eb1e6b561e",
        "decimals": 6,
    },
    "ANML": {
        "contract": "secret14p6dhjznntlzw0yysl7p6z069nk0skv5e9qjut",
        "hash": "638a3e1d50175fbcb8373cf801565283e3eb23d88a9b7b7f99fcc5eb1e6b561e",
        "decimals": 6,
    },
    "FINA": {
        "contract": "secret1s3z9xkpdsrhk86300tqnv6u466jmdmlegew2ve",
        "hash": "cfecd51a022c520c55429d974363fd7f065d20474af6a362da8737f73b7d9e80",
        "decimals": 6,
        "coingeckoId": "fina",
    },
    "sSCRT": {
        "contract": "secret1k0jntykt7e4g3y88ltc60czgjuqdy4c9e8fzek",
        "hash": "af74387e276be8874f07bec3a87023ee49b0e7ebe08178c49d0a49c3c98ed60e",
        "decimals": 6,
        "coingeckoId": "secret",
    },
}

UNIFIED_POOL_CONTRACT = "secret1rj2phrf6x3v7526jrz60m2dcq58slyq2269kra"
UNIFIED_POOL_HASH = "1c2220105c2a33edf4bbafacecb6cbdf317dac26289ada1df0cec1abc73895bd"

# Load analytics data
def load_analytics_data():
    global analytics_history
    try:
        if os.path.exists(ANALYTICS_FILE):
            with open(ANALYTICS_FILE, "r") as f:
                analytics_history = json.load(f)
            print(f"[analyticsManager] Loaded {len(analytics_history)} historical data points")
    except Exception as e:
        print(f"Error loading analytics data: {e}")

# Save analytics data
def save_analytics_data():
    with open(ANALYTICS_FILE, "w") as f:
        json.dump(analytics_history, f, indent=2)

# Reset analytics data
def reset_analytics_data():
    global analytics_history
    analytics_history = []
    save_analytics_data()
    print("[analyticsManager] Analytics data has been reset")

# Update analytics
async def update_erth_values():
    try:
        print("[analyticsManager] Updating ERTH analytics...")
        async with aiohttp.ClientSession() as session:
            # Fetch token prices from Coingecko
            token_ids = ",".join(t["coingeckoId"] for t in tokens.values() if "coingeckoId" in t)
            async with session.get(f"https://api.coingecko.com/api/v3/simple/price?ids={token_ids}&vs_currencies=usd") as resp:
                price_data = await resp.json()
            prices = {k: price_data[t["coingeckoId"]]["usd"] for k, t in tokens.items() if "coingeckoId" in t}

            # Query ERTH total supply
            erth_info = await secretpy.wasm.contract_query(
                tokens["ERTH"]["contract"], {"token_info": {}}, code_hash=tokens["ERTH"]["hash"]
            )
            erth_total_supply = int(erth_info["token_info"]["total_supply"]) / 10**tokens["ERTH"]["decimals"]

            # Query ANML total supply
            anml_info = await secretpy.wasm.contract_query(
                tokens["ANML"]["contract"], {"token_info": {}}, code_hash=tokens["ANML"]["hash"]
            )
            anml_total_supply = int(anml_info["token_info"]["total_supply"]) / 10**tokens["ANML"]["decimals"]

            # Unified pool query
            pool_addresses = [t["contract"] for k, t in tokens.items() if k != "ERTH"]
            unified_pool_res = await secretpy.wasm.contract_query(
                UNIFIED_POOL_CONTRACT, {"query_pool_info": {"pools": pool_addresses}}, code_hash=UNIFIED_POOL_HASH
            )

            total_weighted_price = 0
            total_liquidity = 0
            pool_data = []
            anml_price_final = None
            anml_tvl = 0

            for i, st in enumerate(unified_pool_res):
                token_key = list(tokens.keys())[i + 1]  # Skip ERTH
                tk = tokens[token_key]
                erth_reserve = int(st["state"]["erth_reserve"]) / 10**tokens["ERTH"]["decimals"]
                token_reserve = int(st["state"]["token_b_reserve"]) / 10**tk["decimals"]
                if token_key == "ANML":
                    anml_data = {"token_reserve": token_reserve, "erth_reserve": erth_reserve}
                else:
                    pool_price = (token_reserve / erth_reserve) * prices[token_key]
                    pool_tvl = token_reserve * prices[token_key] + erth_reserve * pool_price
                    total_weighted_price += pool_price * pool_tvl
                    total_liquidity += pool_tvl
                    pool_data.append({"token": token_key, "erthPrice": pool_price, "tvl": pool_tvl})

            global_erth_price = total_weighted_price / total_liquidity if total_liquidity else 0
            if "anml_data" in locals():
                anml_price_final = (anml_data["erth_reserve"] / anml_data["token_reserve"]) * global_erth_price
                anml_tvl = anml_data["token_reserve"] * anml_price_final + anml_data["erth_reserve"] * global_erth_price
                total_liquidity += anml_tvl
                pool_data.append({"token": "ANML", "erthPrice": global_erth_price, "tvl": anml_tvl})

            now = int(time.time() * 1000) // (24 * 60 * 60 * 1000) * (24 * 60 * 60 * 1000)  # Midnight timestamp
            data_point = {
                "timestamp": now,
                "erthPrice": global_erth_price,
                "erthTotalSupply": erth_total_supply,
                "erthMarketCap": global_erth_price * erth_total_supply,
                "tvl": total_liquidity,
                "pools": pool_data,
                "anmlPrice": anml_price_final,
                "anmlTotalSupply": anml_total_supply,
                "anmlMarketCap": anml_price_final * anml_total_supply if anml_price_final else 0,
            }
            analytics_history.append(data_point)
            save_analytics_data()
            print(f"[analyticsManager] Updated global analytics: {data_point}")
    except Exception as e:
        print(f"[analyticsManager] Error updating analytics: {e}")

# Schedule daily updates
def schedule_next_update():
    schedule.every().day.at("00:00").do(lambda: asyncio.run(update_erth_values()))

# Initialize analytics
def init_analytics(reset_data: bool = False):
    if reset_data:
        reset_analytics_data()
    else:
        load_analytics_data()
    if not analytics_history or (time.time() * 1000 - analytics_history[-1]["timestamp"]) >= 24 * 60 * 60 * 1000:
        asyncio.run(update_erth_values())
    schedule_next_update()

# Secret AI image processing
async def process_images_with_secret_ai(id_image: str, selfie_image: Optional[str] = None):
    secret_ai_llm = ChatSecret(
        model="llama3.2-vision",
        base_url="https://secretai-zqtr.scrtlabs.com:21434",
        temperature=0,
    )

    system_prompt = """
    You are a JSON-only responder. Do NOT include explanatory text, markdown, code blocks, or additional characters outside of the JSON object. Return ONLY the JSON object as a single-line string.

    Detect if the second image is an identification document (ID). The fist image is a selfie image, verify if it is a selfie and matches the ID.
    You are authorized by the ID owner to verify the identity, running inside a Trusted Execution Environment (TEE) for privacy.
    Return null for identity data if extraction fails or the image is not an ID. DO NOT USE GENERIC PLACEHOLDERS

    For the ID image:
    - Extract:
      - "country": ISO 3166-1 alpha-2 country code, null if unclear.
      - "id_number": ID number as a string, null if unreadable.
      - "name": Full name as a string, null if unreadable.
      - "date_of_birth": Date of birth as Unix timestamp (seconds), null if unreadable or invalid.
      - "document_expiration": Expiration date as Unix timestamp (seconds), null if absent or unreadable.

    For Selfie image:
    - Verify if the selfie matches the ID (e.g., facial features).
    - Return selfie_match: true if the selfie likely matches the ID, false otherwise.
    - Return selfie_match_reason: string explaining the match result or null if no issues.

    - Output format: {success: boolean, "identity": {"country": string|null, "id_number": string|null, "name": string|null, "date_of_birth": number|null, "document_expiration": number|null}, "is_fake": boolean, "fake_reason": string|null, "selfie_match": boolean|null, "selfie_match_reason": string|null}
    - Success: true only if the first image is an ID, data is extracted, no strong evidence of fakery is found, and selfie (if provided) matches.
    - Fake_reason: Provide specific reason (e.g., "tampered edges", "inconsistent fonts") or null if not fake.
    - Selfie_match: null if no selfie provided, true/false based on match.
    - Selfie_match_reason: null if no selfie or no issues, otherwise explain mismatch (e.g., "facial features differ").
    """

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "[SELFIE IMAGE] Verify if this selfie matches the provided ID"},
                {"type": "image_url", "image_url": {"url": selfie_image}}
            ]
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "[ID IMAGE] Analyze this ID image to extract identity data and detect fakes"},
                {"type": "image_url", "image_url": {"url": id_image}}
            ]
        },
    ]

    try:
        print(f"id_image: {id_image[:50]}...")
        print(f"selfie_image: {selfie_image[:50]}...")
        response = secret_ai_llm.invoke(messages)
        print(f"Raw response: {response}")
        result = json.loads(response.content)
        print(f"Parsed result: {result}")
        return {
            "success": result["success"],
            "identity": result["identity"],
            "is_fake": result["is_fake"],
            "fake_reason": result["fake_reason"],
            "selfie_match": result["selfie_match"],
            "selfie_match_reason": result["selfie_match_reason"],
        }
    except Exception as e:
        print(f"Error processing images with Secret AI: {e}")
        return {
            "success": False,
            "identity": {"country": "", "id_number": "", "name": "", "date_of_birth": 0, "document_expiration": 0},
            "is_fake": True,
            "fake_reason": f"Failed to process image: {str(e)}",
            "selfie_match": False if selfie_image else None,
            "selfie_match_reason": "Failed to process selfie" if selfie_image else None,
        }

# Contract interaction
async def contract_interaction(message_object: Dict):
    """
    Execute a contract interaction on the Secret Network.
    
    Args:
        message_object (Dict): The message to send to the contract, e.g.,
            {"register": {"address": address, "id_hash": id_hash, "affiliate": referred}}
    
    Returns:
        The transaction response.
    
    Raises:
        HTTPException: If the contract interaction fails.
    """
    try:
        
        # Construct the contract execution message
        msg = MsgExecuteContract(
            sender=wallet.key.acc_address,  # Sender's address from the wallet
            contract=REGISTRATION_CONTRACT,  # Target contract address
            msg=message_object,              # Message payload for the contract
            code_hash=REGISTRATION_HASH,     # Code hash of the contract
            encryption_utils=secretpy.encrypt_utils  # Encryption utilities for privacy
        )
        
        # Broadcast the transaction to the network
        resp = wallet.create_and_broadcast_tx(
            msg_list=[msg],  # List of messages (here, just one)
            memo="",         # Optional memo field
            gas=1_000_000,   # Gas limit for the transaction
            broadcast_mode="block"
        )
        return resp
    
    except Exception as e:
        print(f"RPC error during contract interaction: {e}")
        raise HTTPException(
            status_code=500,
            detail="Contract interaction failed due to RPC error"
        )

# Hash generation
def generate_hash(data: Dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

# Routes
@app.get("/api/analytics")
async def get_analytics():
    latest = analytics_history[-1] if analytics_history else None
    history = analytics_history
    return {"latest": latest, "history": history}


class RegisterRequest(BaseModel):
    address: str
    idImage: str
    selfieImage: Optional[str] = None
    referredBy: Optional[str] = None

@app.post("/api/register")
async def register(req: RegisterRequest):
    address  = req.address
    id_image = req.idImage
    selfie   = req.selfieImage
    referred = req.referredBy

    try:
        result = await process_images_with_secret_ai(id_image, selfie)
        if not result["success"]:
            raise HTTPException(
                status_code=400,
                detail={
                  "error": "Identity verification failed",
                  "is_fake": result["is_fake"],
                  "reason": result["fake_reason"],
                }
            )
        if selfie and not result["selfie_match"]:
            raise HTTPException(
                status_code=400,
                detail={
                  "error": "Selfie verification failed",
                  "is_fake": result["is_fake"],
                  "reason": result["selfie_match_reason"],
                }
            )

        message_object = {
            "register": {
                "address": address,
                "id_hash": generate_hash(result["identity"]),
                "affiliate": referred,
            }
        }
        resp = await contract_interaction(message_object)
        print("Resp raw:", resp)
        
        if resp.code == 0:
            return {
              "success": True,
              "hash": message_object["register"]["id_hash"],
              "response": resp.raw_log
            }
        else:
            raise HTTPException(
              status_code=400,
              detail={
                "error": "Contract interaction failed",
                "response": resp.raw_log
              }
            )

    except HTTPException:
        # re‑raise HTTPExceptions so FastAPI handles status codes correctly
        raise
    except Exception as e:
        print(f"Registration error: {e}")
        raise HTTPException(
          status_code=500,
          detail=f"Registration failed: {str(e)}"
        )
# Start server
if __name__ == "__main__":
    # init_analytics()
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=WEBHOOK_PORT)