# /routers/register.py (Final, Complete Version)

import asyncio
import hashlib
import json
import logging
from typing import Dict

from fastapi import APIRouter, HTTPException, Depends
from secret_sdk.client.lcd import AsyncLCDClient
from secret_sdk.exceptions import LCDResponseError
from secret_sdk.key.mnemonic import MnemonicKey
# The AsyncWallet is created via the client, so a direct import is not needed.
# We get it from the client factory method below.
from secret_sdk.core.wasm import MsgExecuteContract
from secret_sdk.core.coins import Coins

import config
from models import RegisterRequest
# Import your dependencies and updated prompts
from dependencies import get_async_secret_client, ollama_async_client, secret_client
from prompts import ID_VERIFICATION_SYSTEM_PROMPT, FACE_MATCHING_SYSTEM_PROMPT

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
router = APIRouter()

def generate_hash(data: Dict) -> str:
    """Creates a SHA256 hash of a JSON object."""
    # Use sort_keys=True to ensure the hash is deterministic
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()

@router.post("/register", summary="Register a new user")
async def register(
    req: RegisterRequest,
    # FastAPI injects the async client from your dependencies file
    secret_async_client: AsyncLCDClient = Depends(get_async_secret_client)
):
    """
    Handles user registration using fully asynchronous clients, correct wallet
    creation, and detailed AI failure reasons.
    """
    try:
        # Sanitize base64 image strings
        id_image_clean = req.idImage.split(',', 1)[1]
        selfie_image_clean = req.selfieImage.split(',', 1)[1]

        # Step 1 & 2: Perform AI checks concurrently for efficiency
        id_task = ollama_async_client.generate(
            model=config.OLLAMA_MODEL,
            prompt="[ID IMAGE] Extract identity and detect fakes...",
            images=[id_image_clean], system=ID_VERIFICATION_SYSTEM_PROMPT, format='json'
        )
        face_match_task = ollama_async_client.generate(
            model=config.OLLAMA_MODEL,
            prompt="[FIRST IMAGE: ID Card], [SECOND IMAGE: Selfie]...",
            images=[id_image_clean, selfie_image_clean], system=FACE_MATCHING_SYSTEM_PROMPT, format='json'
        )
        id_response, face_match_response = await asyncio.gather(id_task, face_match_task)

        # Process ID Verification result
        ai_result = json.loads(id_response['response'])
        if not ai_result.get("success"):
            # Use the new 'failure_reason' for a better error message
            reason = ai_result.get("failure_reason", "ID verification check failed for an unknown reason.")
            raise HTTPException(status_code=400, detail={"error": "Identity verification failed", "reason": reason})

        # Process Face Matching result
        face_match_result = json.loads(face_match_response['response'])
        if face_match_result.get("error_message") or not face_match_result.get("is_match"):
            # Provide the specific error or the reason for the mismatch
            reason = face_match_result.get("error_message") or face_match_result.get("reason", "Face does not match ID.")
            raise HTTPException(status_code=400, detail={"error": "Selfie verification failed", "reason": reason})

        # On success, generate a hash from the verified identity data.
        # This code will not be reached if verification fails.
        identity_hash = generate_hash(ai_result["identity"])

        # Step 3: Check for existing registration on-chain
        logger.info(f"Checking for existing registration with hash: {identity_hash}")
        query_msg = {"query_registration_status_by_id_hash": {"id_hash": identity_hash}}
        existing_registration = await secret_async_client.wasm.contract_query(
            config.REGISTRATION_CONTRACT, query_msg, config.REGISTRATION_HASH
        )
        if existing_registration.get("registration_status"):
            raise HTTPException(status_code=409, detail="This identity document has already been registered.")

        # Step 4: Execute the registration transaction
        # CORRECT: Create the wallet using the async client factory method
        async_wallet = secret_async_client.wallet(MnemonicKey(config.WALLET_KEY))

        # Check balance before proceeding
        balance = await secret_async_client.bank.balance(async_wallet.key.acc_address)
        uscrt_coin = (balance[0] if balance else Coins()).get("uscrt")
        if not uscrt_coin or int(uscrt_coin.amount) < 1000000: # Example fee
            raise HTTPException(status_code=400, detail="Insufficient wallet balance for transaction fee.")

        # Create and broadcast the transaction
        message_object = {"register": {"address": req.address, "id_hash": identity_hash, "affiliate": req.referredBy}}
        msg = MsgExecuteContract(
            sender=async_wallet.key.acc_address, contract=config.REGISTRATION_CONTRACT,
            msg=message_object, code_hash=config.REGISTRATION_HASH,
            # Use the synchronous client's encryption utils for this part as required
            encryption_utils=secret_client.encrypt_utils
        )
        tx = await async_wallet.create_and_broadcast_tx(msg_list=[msg], gas=1000000, memo="")
        if tx.code != 0:
            raise HTTPException(status_code=500, detail=f"Transaction broadcast failed: {tx.raw_log}")

        # Reliable polling loop to confirm transaction inclusion
        tx_info = None
        for i in range(30):  # Poll for ~30 seconds
            try:
                tx_info = await secret_async_client.tx.tx_info(tx.txhash)
                if tx_info:
                    break  # Exit loop if tx is found
            except LCDResponseError as e:
                # This error is expected and means the tx is not yet indexed
                if "tx not found" in str(e).lower():
                    logger.debug(f"Polling for tx {tx.txhash}... attempt {i+1}")
                    await asyncio.sleep(1)
                    continue
                # For other LCD errors, fail fast
                raise HTTPException(status_code=500, detail=f"Error polling for transaction: {e}")
        
        if not tx_info:
            raise HTTPException(status_code=504, detail="Transaction polling timed out. The transaction may have failed or is still pending.")
        
        # Check if the transaction succeeded on-chain
        if tx_info.code != 0:
            raise HTTPException(status_code=400, detail=f"Transaction failed on-chain: {tx_info.raw_log}")

        return {"success": True, "hash": identity_hash, "tx_hash": tx_info.txhash, "logs": tx_info.logs}

    except HTTPException:
        # Re-raise HTTPException directly to let FastAPI handle it
        raise
    except Exception as e:
        # Catch any other unexpected errors and log them
        logger.error(f"An unexpected error occurred during registration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {str(e)}")