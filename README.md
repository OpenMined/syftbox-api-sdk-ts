# SyftBox API SDK

TypeScript SDK for interacting with the SyftBox API - a secure data collaboration platform.

## Features

- **Authentication**: OTP-based authentication with automatic token refresh
- **Blob Storage**: Upload, download, and manage files with presigned URLs
- **WebSocket**: Real-time bidirectional communication
- **RPC**: Remote procedure calls with polling support
- **ACL**: Access control list management
- **Datasite**: Data site operations
- **Plugin System**: Extensible architecture with middleware support
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Error Handling**: Detailed error codes and context preservation

## Installation

```bash
npm install @syftbox/api-sdk
# or
yarn add @syftbox/api-sdk
# or
pnpm add @syftbox/api-sdk
```

## Quick Start

```typescript
import { createSyftBoxClient } from '@syftbox/api-sdk';

// Initialize the client
const client = createSyftBoxClient({
  serverUrl: 'https://api.syftbox.com',
  logging: {
    enabled: true,
    level: 'info'
  }
});

// Authenticate with OTP
await client.auth.requestOTP('user@example.com');
await client.auth.verifyOTP('user@example.com', '123456');

// Upload a file
const file = new File(['Hello World'], 'hello.txt', { type: 'text/plain' });
const result = await client.blob.upload('path/to/hello.txt', file);

// Use WebSocket for real-time updates
client.websocket.connect();
client.websocket.on('message', (msg) => {
  console.log('Received:', msg);
});
```

## Configuration

```typescript
const client = createSyftBoxClient({
  serverUrl: 'https://api.syftbox.com',
  
  // Authentication options
  auth: {
    tokenStorage: new LocalStorageTokenStorage(), // or MemoryTokenStorage, SessionStorageTokenStorage
    autoRefresh: true
  },
  
  // HTTP client options
  http: {
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
    headers: {
      'X-Custom-Header': 'value'
    }
  },
  
  // WebSocket options
  websocket: {
    url: 'wss://api.syftbox.com/ws',
    reconnect: true,
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  },
  
  // Proxy configuration for blob downloads
  proxy: {
    baseUrl: 'http://localhost:8000'
  },
  
  // Logging configuration
  logging: {
    enabled: true,
    level: 'debug' // 'debug' | 'info' | 'warn' | 'error'
  }
});
```

## API Services

### Authentication Service

```typescript
// Request OTP
await client.auth.requestOTP('user@example.com');

// Verify OTP
const tokens = await client.auth.verifyOTP('user@example.com', '123456');

// Check authentication status
const isAuthenticated = client.auth.isAuthenticated();

// Get current user
const user = client.auth.getCurrentUser();

// Logout
await client.auth.logout();
```

### Blob Service

```typescript
// Upload file
const uploadResult = await client.blob.upload('path/to/file.txt', fileData);

// Download file
const fileContent = await client.blob.downloadFile('path/to/file.txt');

// Get presigned URLs for upload
const presignedUrls = await client.blob.uploadPresigned(['file1.txt', 'file2.txt']);

// Delete files
const deleteResult = await client.blob.delete(['file1.txt', 'file2.txt']);

// List blobs
const blobs = await client.blob.list();

// Check if file exists
const exists = await client.blob.exists('path/to/file.txt');

// Get file metadata
const metadata = await client.blob.getMetadata('path/to/file.txt');
```

### WebSocket Service

```typescript
// Connect to WebSocket
await client.websocket.connect();

// Send message
client.websocket.send({
  type: 'custom',
  data: { message: 'Hello' }
});

// Listen for messages
client.websocket.on('message', (message) => {
  console.log('Received:', message);
});

// Handle connection events
client.websocket.on('connect', () => {
  console.log('Connected');
});

client.websocket.on('disconnect', (event) => {
  console.log('Disconnected:', event);
});

// Disconnect
client.websocket.disconnect();
```

### RPC Service

```typescript
// Send RPC request
const result = await client.rpc.send({
  syftURL: { user: 'alice', domain: 'example.com', path: '/api/method' },
  from: 'bob',
  timeout: 5000
});

// Poll for response
const pollResult = await client.rpc.poll({
  requestId: result.requestId,
  from: 'bob',
  syftURL: { user: 'alice', domain: 'example.com', path: '/api/method' }
});
```

### ACL Service

```typescript
// Check access permissions
const hasAccess = await client.acl.check({
  user: 'alice',
  path: '/data/file.txt',
  level: AccessLevel.READ
});
```

### Datasite Service

```typescript
// Get datasite view
const view = await client.datasite.view('alice', '/data');
```

## Plugin System

Create custom plugins to extend functionality:

```typescript
import { SyftBoxPlugin } from '@syftbox/api-sdk';

const loggingPlugin: SyftBoxPlugin = {
  name: 'custom-logger',
  version: '1.0.0',
  
  onRequest(config) {
    console.log('Request:', config);
    return config;
  },
  
  onResponse(response) {
    console.log('Response:', response);
    return response;
  },
  
  onError(error) {
    console.error('Error:', error);
    return error;
  }
};

// Register plugin
client.plugins.register(loggingPlugin);
```

## Error Handling

The SDK provides comprehensive error handling with specific error codes:

```typescript
import { SyftBoxError, SyftBoxErrorCode } from '@syftbox/api-sdk';

try {
  await client.blob.upload('file.txt', data);
} catch (error) {
  if (error instanceof SyftBoxError) {
    switch (error.code) {
      case SyftBoxErrorCode.AUTHENTICATION_FAILED:
        // Handle auth error
        break;
      case SyftBoxErrorCode.BLOB_QUOTA_EXCEEDED:
        // Handle quota error
        break;
      default:
        // Handle other errors
    }
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run typecheck
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please [open an issue](https://github.com/syftbox/syftbox-api-sdk/issues) on GitHub.