# SyftBox Proxy Server (FastAPI)

Minimal FastAPI implementation of the SyftBox proxy server for S3 CORS bypass.

## Quick Start with Docker

```bash
# Build the Docker image
docker build -t syftbox-proxy .

# Run the container
docker run -p 8000:8000 syftbox-proxy

# Or run with custom port
docker run -p 8443:8000 syftbox-proxy
```

## Local Installation

```bash
pip install -r requirements.txt
```

## Local Usage

```bash
# Run the server
python proxy_server.py

# Or with uvicorn directly
uvicorn proxy_server:app --host 0.0.0.0 --port 8000
```

## API

### POST /proxy-download

```json
{
  "url": "https://s3.amazonaws.com/bucket/file.pdf",
  "key": "optional-file-identifier"
}
```

## Configure SyftBox SDK

```typescript
const client = SyftBoxClient.createSyftBoxClient({
  serverUrl: 'https://syftbox.net',
  proxy: {
    baseUrl: 'http://localhost:8000'
  }
});
```

## Testing

```bash
curl -X POST http://localhost:8000/proxy-download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/file.pdf"}' \
  --output file.pdf
```

## Docker Compose (Optional)

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  proxy:
    build: .
    ports:
      - "8000:8000"
    restart: unless-stopped
```

Then run:
```bash
docker-compose up -d
```