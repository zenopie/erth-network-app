# /routers/register.py
import asyncio
import hashlib
import json
import logging
from typing import Dict

from fastapi import APIRouter, HTTPException
from secret_sdk.core.wasm import MsgExecuteContract
from secret_sdk.core.coins import Coins

import config
from models import RegisterRequest
from dependencies import wallet, secret_client, ollama_client
from prompts import ID_VERIFICATION_SYSTEM_PROMPT

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Helper functions specific to registration ---
def generate_hash(data: Dict) -> str:
    """Creates a SHA256 hash of a JSON object for consistent ID hashing."""
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

async def contract_interaction(message_object: Dict):
    """Creates a transaction, broadcasts it, and polls for the result."""
    # (This is the same contract_interaction function from your original api_routes.py)
    # ... (full function code here)
    try:
        logger.debug(f"Message object: {message_object}")
        balance = secret_client.bank.balance(wallet.key.acc_address)
        coins = balance[0] if balance else Coins()
        uscrt_coin = coins.get("uscrt")
        uscrt_amount = int(uscrt_coin.amount) if uscrt_coin else 0
        if uscrt_amount < 1000000:
            raise HTTPException(status_code=400, detail="Insufficient wallet balance for transaction")
        
        msg = MsgExecuteContract(
            sender=wallet.key.acc_address,
            contract=config.REGISTRATION_CONTRACT,
            msg=message_object,
            code_hash=config.REGISTRATION_HASH,
            encryption_utils=secret_client.encrypt_utils
        )
        tx = wallet.create_and_broadcast_tx(msg_list=[msg], gas=1000000, memo="")
        if tx.code != 0:
            raise HTTPException(status_code=500, detail=f"Transaction broadcast failed: {tx.rawlog}")
        
        for _ in range(30):
            await asyncio.sleep(1)
            try:
                tx_info = secret_client.tx.tx_info(tx.txhash)
                if tx_info.code != 0:
                    raise HTTPException(status_code=400, detail=f"Transaction failed on-chain: {tx_info.rawlog}")
                return tx_info
            except Exception as e:
                if "tx not found" in str(e).lower():
                    continue
                raise
        raise HTTPException(status_code=504, detail="Transaction polling timed out.")
    except Exception as e:
        logger.error(f"Contract interaction error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
        ai_result = json.loads(raw_response['response'])

        if not ai_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail={"error": "Identity verification failed by AI", "details": ai_result.get("identity")}
            )

        identity_hash = generate_hash(ai_result["identity"])

         # --- New logic to check for existing registration ---
        logger.info(f"Checking for existing registration with hash: {identity_hash}")
        
        try:
            # Construct the query message for the smart contract
            query_msg = {
                "query_registration_status_by_id_hash": {
                    "id_hash": identity_hash
                }
            }
            
            # Execute a read-only query against the smart contract
            existing_registration = secret_client.wasm.contract_query(
                contract_address=config.REGISTRATION_CONTRACT,
                query=query_msg,
                code_hash=config.REGISTRATION_HASH
            )

            # The query returns a dict like: {"registration_status": true, "last_claim": "..."}
            if existing_registration.get("registration_status"):
                logger.warning(f"Duplicate registration attempt for hash: {identity_hash}")
                # Use HTTP 409 Conflict for this specific error
                raise HTTPException(
                    status_code=409,
                    detail="This identity document has already been registered."
                )
            
            logger.info(f"No existing registration found for hash. Proceeding...")

        except HTTPException:
            # Re-raise the HTTPException we just created to stop execution
            raise
        except Exception as e:
            # Handle potential query errors (e.g., node down)
            logger.error(f"Error querying contract for existing registration: {e}", exc_info=True)
            raise HTTPException(status_code=503, detail="Could not verify registration status with the network.")
        message_object = { "register": { "address": req.address, "id_hash": identity_hash, "affiliate": req.referredBy } }
        tx_info = await contract_interaction(message_object)

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