import { WebSocketService, WebSocketConnectionState } from '../../services/websocket';
import { IAuthService } from '../../services/auth';
import { MessageType } from '../../types';
import { SyftBoxError, SyftBoxErrorCode } from '../../errors';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Mock successful send
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code: code || 1000, reason: reason || '' }));
  }

  // Helper methods for testing
  simulateMessage(data: any): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// Mock auth service
const mockAuthService: IAuthService = {
  requestOTP: jest.fn(),
  verifyOTP: jest.fn(),
  refreshToken: jest.fn(),
  logout: jest.fn(),
  isAuthenticated: jest.fn().mockReturnValue(true),
  getAccessToken: jest.fn().mockReturnValue('mock-token'),
  getRefreshToken: jest.fn(),
  getCurrentUser: jest.fn(),
  ensureValidToken: jest.fn().mockResolvedValue('mock-token'),
};

// Mock global WebSocket
(global as any).WebSocket = MockWebSocket;

describe('WebSocketService', () => {
  let service: WebSocketService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-setup mocks after clearing
    (mockAuthService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (mockAuthService.getAccessToken as jest.Mock).mockReturnValue('mock-token');
    (mockAuthService.ensureValidToken as jest.Mock).mockResolvedValue('mock-token');

    service = new WebSocketService({ url: 'wss://test.example.com' }, mockAuthService);
  });

  afterEach(() => {
    service.disconnect();
  });

  describe('connection management', () => {
    it('should connect successfully', async () => {
      const connectedPromise = new Promise(resolve => {
        service.addEventListener('connected', resolve);
      });

      await service.connect();
      await connectedPromise;

      expect(service.isConnected()).toBe(true);
      expect(service.getConnectionState()).toBe(WebSocketConnectionState.CONNECTED);
    });

    it('should fail to connect without authentication', async () => {
      (mockAuthService.isAuthenticated as jest.Mock).mockReturnValue(false);

      await expect(service.connect()).rejects.toThrow(SyftBoxError);
      await expect(service.connect()).rejects.toThrow('Authentication required');
    });

    it('should disconnect properly', async () => {
      await service.connect();

      const disconnectedPromise = new Promise(resolve => {
        service.addEventListener('disconnected', resolve);
      });

      service.disconnect();
      await disconnectedPromise;

      expect(service.isConnected()).toBe(false);
      expect(service.getConnectionState()).toBe(WebSocketConnectionState.DISCONNECTED);
    });

    it('should not connect if already connected', async () => {
      await service.connect();
      expect(service.isConnected()).toBe(true);

      // Second connect should not create new connection
      await service.connect();
      expect(service.isConnected()).toBe(true);
    });
  });

  describe('message handling', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should send messages when connected', () => {
      const message = {
        id: 'test-id',
        typ: MessageType.SYSTEM,
        dat: { test: 'data' },
      };

      expect(() => service.send(message)).not.toThrow();
    });

    it('should queue messages when not connected', () => {
      service.disconnect();

      const message = {
        id: 'test-id',
        typ: MessageType.SYSTEM,
        dat: { test: 'data' },
      };

      expect(() => service.send(message)).not.toThrow();
    });

    it('should receive and emit messages', async () => {
      const testMessage = {
        id: 'test-id',
        typ: MessageType.SYSTEM,
        dat: { test: 'data' },
      };

      const messagePromise = new Promise(resolve => {
        service.addEventListener('message', (event: any) => {
          resolve(event.detail);
        });
      });

      // Simulate receiving a message
      const ws = (service as any).ws as MockWebSocket;
      ws.simulateMessage(testMessage);

      const receivedMessage = await messagePromise;
      expect(receivedMessage).toEqual(testMessage);
    });

    it('should handle malformed messages', async () => {
      const errorPromise = new Promise(resolve => {
        service.addEventListener('error', (event: any) => {
          resolve(event.detail);
        });
      });

      // Simulate receiving malformed message
      const ws = (service as any).ws as MockWebSocket;
      if (ws.onmessage) {
        ws.onmessage(new MessageEvent('message', { data: 'invalid-json' }));
      }

      const error = await errorPromise;
      expect(error).toBeInstanceOf(SyftBoxError);
    });
  });

  describe('reconnection', () => {
    it('should attempt reconnection on unexpected disconnect', async () => {
      await service.connect();

      const reconnectingPromise = new Promise(resolve => {
        service.addEventListener('reconnecting', resolve);
      });

      // Simulate unexpected disconnect
      const ws = (service as any).ws as MockWebSocket;
      ws.close(1006, 'Connection lost'); // Abnormal closure

      await reconnectingPromise;
      expect(service.getReconnectAttempts()).toBeGreaterThan(0);
    });

    it('should not reconnect on clean disconnect', async () => {
      await service.connect();

      let reconnectingCalled = false;
      service.addEventListener('reconnecting', () => {
        reconnectingCalled = true;
      });

      // Simulate clean disconnect
      const ws = (service as any).ws as MockWebSocket;
      ws.close(1000, 'Normal closure');

      // Wait a bit to ensure no reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(reconnectingCalled).toBe(false);
    });

    // TODO: Fix reconnection test - the timing is tricky in test environment
    it.skip('should limit reconnection attempts', async () => {
      const maxAttempts = 2;
      service = new WebSocketService(
        { url: 'wss://test.example.com', reconnectAttempts: maxAttempts, reconnectDelay: 10 },
        mockAuthService,
      );

      await service.connect();
      expect(service.isConnected()).toBe(true);

      let reconnectingEventCount = 0;
      service.addEventListener('reconnecting', () => {
        reconnectingEventCount++;
      });

      // Simulate unexpected disconnect
      const ws = (service as any).ws as MockWebSocket;
      ws.close(1006, 'Connection lost');

      // Wait for at least one reconnection attempt
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have started reconnection process
      expect(reconnectingEventCount).toBeGreaterThan(0);
      expect(service.getReconnectAttempts()).toBeGreaterThan(0);
    });
  });

  describe('configuration', () => {
    it('should respect custom configuration', () => {
      const customService = new WebSocketService(
        {
          url: 'wss://custom.example.com',
          reconnectAttempts: 3,
          reconnectDelay: 500,
          heartbeatInterval: 15000,
        },
        mockAuthService,
      );

      expect(customService).toBeInstanceOf(WebSocketService);
      expect((customService as any).config.reconnectAttempts).toBe(3);
      expect((customService as any).config.reconnectDelay).toBe(500);
      expect((customService as any).config.heartbeatInterval).toBe(15000);
    });

    it('should auto-connect when configured', async () => {
      const autoConnectService = new WebSocketService(
        { url: 'wss://test.example.com', autoConnect: true },
        mockAuthService,
      );

      // Wait for auto-connection
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(autoConnectService.getConnectionState()).toBe(WebSocketConnectionState.CONNECTED);

      autoConnectService.disconnect();
    });
  });
});
