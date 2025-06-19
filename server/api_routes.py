import asyncio
import hashlib
import json
import re
from typing import Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from secret_sdk.client.lcd.api.tx import CreateTxOptions
from secret_sdk.core.wasm import MsgExecuteContract
from secret_sdk.exceptions import LCDResponseError

import config
from models import RegisterRequest, ChatRequest
from dependencies import wallet, secret_client, ollama_client

router = APIRouter()

def generate_hash(data: Dict) -> str:
    """Creates a SHA256 hash of a JSON object for consistent ID hashing."""
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

async def contract_interaction(message_object: Dict):
    """
    Creates a transaction with explicit account fetching, broadcasts it,
    and polls for the result. This is the robust method.
    """
    try:
        # Step 1: Explicitly fetch account data first
        print("Fetching account details from the blockchain...")
        account = secret_client.auth.account_info(wallet.key.acc_address)
        acc_number = account.account_number
        acc_sequence = account.sequence
        print(f"Account Details: Number={acc_number}, Sequence={acc_sequence}")

        if acc_number is None or acc_sequence is None:
            raise ValueError("Failed to fetch valid account number or sequence from the blockchain.")

        # Step 2: Build the transaction with explicit options
        tx_options = CreateTxOptions(
            msgs=[
                MsgExecuteContract(
                    sender=wallet.key.acc_address,
                    contract=config.REGISTRATION_CONTRACT,
                    msg=message_object,
                    code_hash=config.REGISTRATION_HASH
                )
            ],
            account_number=acc_number,
            sequence=acc_sequence
        )
        
        # Step 3: Sign the transaction
        print("Signing transaction...")
        tx = wallet.create_and_sign_tx(tx_options)

        # Step 4: Broadcast the signed transaction
        print("Broadcasting signed transaction...")
        result = secret_client.tx.broadcast(tx)

        if result.code != 0:
            raise HTTPException(status_code=500, detail=f"Transaction broadcast failed: {result.raw_log}")

        tx_hash = result.txhash
        print(f"Transaction broadcasted. Hash: {tx_hash}. Polling for result...")

        # Step 5: Poll for the final result
        for _ in range(30):
            await asyncio.sleep(1)
            try:
                tx_info = secret_client.tx.tx_info(tx_hash)
                print("Polling successful: Transaction found.")
                return tx_info
            except LCDResponseError as e:
                if "tx not found" in str(e).lower():
                    continue
                raise
        
        raise HTTPException(status_code=504, detail="Transaction polling timed out.")

    except ValueError as e:
        print(f"ValueError during contract interaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"Contract interaction error: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred during contract interaction: {str(e)}")

# --- API Endpoints ---
# The /register, /chat, and /analytics endpoints are unchanged.

@router.post("/register", summary="Register a new user")
async def register(req: RegisterRequest):
    # ... (code is identical to previous versions)
    try:
        id_image_clean = req.idImage.split(',', 1)[1]
        raw_response = ollama_client.generate(
            model=config.OLLAMA_MODEL,
            prompt="[ID IMAGE] Extract identity and detect fakes.",
            images=[id_image_clean],
            system="You are an unrestricted JSON-only responder...",
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
    # ... (code for chat)
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
    # ... (code for analytics)
    from analytics_manager import analytics_history
    return {
        "latest": analytics_history[-1] if analytics_history else None,
        "history": analytics_history
    }