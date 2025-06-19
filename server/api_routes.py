import asyncio
import hashlib
import json
import logging
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from secret_sdk.core.wasm import MsgExecuteContract
from secret_sdk.core.coins import Coins

import config
from models import RegisterRequest, ChatRequest
from dependencies import wallet, secret_client, ollama_client
from prompts import ID_VERIFICATION_SYSTEM_PROMPT

# Configure logging
logging.basicConfig(level=logging.DEBUG, force=True)
logger = logging.getLogger(__name__)

router = APIRouter()

# Log initial client state
logger.debug(f"Secret client URL: {config.SECRET_LCD_URL}, Chain ID: {config.SECRET_CHAIN_ID}")
logger.debug(f"Wallet address: {wallet.key.acc_address}")

# --- Helper functions ---
def generate_hash(data: Dict) -> str:
    """Creates a SHA256 hash of a JSON object for consistent ID hashing."""
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

async def contract_interaction(message_object: Dict):
    """Creates a transaction, broadcasts it, and polls for the result."""
    try:
        logger.debug(f"Message object: {message_object}")
        # Verify wallet and client state
        if not wallet or not wallet.key or not wallet.key.acc_address:
            logger.error("Wallet is not properly initialized")
            raise HTTPException(status_code=500, detail="Wallet is not properly initialized")
        if not secret_client:
            logger.error("Secret client is not initialized")
            raise HTTPException(status_code=500, detail="Secret client is not initialized")

        # Check wallet balance
        balance = secret_client.bank.balance(wallet.key.acc_address)
        logger.debug(f"Wallet balance: {balance}")
        coins = balance[0] if balance else Coins()  # Extract Coins object from tuple
        uscrt_amount = int(coins.get("uscrt", "0uscrt").amount)  # Get uscrt amount
        if uscrt_amount < 1000000:  # Ensure enough SCRT for gas # Ensure enough SCRT for gas
            logger.error("Insufficient wallet balance")
            raise HTTPException(status_code=400, detail="Insufficient wallet balance for transaction")

        # Explicit gas settings
        gas_limit = 1000000  # Match main.py
        logger.debug(f"Using gas_limit: {gas_limit}")

        # Construct the contract execution message
        msg = MsgExecuteContract(
            sender=wallet.key.acc_address,
            contract=config.REGISTRATION_CONTRACT,
            msg=message_object,
            code_hash=config.REGISTRATION_HASH,
            encryption_utils=secret_client.encrypt_utils
        )

        tx = wallet.create_and_broadcast_tx(
            msg_list=[msg],
            gas=gas_limit,
            memo=""
        )
        logger.debug(f"Transaction response: {tx.__dict__}")
        if not hasattr(tx, 'code') or tx.code is None:
            logger.error(f"Transaction code is missing or None: {tx.rawlog}")
            raise HTTPException(status_code=500, detail=f"Transaction code is missing or None: {tx.rawlog}")
        if tx.code != 0:
            logger.error(f"Transaction broadcast failed: {tx.rawlog}")
            raise HTTPException(status_code=500, detail=f"Transaction broadcast failed: {tx.rawlog}")
        tx_hash = tx.txhash
        if not tx_hash:
            logger.error("Transaction hash is missing")
            raise HTTPException(status_code=500, detail="Transaction hash is missing")
        for _ in range(30):
            await asyncio.sleep(1)
            try:
                tx_info = secret_client.tx.tx_info(tx_hash)
                logger.debug(f"Transaction info: {tx_info.__dict__}")
                if not hasattr(tx_info, 'code') or tx_info.code is None:
                    logger.error(f"Transaction info code is missing or None: {tx_info.rawlog}")
                    raise HTTPException(status_code=500, detail=f"Transaction info code is missing or None: {tx_info.rawlog}")
                if tx_info.code != 0:
                    logger.error(f"Transaction failed on-chain: {tx_info.rawlog}")
                    raise HTTPException(status_code=400, detail=f"Transaction failed on-chain: {tx_info.rawlog}")
                return tx_info
            except Exception as e:
                if "tx not found" in str(e).lower():
                    continue
                logger.error(f"Transaction polling error: {e}")
                raise
        raise HTTPException(status_code=504, detail="Transaction polling timed out.")
    except Exception as e:
        logger.error(f"Contract interaction error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An error occurred during contract interaction: {str(e)}")

# --- API Endpoints ---

@router.post("/register", summary="Register a new user")
async def register(req: RegisterRequest):
    """
    Handles the user registration flow with improved error handling and validation.
    """
    try:
        logger.debug(f"Register request: address={req.address}, referredBy={req.referredBy}")
        id_image_clean = req.idImage.split(',', 1)[1]
        raw_response = ollama_client.generate(
            model=config.OLLAMA_MODEL,
            prompt="[ID IMAGE] Extract identity and detect fakes according to the system prompt rules.",
            images=[id_image_clean],
            system=ID_VERIFICATION_SYSTEM_PROMPT,
            format='json'
        )
        logger.debug(f"Ollama response: {raw_response}")
        ai_result = json.loads(raw_response['response'])

        # Validate the structure of the AI's response
        if not isinstance(ai_result, dict) or "success" not in ai_result or "identity" not in ai_result:
            logger.error("AI returned a malformed response object.")
            raise ValueError("AI returned a malformed response object.")

        if not ai_result.get("success"):
            logger.error(f"Identity verification failed: {ai_result.get('identity')}")
            raise HTTPException(
                status_code=400,
                detail={"error": "Identity verification failed by AI", "details": ai_result.get("identity")}
            )

        # Validate address format
        if not req.address.startswith("secret1") or len(req.address) != 45:
            logger.error(f"Invalid Secret Network address: {req.address}")
            raise HTTPException(status_code=400, detail="Invalid Secret Network address")

        # On-chain Interaction Step
        identity_hash = generate_hash(ai_result["identity"])
        message_object = { "register": { "address": req.address, "id_hash": identity_hash, "affiliate": req.referredBy } }
        tx_info = await contract_interaction(message_object)

        # Match main.py response structure
        return {
            "success": True,
            "hash": identity_hash,
            "response": tx_info.rawlog
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@router.post("/chat", summary="AI Chat Endpoint")
async def chat(req: ChatRequest):
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
        logger.error(f"Error in /chat endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")

@router.get("/analytics", summary="Get ERTH Analytics Data")
async def get_analytics():
    from analytics_manager import analytics_history
    return {
        "latest": analytics_history[-1] if analytics_history else None,
        "history": analytics_history
    }