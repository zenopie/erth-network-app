# /main.py
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import config
import api_routes
import analytics_manager

app = FastAPI(
    title="Erth Network API (Consolidated)",
    description="Backend services for Erth Network applications.",
    version="1.1.0"
)

# --- Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# --- Event Handlers & Scheduler ---
scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def startup_event():
    """Initializes analytics and starts the scheduler."""
    print("Application startup...")
    # Initialize shared clients (now done at import time in dependencies.py)
    analytics_manager.init_analytics()
    scheduler.add_job(analytics_manager.update_analytics_job, 'interval', hours=24)
    scheduler.start()
    print("Startup complete.")

@app.on_event("shutdown")
def shutdown_event():
    """Shuts down the scheduler."""
    scheduler.shutdown()
    print("Application shutdown.")

# --- API Router ---
app.include_router(api_routes.router, prefix="/api", tags=["Core API"])

@app.get("/", tags=["Root"])
async def read_root():
    return {"message": "Welcome to the Erth Network API"}

# --- Run Server ---
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=config.WEBHOOK_PORT,
        reload=True
    )