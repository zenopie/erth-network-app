# /main.py
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import config
# Import the individual router modules
from routers import register, chat, analytics

app = FastAPI(
    title="Erth Network API",
    description="Backend services for Erth Network applications.",
    version="1.4.0" # Version bump to reflect change
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
    # Call init_analytics from the analytics router module
    analytics.init_analytics()
    # Schedule the job from the analytics router module to run every 24 hours
    scheduler.add_job(analytics.update_analytics_job, 'interval', hours=24)
    scheduler.start()
    print("Startup complete. Analytics scheduler is running.")

@app.on_event("shutdown")
def shutdown_event():
    """Shuts down the scheduler."""
    scheduler.shutdown()
    print("Application shutdown.")

# --- API Routers ---
app.include_router(register.router, prefix="/api", tags=["Registration"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(analytics.router, prefix="/api", tags=["Analytics"])


@app.get("/", tags=["Health Check"])
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