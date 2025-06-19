# /server/Dockerfile
# (This is a corrected version of your Dockerfile)

FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# System dependencies are often not needed unless you have C-extensions
# Keeping this slim unless a specific library requires them.
# If you run into build issues with a library, you can uncomment this.
# RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# Copy only the requirements file first to leverage Docker's layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code from the build context (the 'server' directory)
COPY . .

# Expose the port the app runs on
EXPOSE 5000

# Install Gunicorn for a production-ready server
RUN pip install gunicorn

# Define the command to run the application using Gunicorn
# It looks for the 'app' instance inside the 'main.py' file.
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "main:app", "--bind", "0.0.0.0:5000"]