import json
import logging
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from models import ChatRequest
from dependencies import ollama_async_client  # use async client here

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/chat", summary="AI Chat Endpoint")
async def chat(req: ChatRequest):
    try:
        async def stream_response():
            # Must await to get async generator
            async for chunk in await ollama_async_client.chat(
                model=req.model,
                messages=req.messages,
                stream=True
            ):
                if 'message' in chunk:
                    chunk_data = json.dumps({"message": chunk['message']})
                    logger.debug(f"Sending chunk: {chunk_data}")
                    yield chunk_data + "\n"
                else:
                    logger.warning(f"Unexpected chunk format: {chunk}")
                    yield json.dumps({"error": "Unexpected chunk format"}) + "\n"

        if req.stream:
            return StreamingResponse(stream_response(), media_type="application/x-ndjson")
        else:
            response = await ollama_async_client.chat(
                model=req.model,
                messages=req.messages,
                stream=False
            )
            if 'message' not in response:
                logger.error(f"Non-streaming response missing 'message' key: {response}")
                raise HTTPException(status_code=500, detail="Invalid response format from Ollama")
            return {"message": response['message']}

    except Exception as e:
        logger.error(f"Error in /chat endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")
