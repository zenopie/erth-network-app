# /models.py
from pydantic import BaseModel
from typing import Optional, List, Dict

class RegisterRequest(BaseModel):
    address: str
    idImage: str
    selfieImage: Optional[str] = None
    referredBy: Optional[str] = None

class ChatRequest(BaseModel):
    model: str
    messages: List[Dict]
    stream: bool = False