FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
  build-essential \
  libtool \
  autotools-dev \
  automake \
  pkg-config \
  libffi-dev \
  libgmp-dev \
  python3-dev \
  git \
  curl \
  && rm -rf /var/lib/apt/lists/*


# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and WALLET_KEY.txt
COPY . .

# Set permissions for WALLET_KEY.txt
RUN chmod 644 WALLET_KEY.txt \
    && chown 1000:1000 WALLET_KEY.txt

# Env
ENV SECRET_AI_API_KEY="sk-GeomADW4NrwMMR_zbRVEWK7-0vxv6SBeA_jeijtaGHNdOKIYmcelKpydPgV-be0kGEneAuyx"

# Run Uvicorn
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5000"]