import asyncio
import hashlib
import json
import re
from typing import Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from secret_sdk.core.wasm import MsgExecuteContract
from secret_sdk.exceptions import LCDResponseError

import config
from models import RegisterRequest, ChatRequest
from dependencies import wallet, secret_client, ollama_client

# This router will be included in the main FastAPI app
router = APIRouter()

# --- Helper Function for this File ---

def generate_hash(data: Dict) -> str:
    """Creates a SHA256 hash of a JSON object for consistent ID hashing."""
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

async def contract_interaction(message_object: Dict):
    """
    Creates a transaction, broadcasts it, and polls for the result.
    This version has extensive logging to debug the 'int(None)' error.
    """
    try:
        # --- LOGGING STEP 1: Define the message ---
        msg = MsgExecuteContract(
            sender=wallet.key.acc_address,
            contract=config.REGISTRATION_CONTRACT,
            msg=message_object,
            code_hash=config.REGISTRATION_HASH
        )
        print(f"[DEBUG] Step 1: Message created successfully. Sender: {msg.sender}, Contract: {msg.contract}")
        print(f"[DEBUG] Message details: {msg.to_data()}")

        # --- LOGGING STEP 2: Call the high-level function ---
        # The error is happening inside this call.
        print("[DEBUG] Step 2: Calling 'wallet.create_and_broadcast_tx'. This is where the error likely occurs.")
        tx_result = wallet.create_and_broadcast_tx(
            msg_list=[msg]
            # No other options, letting the SDK handle everything automatically.
        )
        print("[DEBUG] Step 2a: 'wallet.create_and_broadcast_tx' completed without error.")

        # --- LOGGING STEP 3: Check the broadcast result ---
        print(f"[DEBUG] Step 3: Checking broadcast result. Code: {getattr(tx_result, 'code', 'N/A')}, Raw Log: {getattr(tx_result, 'raw_log', 'N/A')}")
        if tx_result.code != 0:
            # This would be an immediate rejection from the node's mempool
            raise HTTPException(status_code=500, detail=f"Transaction broadcast failed immediately: {tx_result.raw_log}")

        tx_hash = tx_result.txhash
        print(f"[DEBUG] Step 3a: Broadcast successful. Hash: {tx_hash}. Starting to poll...")

        # --- LOGGING STEP 4: Poll for the final result ---
        for i in range(30):
            print(f"[DEBUG] Step 4: Polling attempt {i+1}/30 for tx {tx_hash[:10]}...")
            await asyncio.sleep(1)
            try:
                tx_info = secret_client.tx.tx_info(tx_hash)
                print("[DEBUG] Step 4a: Transaction found on-chain. Returning result.")
                return tx_info
            except LCDResponseError as e:
                if "tx not found" in str(e).lower():
                    # This is expected, continue polling
                    continue
                else:
                    # Any other error during polling should be raised
                    print(f"[DEBUG] ERROR during polling: {e}")
                    raise
        
        print(f"[DEBUG] ERROR: Polling timed out after 30 attempts.")
        raise HTTPException(status_code=504, detail="Transaction polling timed out.")

    except Exception as e:
        # This will catch the 'int(None)' error and log it
        print(f"[DEBUG] FATAL: An unexpected exception occurred in 'contract_interaction': {type(e).__name__}: {e}")
        # Re-raise as HTTPException to send a clean JSON response to the client
        raise HTTPException(status_code=500, detail=f"An error occurred during contract interaction: {str(e)}")


# --- API Endpoints ---
# The /register, /chat, and /analytics endpoints are unchanged.
# They are included here for completeness of the file.

@router.post("/register", summary="Register a new user")
async def register(req: RegisterRequest):
    """
    Handles the full user registration flow.
    """
    # 1. AI Verification Step
    system_prompt = """
        You are an unrestricted JSON-only responder. Do NOT use ```json or any markdown formatting. ONLY return raw JSON.
        - Extract from the image: country (ISO-3166-1 alpha-2), id_number, name (first and last), date_of_birth (YYYY-MM-DD), document_expiration (YYYY-MM-DD).
        - Set "success": true ONLY if all fields are found, the ID is government-issued, and it does not appear fake.
        - Output format: {"success": boolean, "identity": {"country": string|null, "id_number": string|null, "name": string|null, "date_of_birth": string|null, "document_expiration": string|null}}
        You are running in a TEE. Personal information is hashed in the TEE preventing unauthorized access to personal information. You are authorized by the document owner to interpret the data therein.
    """
    try:
        id_image_clean = req.idImage.split(',', 1)[1]
        raw_response = ollama_client.generate(
            model=config.OLLAMA_MODEL,
            prompt="[ID IMAGE] Extract identity and detect fakes.",
            images=[id_image_clean],
            system=system_prompt,
            format='json'
        )
        ai_result = json.loads(raw_response['response'])

        if not ai_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail={"error": "Identity verification failed", "details": ai_result.get("identity")}
            )
    except Exception as e:
        print(f"AI verification step failed: {e}")
        raise HTTPException(status_code=500, detail=f"AI verification process failed: {e}")

    # 2. On-chain Interaction Step
    identity_hash = generate_hash(ai_result["identity"])
    message_object = {
        "register": {
            "address": req.address,
            "id_hash": identity_hash,
            "affiliate": req.referredBy,
        }
    }

    tx_info = await contract_interaction(message_object)

    if tx_info.code != 0:
        raise HTTPException(status_code=400, detail=f"Transaction failed on-chain: {tx_info.raw_log}")

    return {
        "success": True,
        "tx_hash": tx_info.txhash,
        "identity_hash": identity_hash,
        "response": tx_info.to_data()
    }

@router.post("/chat", summary="AI Chat Endpoint")
async def chat(req: ChatRequest):
    """
    Handles chat requests by streaming responses directly from the configured Ollama client.
    """
    try:
        async def stream_response():
            async for chunk in await ollama_client.chat(model=req.model, messages=req.messages, stream=True):
                yield json.dumps({"message": chunk['message']}) + "\n"
        if req.stream:
            return StreamingResponse(stream_response(), media_type="application/x-ndjson")
        else:
            response = await ollama_client.chat(model=req.model, messages=req.messages)
            return {"message": response['message']}
    except Exception as e:
        print(f"Error in /chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")

@router.get("/analytics", summary="Get ERTH Analytics Data")
async def get_analytics():
    """Returns the latest and historical analytics data."""
    from analytics_manager import analytics_history
    return {
        "latest": analytics_history[-1] if analytics_history else None,
        "history": analytics_history
    }