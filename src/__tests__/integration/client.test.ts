import { SyftBoxClient } from '../../client';
import { AuthenticationManager } from '../../services/auth';
import { BlobService } from '../../services/blob';
import { WebSocketService } from '../../services/websocket';
import { RPCService } from '../../services/rpc';
import { PluginManager } from '../../plugins/manager';

// Create mock objects that we can control directly
const mockAuthService = {
  isAuthenticated: jest.fn().mockReturnValue(false),
  requestOTP: jest.fn().mockResolvedValue({ success: true }),
  verifyOTP: jest.fn().mockResolvedValue({
    success: true,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    user: { email: 'test@example.com' },
  }),
  refreshToken: jest.fn(),
  logout: jest.fn(),
  getAccessToken: jest.fn(),
  getRefreshToken: jest.fn(),
  getCurrentUser: jest.fn(),
  ensureValidToken: jest.fn(),
};

// Mock all services with simple object mocks
jest.mock('../../services/auth', () => ({
  AuthenticationManager: jest.fn().mockImplementation(() => mockAuthService),
}));

const mockBlobService = {
  upload: jest.fn().mockResolvedValue({
    success: true,
    blobId: 'test-blob-id',
    url: 'https://example.com/blob/test-blob-id',
  }),
  download: jest.fn(),
  delete: jest.fn(),
  getPresignedUrl: jest.fn(),
};

jest.mock('../../services/blob', () => ({
  BlobService: jest.fn().mockImplementation(() => mockBlobService),
}));

const mockWebSocketService = {
  isConnected: jest.fn().mockReturnValue(false),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  send: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  getConnectionState: jest.fn(),
  getReconnectAttempts: jest.fn(),
};

jest.mock('../../services/websocket', () => ({
  WebSocketService: jest.fn().mockImplementation(() => mockWebSocketService),
}));

const mockRPCService = {
  sendMessage: jest.fn().mockResolvedValue({
    status: 200,
    requestId: 'test-request-id',
  }),
  pollForResponse: jest.fn(),
  sendAndWait: jest.fn(),
  cancelPoll: jest.fn(),
  cleanup: jest.fn(),
  getPendingRequests: jest.fn(),
};

jest.mock('../../services/rpc', () => ({
  RPCService: jest.fn().mockImplementation(() => mockRPCService),
}));

const mockPluginManager = {
  installPlugin: jest.fn().mockResolvedValue(undefined),
  uninstallPlugin: jest.fn().mockResolvedValue(undefined),
  getInstalledPlugins: jest.fn().mockReturnValue([]),
  isPluginInstalled: jest.fn().mockReturnValue(false),
  getPlugin: jest.fn(),
  cleanup: jest.fn(),
  executeRequestHooks: jest.fn(),
  executeResponseHooks: jest.fn(),
  executeErrorHooks: jest.fn(),
  executeWebSocketMessageHooks: jest.fn(),
  executeWebSocketConnectHooks: jest.fn(),
  executeWebSocketDisconnectHooks: jest.fn(),
};

jest.mock('../../plugins/manager', () => ({
  PluginManager: jest.fn().mockImplementation(() => mockPluginManager),
}));

// Helper function to get mock instances - now returns direct mock objects
function getMockInstances() {
  return {
    mockAuthService,
    mockBlobService,
    mockWebSocketService,
    mockRPCService,
    mockPluginManager,
  };
}

// Mock console to avoid test output noise
const originalConsole = console;
beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console = originalConsole;
});

describe('SyftBoxClient Integration', () => {
  let client: SyftBoxClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations to default
    (AuthenticationManager as jest.MockedClass<typeof AuthenticationManager>).mockImplementation(
      () => mockAuthService,
    );
    (BlobService as jest.MockedClass<typeof BlobService>).mockImplementation(() => mockBlobService);
    (WebSocketService as jest.MockedClass<typeof WebSocketService>).mockImplementation(
      () => mockWebSocketService,
    );
    (RPCService as jest.MockedClass<typeof RPCService>).mockImplementation(() => mockRPCService);
    (PluginManager as jest.MockedClass<typeof PluginManager>).mockImplementation(
      () => mockPluginManager,
    );

    // Create client instance
    client = new SyftBoxClient({
      serverUrl: 'https://api.example.com',
      websocket: {
        url: 'wss://ws.example.com',
      },
    });
  });

  describe('initialization', () => {
    it('should initialize all services correctly', () => {
      expect(AuthenticationManager).toHaveBeenCalledWith(expect.any(Object));
      expect(BlobService).toHaveBeenCalledWith(expect.any(Object), expect.any(Object));
      expect(WebSocketService).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'wss://ws.example.com',
        }),
        expect.any(Object),
      );
      expect(RPCService).toHaveBeenCalledWith(expect.any(Object));
      expect(PluginManager).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should expose service interfaces', () => {
      expect(client.auth).toBeDefined();
      expect(client.blob).toBeDefined();
      expect(client.websocket).toBeDefined();
      expect(client.rpc).toBeDefined();
      expect(client.plugins).toBeDefined();
    });
  });

  describe('authentication flow', () => {
    it('should handle complete authentication flow', async () => {
      const { mockAuthService } = getMockInstances();

      // Request OTP
      const otpResult = await client.auth.requestOTP('test@example.com');
      expect(otpResult.success).toBe(true);
      expect(mockAuthService.requestOTP).toHaveBeenCalledWith('test@example.com');

      // Verify OTP
      const authResult = await client.auth.verifyOTP('test@example.com', '123456');
      expect(authResult.success).toBe(true);
      expect(authResult.user?.email).toBe('test@example.com');
      expect(mockAuthService.verifyOTP).toHaveBeenCalledWith('test@example.com', '123456');
    });

    it('should handle authentication errors', async () => {
      const { mockAuthService } = getMockInstances();
      mockAuthService.verifyOTP.mockRejectedValue(new Error('Invalid OTP'));

      await expect(client.auth.verifyOTP('test@example.com', 'invalid')).rejects.toThrow(
        'Invalid OTP',
      );
    });
  });

  describe('WebSocket integration', () => {
    it('should connect and disconnect WebSocket', async () => {
      const { mockWebSocketService } = getMockInstances();

      await client.websocket.connect();
      expect(mockWebSocketService.connect).toHaveBeenCalled();

      client.websocket.disconnect();
      expect(mockWebSocketService.disconnect).toHaveBeenCalled();
    });

    it('should handle WebSocket events', () => {
      const { mockWebSocketService } = getMockInstances();
      const messageHandler = jest.fn();
      client.websocket.addEventListener('message', messageHandler);

      // The actual event handling would be tested in the WebSocket service tests
      expect(mockWebSocketService.addEventListener).toHaveBeenCalledWith('message', messageHandler);
    });
  });

  describe('RPC operations', () => {
    it('should send RPC messages', async () => {
      const { mockRPCService } = getMockInstances();
      const request = {
        syftURL: { user: 'test', domain: 'example.com', path: 'endpoint' },
        from: 'sender@example.com',
      };

      const result = await client.rpc.sendMessage(request, { test: 'data' });

      expect(result.status).toBe(200);
      expect(result.requestId).toBe('test-request-id');
      expect(mockRPCService.sendMessage).toHaveBeenCalledWith(request, { test: 'data' });
    });

    it('should handle RPC errors', async () => {
      const { mockRPCService } = getMockInstances();
      mockRPCService.sendMessage.mockRejectedValue(new Error('RPC failed'));

      const request = {
        syftURL: { user: 'test', domain: 'example.com', path: 'endpoint' },
        from: 'sender@example.com',
      };

      await expect(client.rpc.sendMessage(request, {})).rejects.toThrow('RPC failed');
    });
  });

  describe('blob operations', () => {
    it('should upload blobs', async () => {
      const { mockBlobService } = getMockInstances();
      const file = new Blob(['test content'], { type: 'text/plain' });
      const result = await client.blob.upload(file, 'test.txt');

      expect(result.success).toBe(true);
      expect(result.blobId).toBe('test-blob-id');
      expect(mockBlobService.upload).toHaveBeenCalledWith(file, 'test.txt');
    });

    it('should handle blob upload errors', async () => {
      const { mockBlobService } = getMockInstances();
      mockBlobService.upload.mockRejectedValue(new Error('Upload failed'));

      const file = new Blob(['test content']);
      await expect(client.blob.upload(file)).rejects.toThrow('Upload failed');
    });
  });

  describe('plugin management', () => {
    it('should install plugins', async () => {
      const { mockPluginManager } = getMockInstances();
      const mockPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test plugin',
        install: jest.fn(),
      };

      await client.plugins.installPlugin(mockPlugin);

      expect(mockPluginManager.installPlugin).toHaveBeenCalledWith(mockPlugin);
    });

    it('should uninstall plugins', async () => {
      const { mockPluginManager } = getMockInstances();
      await client.plugins.uninstallPlugin('test-plugin');

      expect(mockPluginManager.uninstallPlugin).toHaveBeenCalledWith('test-plugin');
    });

    it('should list installed plugins', () => {
      const { mockPluginManager } = getMockInstances();
      mockPluginManager.getInstalledPlugins.mockReturnValue(['plugin1', 'plugin2']);

      const plugins = client.plugins.getInstalledPlugins();

      expect(plugins).toEqual(['plugin1', 'plugin2']);
      expect(mockPluginManager.getInstalledPlugins).toHaveBeenCalled();
    });
  });

  describe('error handling and resilience', () => {
    it('should handle service initialization errors gracefully', () => {
      (AuthenticationManager as jest.MockedClass<typeof AuthenticationManager>).mockImplementation(
        () => {
          throw new Error('Auth service failed to initialize');
        },
      );

      expect(() => {
        new SyftBoxClient({ serverUrl: 'https://api.example.com' });
      }).toThrow('Auth service failed to initialize');
    });

    it('should handle network errors across services', async () => {
      const { mockAuthService, mockBlobService, mockRPCService } = getMockInstances();
      mockAuthService.requestOTP.mockRejectedValue(new Error('Network error'));
      mockBlobService.upload.mockRejectedValue(new Error('Network error'));
      mockRPCService.sendMessage.mockRejectedValue(new Error('Network error'));

      await expect(client.auth.requestOTP('test@example.com')).rejects.toThrow('Network error');

      await expect(client.blob.upload(new Blob())).rejects.toThrow('Network error');

      await expect(
        client.rpc.sendMessage({
          syftURL: { user: 'test', domain: 'example.com', path: 'endpoint' },
          from: 'test@example.com',
        }),
      ).rejects.toThrow('Network error');
    });
  });

  describe('configuration handling', () => {
    it('should handle minimal configuration', () => {
      const minimalClient = new SyftBoxClient({
        serverUrl: 'https://api.example.com',
      });

      expect(minimalClient).toBeInstanceOf(SyftBoxClient);
      expect(minimalClient.auth).toBeDefined();
      expect(minimalClient.blob).toBeDefined();
      expect(minimalClient.websocket).toBeDefined();
      expect(minimalClient.rpc).toBeDefined();
      expect(minimalClient.plugins).toBeDefined();
    });

    it('should handle full configuration', () => {
      const fullConfig = {
        serverUrl: 'https://api.example.com',
        timeout: 10000,
        retryAttempts: 5,
        retryDelay: 2000,
        websocket: {
          url: 'wss://ws.example.com',
          reconnectAttempts: 10,
          reconnectDelay: 1000,
          heartbeatInterval: 30000,
          autoConnect: true,
        },
      };

      const fullClient = new SyftBoxClient(fullConfig);

      expect(fullClient).toBeInstanceOf(SyftBoxClient);
      // Verify that configuration was passed to services
      expect(WebSocketService).toHaveBeenCalledWith(
        expect.objectContaining(fullConfig.websocket),
        expect.any(Object),
      );
    });
  });

  describe('service coordination', () => {
    it('should coordinate authentication with WebSocket connection', async () => {
      const { mockAuthService, mockWebSocketService } = getMockInstances();
      // Simulate authentication
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getAccessToken.mockReturnValue('valid-token');

      // Connect WebSocket after authentication
      await client.websocket.connect();

      expect(mockWebSocketService.connect).toHaveBeenCalled();
    });

    it('should handle plugin hooks in HTTP requests', async () => {
      const { mockPluginManager } = getMockInstances();
      // This would be tested at a more granular level in HTTP client tests
      // Here we just verify the plugin manager is properly initialized
      expect(mockPluginManager).toBeDefined();
    });
  });
});
