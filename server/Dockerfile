FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libssl-dev \
    libsecp256k1-dev \
    libsqlite3-dev \
    liblzma-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create and set permissions for WALLET_KEY.txt
ARG WALLET_MNEMONIC
RUN echo "$WALLET_MNEMONIC" > WALLET_KEY.txt \
    && chmod 644 WALLET_KEY.txt \
    && chown 1000:1000 WALLET_KEY.txt

# Run Uvicorn
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5000"]