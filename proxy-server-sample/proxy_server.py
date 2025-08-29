#!/usr/bin/env python3
"""
SyftBox Proxy Server - FastAPI Implementation
Minimal proxy server for S3 CORS bypass
"""

import httpx
import logging
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="SyftBox Proxy Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request model
class ProxyRequest(BaseModel):
    url: str
    key: Optional[str] = "unknown"

@app.post("/proxy-download")
async def proxy_download(request: ProxyRequest):
    """Proxy download endpoint - fetches content from URL and returns it"""
    
    logger.info(f"Proxying download: {request.key}")
    logger.info(f"  URL: {request.url[:100]}...")
    
    try:
        # Fetch content from URL
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(
                request.url,
                headers={"User-Agent": "SyftBox-Proxy/1.0"}
            )
        
        if response.status_code != 200:
            logger.error(f"  ❌ Error: HTTP {response.status_code}")
            return Response(
                content=f'{{"error": "HTTP {response.status_code}"}}',
                status_code=response.status_code,
                media_type="application/json"
            )
        
        # Return the content with original headers
        logger.info(f"  ✅ Success: {len(response.content)} bytes")
        return Response(
            content=response.content,
            media_type=response.headers.get("content-type", "application/octet-stream"),
            headers={"Cache-Control": "no-cache"}
        )
        
    except httpx.TimeoutException:
        logger.error("  ❌ Request timeout")
        return Response(
            content='{"error": "Request timeout"}',
            status_code=500,
            media_type="application/json"
        )
    except Exception as e:
        logger.error(f"  ❌ Error: {str(e)}")
        return Response(
            content=f'{{"error": "Proxy error", "message": "{str(e)}"}}',
            status_code=500,
            media_type="application/json"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)