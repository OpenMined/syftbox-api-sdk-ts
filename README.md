# SyftBox API SDK

TypeScript SDK for secure data collaboration with SyftBox - providing authentication, file operations, and datasite services.

## Installation

```bash
npm install @syftbox/api-sdk
```

## Quick Start

```typescript
import { SyftBoxClient } from '@syftbox/api-sdk';

// Initialize client
const client = SyftBoxClient.createSyftBoxClient({
  serverUrl: 'https://syftbox.net'
});

// 1. Authentication with OTP
await client.auth.requestOTP('your-email@example.com');
await client.auth.verifyOTP('your-email@example.com', '12345678');

// 2. Upload files
const testData = new Blob(['Hello SyftBox!'], { type: 'text/plain' });
await client.blob.upload('public/test.txt', testData);

// 3. Download files  
const fileData = await client.blob.downloadFile('public/test.txt');
const content = new TextDecoder('utf-8').decode(fileData);

// 4. Browse datasite files
const allFiles = await client.datasite.getView();
const publicFiles = await client.datasite.getPathView('public/');
```

## Core Use Cases

Based on the test interface, here are the three main use cases:

### 1. Authentication
```typescript
// Request OTP code via email
await client.auth.requestOTP('your-email@example.com');

// Verify the 8-digit code
await client.auth.verifyOTP('your-email@example.com', '12345678');

// Check if authenticated
const isLoggedIn = client.auth.isAuthenticated();
const currentUser = client.auth.getCurrentUser();
```

### 2. File Operations  
```typescript
// Upload a test file to your public folder
const testData = new Blob(['Test content'], { type: 'text/plain' });
await client.blob.upload('public/test-file.txt', testData);

// Download and read file content
const fileData = await client.blob.downloadFile('public/test-file.txt');
const textContent = new TextDecoder('utf-8').decode(fileData);
```

### 3. Browse Your Files
```typescript
// Get all accessible files  
const allFiles = await client.datasite.getView();
console.log(`Found ${allFiles.length} files`);

// Filter by folder path
const publicFiles = await client.datasite.getPathView('public/');
const dataFiles = await client.datasite.getPathView('data/');
```

## Try It Out

Run the test interface to see these features in action:

```bash
# Clone the repository
git clone <repository-url>
cd syftbox-api-sdk

# Build the SDK
npm install
npm run build

# Open the test interface
open test-browser/index.html
```

The test interface provides:
- **Live Authentication**: Request and verify OTP codes with your SyftBox email
- **File Upload/Download**: Test file operations with automatic test file creation
- **Datasite Browser**: Explore your files with filtering by path prefix

## Configuration Options

### Custom Proxy Server
For file downloads, you can configure a custom proxy server:

```typescript
const client = SyftBoxClient.createSyftBoxClient({
  serverUrl: 'https://syftbox.net',
  proxy: {
    baseUrl: 'https://your-proxy-server.com:8443'  // Your custom proxy server
  }
});
```

The SDK automatically appends `/proxy-download` to your base URL:
- `baseUrl: 'https://your-proxy-server.com:8443'` → `https://your-proxy-server.com:8443/proxy-download`
- `baseUrl: 'http://localhost:3000'` → `http://localhost:3000/proxy-download`
- **Default**: `http://localhost:8000/proxy-download` (if not specified)

### Additional Options
```typescript
const client = SyftBoxClient.createSyftBoxClient({
  serverUrl: 'https://syftbox.net',
  
  // Custom proxy for downloads
  proxy: {
    baseUrl: 'https://your-proxy.com'
  },
  
  // Logging configuration  
  logging: {
    enabled: true,
    level: 'debug'  // 'debug' | 'info' | 'warn' | 'error'
  },
  
  // Datasite caching
  datasite: {
    refreshIntervalMs: 10000,
    autoRefresh: true
  }
});
```

## Browser Usage

For browser applications, use the UMD bundle:

```html
<script src="dist/syftbox.umd.js"></script>
<script>
  const client = SyftBoxClient.createSyftBoxClient({
    serverUrl: 'https://syftbox.net',
    proxy: {
      baseUrl: 'https://your-proxy.com'  // Optional custom proxy
    }
  });
</script>
```

## Error Handling

```typescript
try {
  await client.auth.verifyOTP(email, otp);
} catch (error) {
  console.error('Authentication failed:', error.message);
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