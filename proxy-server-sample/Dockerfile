# Use Python slim image for smaller size
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY proxy_server.py .

# Expose port 8000
EXPOSE 8000

# Run the FastAPI server
CMD ["uvicorn", "proxy_server:app", "--host", "0.0.0.0", "--port", "8000"]