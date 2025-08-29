import { LoggingPlugin } from '../../../plugins/built-in/logging-plugin';
import { SyftBoxPluginContext } from '../../../plugins/types';
import { RequestConfig, ResponseData } from '../../../http/types';
import { Message } from '../../../types';

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('LoggingPlugin', () => {
  let plugin: LoggingPlugin;
  let context: SyftBoxPluginContext;

  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new LoggingPlugin();
    context = {
      logger: mockLogger,
      config: {},
    };
  });

  describe('plugin metadata', () => {
    it('should have correct metadata', () => {
      expect(plugin.name).toBe('logging');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBe('Logs HTTP requests, responses, and WebSocket messages');
    });
  });

  describe('installation', () => {
    it('should install with default config', () => {
      plugin.install(context);

      expect(mockLogger.info).toHaveBeenCalledWith('Logging plugin installed', {
        config: expect.objectContaining({
          logRequests: true,
          logResponses: true,
          logWebSocketMessages: true,
          logLevel: 'info',
          sanitizeHeaders: true,
        }),
      });
    });

    it('should install with custom config', () => {
      context.config = {
        logRequests: false,
        logLevel: 'debug',
        sanitizeHeaders: false,
      };

      plugin.install(context);

      expect(mockLogger.info).toHaveBeenCalledWith('Logging plugin installed', {
        config: expect.objectContaining({
          logRequests: false,
          logResponses: true, // default
          logWebSocketMessages: true, // default
          logLevel: 'debug',
          sanitizeHeaders: false,
        }),
      });
    });
  });

  describe('request logging', () => {
    beforeEach(() => {
      plugin.install(context);
    });

    it('should log requests when enabled', async () => {
      const config: RequestConfig = {
        method: 'POST',
        url: '/api/test',
        headers: { 'Content-Type': 'application/json' },
        data: { test: 'data' },
      };

      const result = await plugin.onRequest!(config);

      expect(result).toEqual(config);
      expect(mockLogger.info).toHaveBeenCalledWith('Request', {
        method: 'POST',
        url: '/api/test',
        headers: { 'Content-Type': 'application/json' },
        hasData: true,
      });
    });

    it('should not log requests when disabled', async () => {
      context.config = { logRequests: false };
      plugin.install(context);

      // Clear mocks after installation to only count the request handling
      jest.clearAllMocks();

      const config: RequestConfig = {
        method: 'GET',
        url: '/api/test',
      };

      await plugin.onRequest!(config);

      // Should not log any requests when disabled
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should sanitize sensitive headers', async () => {
      const config: RequestConfig = {
        method: 'GET',
        url: '/api/test',
        headers: {
          Authorization: 'Bearer secret-token',
          Cookie: 'session=abc123',
          'X-API-Key': 'secret-key',
          'Content-Type': 'application/json',
        },
      };

      await plugin.onRequest!(config);

      expect(mockLogger.info).toHaveBeenCalledWith('Request', {
        method: 'GET',
        url: '/api/test',
        headers: {
          Authorization: '[REDACTED]',
          Cookie: '[REDACTED]',
          'X-API-Key': '[REDACTED]',
          'Content-Type': 'application/json',
        },
        hasData: false,
      });
    });

    it('should not sanitize headers when disabled', async () => {
      context.config = { sanitizeHeaders: false };
      plugin.install(context);

      const config: RequestConfig = {
        method: 'GET',
        url: '/api/test',
        headers: {
          Authorization: 'Bearer secret-token',
          'Content-Type': 'application/json',
        },
      };

      await plugin.onRequest!(config);

      expect(mockLogger.info).toHaveBeenCalledWith('Request', {
        method: 'GET',
        url: '/api/test',
        headers: {
          Authorization: 'Bearer secret-token',
          'Content-Type': 'application/json',
        },
        hasData: false,
      });
    });
  });

  describe('response logging', () => {
    beforeEach(() => {
      plugin.install(context);
    });

    it('should log responses when enabled', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        data: { result: 'success' },
        headers: { 'Content-Type': 'application/json' },
      };

      const result = await plugin.onResponse!(response);

      expect(result).toEqual(response);
      expect(mockLogger.info).toHaveBeenCalledWith('Response', {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' },
        hasData: true,
      });
    });

    it('should not log responses when disabled', async () => {
      context.config = { logResponses: false };
      plugin.install(context);

      // Clear mocks after installation to only count the response handling
      jest.clearAllMocks();

      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        data: { result: 'success' },
        headers: {},
      };

      await plugin.onResponse!(response);

      // Should not log any responses when disabled
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('error logging', () => {
    beforeEach(() => {
      plugin.install(context);
    });

    it('should log errors', async () => {
      const error = new Error('Test error');
      error.stack = 'Error stack trace';

      const result = await plugin.onError!(error);

      expect(result).toEqual(error);
      expect(mockLogger.error).toHaveBeenCalledWith('HTTP Error', {
        name: 'Error',
        message: 'Test error',
        stack: 'Error stack trace',
      });
    });
  });

  describe('WebSocket logging', () => {
    beforeEach(() => {
      plugin.install(context);
    });

    it('should log WebSocket messages when enabled', async () => {
      const message: Message = {
        id: 'test-id',
        typ: 1,
        dat: { test: 'data' },
      };

      const result = await plugin.onWebSocketMessage!(message);

      expect(result).toEqual(message);
      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket Message', {
        id: 'test-id',
        type: 1,
        hasData: true,
      });
    });

    it('should not log WebSocket messages when disabled', async () => {
      context.config = { logWebSocketMessages: false };
      plugin.install(context);

      // Clear mocks after installation to only count the message handling
      jest.clearAllMocks();

      const message: Message = {
        id: 'test-id',
        typ: 1,
        dat: { test: 'data' },
      };

      await plugin.onWebSocketMessage!(message);

      // Should not log any messages when disabled
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should log WebSocket connection', async () => {
      await plugin.onWebSocketConnect!();

      expect(mockLogger.info).toHaveBeenCalledWith('WebSocket Connected');
    });

    it('should log WebSocket disconnection', async () => {
      const event = { code: 1000, reason: 'Normal closure' };

      await plugin.onWebSocketDisconnect!(event);

      expect(mockLogger.warn).toHaveBeenCalledWith('WebSocket Disconnected', event);
    });
  });

  describe('log levels', () => {
    it('should use debug level', async () => {
      context.config = { logLevel: 'debug' };
      plugin.install(context);

      const config: RequestConfig = {
        method: 'GET',
        url: '/test',
      };

      await plugin.onRequest!(config);

      expect(mockLogger.debug).toHaveBeenCalledWith('Request', expect.any(Object));
    });

    it('should use warn level', async () => {
      context.config = { logLevel: 'warn' };
      plugin.install(context);

      const config: RequestConfig = {
        method: 'GET',
        url: '/test',
      };

      await plugin.onRequest!(config);

      expect(mockLogger.warn).toHaveBeenCalledWith('Request', expect.any(Object));
    });

    it('should use error level', async () => {
      context.config = { logLevel: 'error' };
      plugin.install(context);

      const config: RequestConfig = {
        method: 'GET',
        url: '/test',
      };

      await plugin.onRequest!(config);

      expect(mockLogger.error).toHaveBeenCalledWith('Request', expect.any(Object));
    });
  });

  describe('header sanitization', () => {
    beforeEach(() => {
      plugin.install(context);
    });

    it('should sanitize case-insensitive headers', async () => {
      const config: RequestConfig = {
        method: 'GET',
        url: '/test',
        headers: {
          AUTHORIZATION: 'Bearer token',
          Cookie: 'session=123',
          'x-api-key': 'secret',
          'X-Auth-Token': 'token',
        },
      };

      await plugin.onRequest!(config);

      expect(mockLogger.info).toHaveBeenCalledWith('Request', {
        method: 'GET',
        url: '/test',
        headers: {
          AUTHORIZATION: '[REDACTED]',
          Cookie: '[REDACTED]',
          'x-api-key': '[REDACTED]',
          'X-Auth-Token': '[REDACTED]',
        },
        hasData: false,
      });
    });

    it('should handle empty headers', async () => {
      const config: RequestConfig = {
        method: 'GET',
        url: '/test',
      };

      await plugin.onRequest!(config);

      expect(mockLogger.info).toHaveBeenCalledWith('Request', {
        method: 'GET',
        url: '/test',
        headers: {},
        hasData: false,
      });
    });
  });
});
