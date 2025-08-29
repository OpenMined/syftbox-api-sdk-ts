import { MetricsPlugin } from '../../../plugins/built-in/metrics-plugin';
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

describe('MetricsPlugin', () => {
  let plugin: MetricsPlugin;
  let context: SyftBoxPluginContext;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    plugin = new MetricsPlugin();
    context = {
      logger: mockLogger,
      config: {},
    };
  });

  afterEach(() => {
    plugin.uninstall();
    jest.useRealTimers();
  });

  describe('plugin metadata', () => {
    it('should have correct metadata', () => {
      expect(plugin.name).toBe('metrics');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBe('Collects performance and usage metrics');
    });
  });

  describe('installation and uninstallation', () => {
    it('should install with default config', () => {
      plugin.install(context);

      expect(mockLogger.info).toHaveBeenCalledWith('Metrics plugin installed', {
        config: expect.objectContaining({
          collectRequestMetrics: true,
          collectWebSocketMetrics: true,
          retentionTime: 300000,
        }),
      });
    });

    it('should install with custom config', () => {
      context.config = {
        collectRequestMetrics: false,
        retentionTime: 600000,
      };

      plugin.install(context);

      expect(mockLogger.info).toHaveBeenCalledWith('Metrics plugin installed', {
        config: expect.objectContaining({
          collectRequestMetrics: false,
          collectWebSocketMetrics: true, // default
          retentionTime: 600000,
        }),
      });
    });

    it('should uninstall properly', () => {
      plugin.install(context);
      plugin.uninstall();

      const metrics = plugin.getAllMetrics();
      expect(metrics.requests).toHaveLength(0);
      expect(metrics.webSocket).toHaveLength(0);
    });
  });

  describe('request metrics collection', () => {
    beforeEach(() => {
      plugin.install(context);
    });

    it('should collect request metrics when enabled', async () => {
      const config: RequestConfig = {
        method: 'POST',
        url: '/api/test',
      };

      await plugin.onRequest!(config);

      // Simulate response after some time
      jest.advanceTimersByTime(100);

      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        data: { result: 'success' },
        headers: {},
      };

      await plugin.onResponse!(response);

      const metrics = plugin.getRequestMetrics();
      expect(metrics.total).toBe(1);
      expect(metrics.successful).toBe(1);
      expect(metrics.failed).toBe(0);
      expect(metrics.averageDuration).toBeGreaterThan(0);
      expect(metrics.statusCodes[200]).toBe(1);
    });

    it('should not collect metrics when disabled', async () => {
      context.config = { collectRequestMetrics: false };
      plugin.install(context);

      const config: RequestConfig = {
        method: 'GET',
        url: '/test',
      };

      await plugin.onRequest!(config);

      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        data: {},
        headers: {},
      };

      await plugin.onResponse!(response);

      const metrics = plugin.getRequestMetrics();
      expect(metrics.total).toBe(0);
    });

    it('should collect error metrics', async () => {
      const config: RequestConfig = {
        method: 'GET',
        url: '/test',
      };

      await plugin.onRequest!(config);

      jest.advanceTimersByTime(50);

      const error = new Error('Network error');
      await plugin.onError!(error);

      const metrics = plugin.getRequestMetrics();
      expect(metrics.total).toBe(1);
      expect(metrics.successful).toBe(0);
      expect(metrics.failed).toBe(1);
      expect(metrics.averageDuration).toBeGreaterThan(0);
    });

    it('should track different status codes', async () => {
      // Request 1: Success
      await plugin.onRequest!({ method: 'GET', url: '/test1' });
      jest.advanceTimersByTime(10);
      await plugin.onResponse!({ status: 200, statusText: 'OK', data: {}, headers: {} });

      // Request 2: Client error
      await plugin.onRequest!({ method: 'GET', url: '/test2' });
      jest.advanceTimersByTime(10);
      await plugin.onResponse!({ status: 404, statusText: 'Not Found', data: {}, headers: {} });

      // Request 3: Server error
      await plugin.onRequest!({ method: 'GET', url: '/test3' });
      jest.advanceTimersByTime(10);
      await plugin.onResponse!({
        status: 500,
        statusText: 'Internal Server Error',
        data: {},
        headers: {},
      });

      const metrics = plugin.getRequestMetrics();
      expect(metrics.total).toBe(3);
      expect(metrics.successful).toBe(1); // Only 200
      expect(metrics.failed).toBe(2); // 404 and 500
      expect(metrics.statusCodes[200]).toBe(1);
      expect(metrics.statusCodes[404]).toBe(1);
      expect(metrics.statusCodes[500]).toBe(1);
    });
  });

  describe('WebSocket metrics collection', () => {
    beforeEach(() => {
      plugin.install(context);
    });

    it('should collect WebSocket metrics when enabled', async () => {
      await plugin.onWebSocketConnect!();

      const message: Message = {
        id: 'test-id',
        typ: 1,
        dat: { test: 'data' },
      };

      await plugin.onWebSocketMessage!(message);

      await plugin.onWebSocketDisconnect!({ code: 1000, reason: 'Normal closure' });

      const metrics = plugin.getWebSocketMetrics();
      expect(metrics.connections).toBe(1);
      expect(metrics.disconnections).toBe(1);
      expect(metrics.messages).toBe(1);
      expect(metrics.messageTypes[1]).toBe(1);
    });

    it('should not collect WebSocket metrics when disabled', async () => {
      context.config = { collectWebSocketMetrics: false };
      plugin.install(context);

      await plugin.onWebSocketConnect!();

      const message: Message = {
        id: 'test-id',
        typ: 1,
        dat: { test: 'data' },
      };

      await plugin.onWebSocketMessage!(message);

      const metrics = plugin.getWebSocketMetrics();
      expect(metrics.connections).toBe(0);
      expect(metrics.messages).toBe(0);
    });

    it('should track different message types', async () => {
      const message1: Message = { id: '1', typ: 1, dat: {} };
      const message2: Message = { id: '2', typ: 2, dat: {} };
      const message3: Message = { id: '3', typ: 1, dat: {} };

      await plugin.onWebSocketMessage!(message1);
      await plugin.onWebSocketMessage!(message2);
      await plugin.onWebSocketMessage!(message3);

      const metrics = plugin.getWebSocketMetrics();
      expect(metrics.messages).toBe(3);
      expect(metrics.messageTypes[1]).toBe(2);
      expect(metrics.messageTypes[2]).toBe(1);
    });
  });

  describe('metrics cleanup', () => {
    beforeEach(() => {
      plugin.install(context);
    });

    it('should clean up old metrics automatically', () => {
      // Set a short retention time for testing
      context.config = { retentionTime: 1000 }; // 1 second
      plugin.install(context);

      // Add some metrics (simulate complete request cycle)
      plugin.onRequest!({ method: 'GET', url: '/test' });
      plugin.onResponse!({ status: 200, statusText: 'OK', data: {}, headers: {} });
      plugin.onWebSocketConnect!();

      expect(plugin.getAllMetrics().requests.length).toBeGreaterThan(0);
      expect(plugin.getAllMetrics().webSocket.length).toBeGreaterThan(0);

      // Advance time beyond retention period
      jest.advanceTimersByTime(2000);

      // Trigger cleanup (normally happens every minute)
      jest.advanceTimersByTime(60000);

      // Metrics should be cleaned up
      const metrics = plugin.getAllMetrics();
      expect(metrics.requests).toHaveLength(0);
      expect(metrics.webSocket).toHaveLength(0);
    });

    it('should clear all metrics manually', () => {
      // Add some metrics (simulate complete request cycle)
      plugin.onRequest!({ method: 'GET', url: '/test' });
      plugin.onResponse!({ status: 200, statusText: 'OK', data: {}, headers: {} });
      plugin.onWebSocketConnect!();

      expect(plugin.getAllMetrics().requests.length).toBeGreaterThan(0);
      expect(plugin.getAllMetrics().webSocket.length).toBeGreaterThan(0);

      plugin.clearMetrics();

      const metrics = plugin.getAllMetrics();
      expect(metrics.requests).toHaveLength(0);
      expect(metrics.webSocket).toHaveLength(0);
    });
  });

  describe('metrics aggregation', () => {
    beforeEach(() => {
      plugin.install(context);
    });

    it('should calculate correct average duration', async () => {
      // Mock different request durations
      const durations = [100, 200, 300, 400, 500];

      for (const duration of durations) {
        await plugin.onRequest!({ method: 'GET', url: '/test' });
        jest.advanceTimersByTime(duration);
        await plugin.onResponse!({ status: 200, statusText: 'OK', data: {}, headers: {} });
      }

      const metrics = plugin.getRequestMetrics();
      const expectedAverage = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      expect(metrics.averageDuration).toBeCloseTo(expectedAverage, 0);
    });

    it('should return zero average for no metrics', () => {
      const metrics = plugin.getRequestMetrics();
      expect(metrics.averageDuration).toBe(0);
    });

    it('should provide comprehensive metrics summary', async () => {
      // Add various metrics
      await plugin.onRequest!({ method: 'GET', url: '/test1' });
      jest.advanceTimersByTime(100);
      await plugin.onResponse!({ status: 200, statusText: 'OK', data: {}, headers: {} });

      await plugin.onRequest!({ method: 'POST', url: '/test2' });
      jest.advanceTimersByTime(150);
      await plugin.onError!(new Error('Test error'));

      await plugin.onWebSocketConnect!();
      await plugin.onWebSocketMessage!({ id: '1', typ: 1, dat: {} });
      await plugin.onWebSocketDisconnect!({ code: 1000, reason: 'Normal' });

      const allMetrics = plugin.getAllMetrics();

      expect(allMetrics.requests).toHaveLength(2);
      expect(allMetrics.webSocket).toHaveLength(3); // connect + message + disconnect
      expect(allMetrics.summary.requests.total).toBe(2);
      expect(allMetrics.summary.requests.successful).toBe(1);
      expect(allMetrics.summary.requests.failed).toBe(1);
      expect(allMetrics.summary.webSocket.connections).toBe(1);
      expect(allMetrics.summary.webSocket.messages).toBe(1);
      expect(allMetrics.summary.webSocket.disconnections).toBe(1);
    });
  });
});
