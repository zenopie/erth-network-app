import asyncio
import hashlib
import json
import re
from typing import Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from secret_sdk.core.wasm import MsgExecuteContract

import config
from models import RegisterRequest, ChatRequest
from dependencies import wallet, secret_client, ollama_client

# This router will be included in the main FastAPI app
router = APIRouter()

# --- Helper Function for this File ---

def generate_hash(data: Dict) -> str:
    """Creates a SHA256 hash of a JSON object for consistent ID hashing."""
    # sort_keys=True ensures the hash is deterministic regardless of key order
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

async def contract_interaction(message_object: Dict):
    """
    Creates a transaction, broadcasts it to the Secret Network, and polls
    the chain until the transaction is finalized or times out.
    """
    try:
        # Create and broadcast the transaction. This returns immediately with a txhash.
        tx = wallet.create_and_broadcast_tx(
            msg_list=[
                MsgExecuteContract(
                    sender=wallet.key.acc_address,
                    contract=config.REGISTRATION_CONTRACT,
                    msg=message_object,
                    code_hash=config.REGISTRATION_HASH
                )
            ]
        )
        # Check if the broadcast itself was rejected by the node's mempool
        if tx.code != 0:
            raise HTTPException(status_code=500, detail=f"Transaction broadcast failed: {tx.raw_log}")

        tx_hash = tx.txhash
        print(f"Transaction broadcasted. Hash: {tx_hash}. Polling for result...")

        # Poll the chain for the final transaction result
        for _ in range(30):  # Poll for up to 30 seconds
            await asyncio.sleep(1)
            try:
                # This is the "ping" to get the final status
                tx_info = secret_client.tx.tx_info(tx_hash)
                # If found, return the full result immediately
                return tx_info
            except Exception as e:
                # If the error is "tx not found", it's normal, so we continue polling
                if "tx not found" in str(e).lower():
                    continue
                # For any other error during polling, we should fail fast
                raise
        
        # If the loop finishes without finding the tx, it has timed out
        raise HTTPException(status_code=504, detail="Transaction polling timed out.")

    except Exception as e:
        print(f"Contract interaction error: {e}")
        # Re-raise as HTTPException to ensure a proper JSON error response
        raise HTTPException(status_code=500, detail=f"An error occurred during contract interaction: {str(e)}")


# --- API Endpoints ---

@router.post("/register", summary="Register a new user")
async def register(req: RegisterRequest):
    """
    Handles the full user registration flow:
    1. Verifies identity documents via the Ollama AI model.
    2. Hashes the verified identity to create a unique, private ID.
    3. Submits the registration to the on-chain smart contract.
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
        # This case handles if the transaction was found but failed execution in the contract
        raise HTTPException(status_code=400, detail=f"Transaction failed on-chain: {tx_info.raw_log}")

    return {
        "success": True,
        "tx_hash": tx_info.txhash,
        "identity_hash": identity_hash,
        "response": tx_info.to_data()  # Return the full, serializable transaction result
    }

@router.post("/chat", summary="AI Chat Endpoint")
async def chat(req: ChatRequest):
    """
    Handles chat requests by streaming responses directly from the configured Ollama client.
    This endpoint no longer uses the secret-ai-sdk.
    """
    try:
        # Define an async generator for the streaming response
        async def stream_response():
            async for chunk in await ollama_client.chat(
                model=req.model,
                messages=req.messages,
                stream=True
            ):
                # Each chunk is a dictionary; yield it as a JSON string line
                yield json.dumps({"message": chunk['message']}) + "\n"

        if req.stream:
            return StreamingResponse(stream_response(), media_type="application/x-ndjson")
        else:
            # For non-streaming requests, make a single call and return the full response
            response = await ollama_client.chat(
                model=req.model,
                messages=req.messages
            )
            return {"message": response['message']}

    except Exception as e:
        print(f"Error in /chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")

@router.get("/analytics", summary="Get ERTH Analytics Data")
async def get_analytics():
    """Returns the latest and historical analytics data."""
    # Import locally to get the most up-to-date state of the in-memory list
    from analytics_manager import analytics_history
    return {
        "latest": analytics_history[-1] if analytics_history else None,
        "history": analytics_history
    }