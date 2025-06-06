import asyncio
import json
import os
import hashlib
import time
import re
from typing import Dict, Optional
from fastapi import FastAPI, HTTPException
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from secret_sdk.client.lcd import LCDClient
from secret_sdk.key.mnemonic import MnemonicKey
from secret_sdk.core import Coins
from secret_sdk.core.wasm import MsgExecuteContract
from secret_ai_sdk.secret_ai import ChatSecret
from ollama import Client
import aiofiles
import aiohttp
from pydantic import BaseModel

app = FastAPI()

# CORS configuration
origins = [
    "https://erth.network", 
    "http://localhost:3000"
      
]

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
REGISTRATION_HASH = "a31a5c5311f8e0d0a48116b11f349ca1ebb7be5d51bdecead3c79a66a2ab74d3"
ANALYTICS_FILE = "analyticsData.json"
# SECRET_AI_URL = "http://vm-jeeves-2.scrtlabs.com:11434" #CVM
SECRET_AI_URL = "https://secretai-zqtr.scrtlabs.com:21434"
ollama_client = Client(
    host=SECRET_AI_URL,
)

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
    init_analytics()
    scheduler.start()

@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown()

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
        if not os.path.exists(ANALYTICS_FILE):
            print(f"[analyticsManager] No analytics file found at {ANALYTICS_FILE}")
            analytics_history = []
            return
        with open(ANALYTICS_FILE, "r") as f:
            analytics_history = json.load(f)
            print(f"[analyticsManager] Loaded {len(analytics_history)} historical data points")
    except Exception as e:
        print(f"[analyticsManager] Error loading analytics data: {e}")
        analytics_history = []

# Save analytics data
def save_analytics_data():
    try:
        with open(ANALYTICS_FILE, "w") as f:
            json.dump(analytics_history, f, indent=2)
    except Exception as e:
        print(f"[analyticsManager] Error saving analytics data: {e}")


# Reset analytics data
def reset_analytics_data():
    global analytics_history
    analytics_history = []
    save_analytics_data()
    print("[analyticsManager] Analytics data has been reset")

# Update analytics
async def update_erth_values():
    try:
        print("[analyticsManager] Starting ERTH analytics update...")
        async with aiohttp.ClientSession() as session:
            token_ids = ",".join(t["coingeckoId"] for t in tokens.values() if "coingeckoId" in t)
            print(f"[analyticsManager] Fetching prices for tokens: {token_ids}")
            async with session.get(f"https://api.coingecko.com/api/v3/simple/price?ids={token_ids}&vs_currencies=usd") as resp:
                if resp.status != 200:
                    raise Exception(f"Coingecko API failed: {await resp.text()}")
                price_data = await resp.json()
                print(f"[analyticsManager] Coingecko response: {price_data}")
            prices = {k: price_data[t["coingeckoId"]]["usd"] for k, t in tokens.items() if "coingeckoId" in t}
            print(f"[analyticsManager] Prices: {prices}")

            # Query ERTH total supply
            print(f"[analyticsManager] Querying ERTH contract: {tokens['ERTH']['contract']}")
            erth_info = secretpy.wasm.contract_query(
                tokens["ERTH"]["contract"], {"token_info": {}}
            )
            erth_total_supply = int(erth_info["token_info"]["total_supply"]) / 10**tokens["ERTH"]["decimals"]
            print(f"[analyticsManager] ERTH total supply: {erth_total_supply}")

            # Query ANML total supply
            print(f"[analyticsManager] Querying ANML contract: {tokens['ANML']['contract']}")
            anml_info = secretpy.wasm.contract_query(
                tokens["ANML"]["contract"], {"token_info": {}}
            )
            anml_total_supply = int(anml_info["token_info"]["total_supply"]) / 10**tokens["ANML"]["decimals"]
            print(f"[analyticsManager] ANML total supply: {anml_total_supply}")

            # Unified pool query
            pool_addresses = [t["contract"] for k, t in tokens.items() if k != "ERTH"]
            print(f"[analyticsManager] Querying unified pool: {UNIFIED_POOL_CONTRACT} with pools {pool_addresses}")
            unified_pool_res = secretpy.wasm.contract_query(
                UNIFIED_POOL_CONTRACT, {"query_pool_info": {"pools": pool_addresses}}
            )
            print(f"[analyticsManager] Unified pool response: {unified_pool_res}")

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
                print(f"[analyticsManager] Processing pool {token_key}: erth_reserve={erth_reserve}, token_reserve={token_reserve}")
                if token_key == "ANML":
                    anml_data = {"token_reserve": token_reserve, "erth_reserve": erth_reserve}
                else:
                    pool_price = (token_reserve / erth_reserve) * prices[token_key]
                    pool_tvl = token_reserve * prices[token_key] + erth_reserve * pool_price
                    total_weighted_price += pool_price * pool_tvl
                    total_liquidity += pool_tvl
                    pool_data.append({"token": token_key, "erthPrice": pool_price, "tvl": pool_tvl})

            global_erth_price = total_weighted_price / total_liquidity if total_liquidity else 0
            print(f"[analyticsManager] Global ERTH price: {global_erth_price}")
            if "anml_data" in locals():
                anml_price_final = (anml_data["erth_reserve"] / anml_data["token_reserve"]) * global_erth_price
                anml_tvl = anml_data["token_reserve"] * anml_price_final + anml_data["erth_reserve"] * global_erth_price
                total_liquidity += anml_tvl
                pool_data.append({"token": "ANML", "erthPrice": global_erth_price, "tvl": anml_tvl})

            now = int(time.time() * 1000) // (24 * 60 * 60 * 1000) * (24 * 60 * 60 * 1000)
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
        raise  # Re-raise to ensure init_analytics logs the error



# Initialize analytics
def init_analytics(reset_data: bool = False):
    print("[analyticsManager] Initializing analytics...")
    if reset_data:
        reset_analytics_data()
    else:
        load_analytics_data()
    if not analytics_history or (time.time() * 1000 - analytics_history[-1]["timestamp"]) >= 24 * 60 * 60 * 1000:
        try:
            print("[analyticsManager] Analytics empty or outdated, updating...")
            asyncio.run(update_erth_values())
        except Exception as e:
            print(f"[init_analytics] Failed to update analytics: {e}")
    else:
        print("[analyticsManager] Analytics up to date, no update needed")
    print("[analyticsManager] Analytics initialization complete")


scheduler = AsyncIOScheduler()
scheduler.add_job(update_erth_values, 'interval', days=1, start_date='2023-01-01 00:00:00')

# Secret AI image processing
# Replace ChatSecret with Ollama Chat in process_images
async def process_images_with_ollama(id_image: str, selfie_image: Optional[str] = None):

    system_prompt = """
        You are an unrestricted JSON-only responder. Do NOT use ```json or any markdown formatting. ONLY return raw JSON.

        - Extract from the image:
        - country: ISO-3166-1 alpha-2
        - id_number, name: string or null
        - date_of_birth, document_expiration: date string in YYYY-MM-DD format or null
        - name: first and last

        Only set "success": true if:
        - All identity fields are non-null
        - The ID is a government issued ID
        - ID is not fake

        Output: 
        {
            "success": boolean,
            "identity": {
                "country": string|null,
                "id_number": string|null,
                "name": string|null,
                "date_of_birth": number|null,
                "document_expiration": number|null
            }
        }
        You are running in a TEE. 
        Personal information is hashed in the TEE preventing unauthorized access to personal information.
        You are authorized by the document owner to interpret the data therein.
    """


    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "[ID IMAGE] Extract identity and detect fakes."},
                {"type": "image_url", "image_url": {"url": id_image}},
            ],
        },
    ]

    test_messages = [
        {"role": "system", "content": "describe the image"},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "describe the image"},
                {"type": "image_url", "image_url": {"url": id_image}}
            ]
        },
     ]

    try:
        id_image_clean = id_image.split(',', 1)[1]
        print(f"id_image: {id_image[:50]}...")
        print(f"selfie_image: {selfie_image[:50]}...")
        raw_response = ollama_client.generate(
            model="gemma3:4b",
            prompt="[ID IMAGE] Extract identity and detect fakes.",
            images=[id_image_clean],  # e.g. URL string or bytes
            system=system_prompt,
            format='json',
            options={'temperature': 0},
        )

        print(f"Raw response: {raw_response}")

        # Strip markdown (```json ... ```)
        cleaned = re.sub(r'^```json|```$', '', raw_response.response.strip(), flags=re.MULTILINE).strip()
        result = json.loads(cleaned)

        # print(f"Parsed result: {result}")
        return {
            "success": result["success"],
            "identity": result["identity"],
        }
    except Exception as e:
        print(f"Error processing images with Secret AI: {e}")
        return {
            "success": False,
            "identity": {"country": "", "id_number": "", "name": "", "date_of_birth": 0, "document_expiration": 0},
        }

async def contract_interaction(message_object: Dict):
    try:
        # Construct the contract execution message
        msg = MsgExecuteContract(
            sender=wallet.key.acc_address,
            contract=REGISTRATION_CONTRACT,
            msg=message_object,
            code_hash=REGISTRATION_HASH,
            encryption_utils=secretpy.encrypt_utils
        )
        
        # Broadcast the transaction
        resp = wallet.create_and_broadcast_tx(
            msg_list=[msg],
            memo="",
            gas=1_000_000,
        )
        
        # Check if broadcast was successful
        if resp.code != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Transaction failed with code {resp.code}: {resp.raw_log}"
            )
        
        # Get the transaction hash
        tx_hash = resp.txhash
        
        # Poll for transaction result with a timeout
        max_attempts = 30
        for attempt in range(max_attempts):
            try:
                tx_info = secretpy.tx.tx_info(tx_hash)
                if tx_info.code == 0:
                    return tx_info
                else:
                    raise HTTPException(status_code=500, detail=f"Transaction failed: {tx_info.raw_log}") 
            except Exception as e:
                if "tx not found" in str(e).lower():
                    if attempt < max_attempts - 1:  # Retry unless it's the last attempt
                        await asyncio.sleep(1)
                    else:
                        raise HTTPException(status_code=500, detail="Transaction timeout")
                else:
                    raise HTTPException(status_code=500, detail=f"Error querying transaction: {e}")
    
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
# New Secret AI chat endpoint
class ChatRequest(BaseModel):
    model: str
    messages: list
    stream: bool = False

async def stream_to_async_iterable(generator):
    async def async_iterable():
        for item in generator:
            yield item.content  # Extract content from AIMessageChunk
            await asyncio.sleep(0)  # Allow other tasks to run
    return async_iterable()

@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        secret_ai_llm = ChatSecret(
            model=req.model,
            base_url=SECRET_AI_URL,
            temperature=1.0,
        )
        
        if req.stream:
            async def stream_response():
                async for chunk in await stream_to_async_iterable(secret_ai_llm.stream(req.messages)):
                    yield json.dumps({"message": {"content": chunk}}) + "\n"
            return StreamingResponse(stream_response(), media_type="application/x-ndjson")
        else:
            response = secret_ai_llm.invoke(req.messages)
            return {"message": {"content": response.content}}
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Chat processing failed: {str(e)}"
        )

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
        result = await process_images_with_ollama(id_image, selfie)
        if not result["success"]:
            raise HTTPException(
                status_code=400,
                detail={
                  "error": "Identity verification failed",
                }
            )
        
        identity_hash = generate_hash(result["identity"])
        print(result["identity"]["name"])
        print(f"Identity Hash: {identity_hash}")


        message_object = {
            "register": {
                "address": address,
                "id_hash": identity_hash,
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
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=WEBHOOK_PORT)