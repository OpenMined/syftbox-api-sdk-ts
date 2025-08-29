import { SyftBoxPlugin, SyftBoxPluginContext } from '../types';
import { RequestConfig, ResponseData } from '../../http/types';
import { Message } from '../../types';

export interface MetricsPluginConfig {
  collectRequestMetrics?: boolean;
  collectWebSocketMetrics?: boolean;
  retentionTime?: number; // in milliseconds
}

interface RequestMetric {
  timestamp: number;
  method: string;
  url: string;
  duration?: number;
  status?: number;
  error?: string;
}

interface WebSocketMetric {
  timestamp: number;
  event: 'connect' | 'disconnect' | 'message';
  messageType?: number;
  error?: string;
}

/**
 * Built-in metrics collection plugin
 */
export class MetricsPlugin implements SyftBoxPlugin {
  readonly name = 'metrics';
  readonly version = '1.0.0';
  readonly description = 'Collects performance and usage metrics';

  private config: Required<MetricsPluginConfig> = {
    collectRequestMetrics: true,
    collectWebSocketMetrics: true,
    retentionTime: 300000, // 5 minutes
  };

  private requestMetrics: RequestMetric[] = [];
  private webSocketMetrics: WebSocketMetric[] = [];
  private requestStartTimes = new Map<string, number>();
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  private logger!: any;

  install(context: SyftBoxPluginContext): void {
    this.config = { ...this.config, ...(context.config as MetricsPluginConfig) };
    this.logger = context.logger;

    // Start cleanup interval
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupOldMetrics();
    }, 60000); // Cleanup every minute

    this.logger.info('Metrics plugin installed', { config: this.config });
  }

  uninstall(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    this.requestMetrics = [];
    this.webSocketMetrics = [];
    this.requestStartTimes.clear();
  }

  async onRequest(config: RequestConfig): Promise<RequestConfig> {
    if (!this.config.collectRequestMetrics) {
      return config;
    }

    const requestKey = this.generateRequestKey(config);
    this.requestStartTimes.set(requestKey, Date.now());

    return config;
  }

  async onResponse(response: ResponseData): Promise<ResponseData> {
    if (!this.config.collectRequestMetrics) {
      return response;
    }

    // We can't easily correlate response to request without more context
    // This is a limitation of the current plugin architecture
    const now = Date.now();

    // Find the most recent request start time (approximation)
    const possibleStartTimes = Array.from(this.requestStartTimes.values());
    const mostRecentStart = Math.max(...possibleStartTimes);

    if (mostRecentStart) {
      const metric: RequestMetric = {
        timestamp: mostRecentStart,
        method: 'UNKNOWN', // We don't have access to the original request here
        url: 'UNKNOWN',
        duration: now - mostRecentStart,
        status: response.status,
      };

      this.requestMetrics.push(metric);
    }

    return response;
  }

  async onError(error: Error): Promise<Error> {
    if (!this.config.collectRequestMetrics) {
      return error;
    }

    const now = Date.now();
    const possibleStartTimes = Array.from(this.requestStartTimes.values());
    const mostRecentStart = Math.max(...possibleStartTimes);

    if (mostRecentStart) {
      const metric: RequestMetric = {
        timestamp: mostRecentStart,
        method: 'UNKNOWN',
        url: 'UNKNOWN',
        duration: now - mostRecentStart,
        error: error.message,
      };

      this.requestMetrics.push(metric);
    }

    return error;
  }

  async onWebSocketMessage(message: Message): Promise<Message> {
    if (!this.config.collectWebSocketMetrics) {
      return message;
    }

    const metric: WebSocketMetric = {
      timestamp: Date.now(),
      event: 'message',
      messageType: message.typ,
    };

    this.webSocketMetrics.push(metric);
    return message;
  }

  async onWebSocketConnect(): Promise<void> {
    if (!this.config.collectWebSocketMetrics) {
      return;
    }

    const metric: WebSocketMetric = {
      timestamp: Date.now(),
      event: 'connect',
    };

    this.webSocketMetrics.push(metric);
  }

  async onWebSocketDisconnect(event: { code: number; reason: string }): Promise<void> {
    if (!this.config.collectWebSocketMetrics) {
      return;
    }

    const metric: WebSocketMetric = {
      timestamp: Date.now(),
      event: 'disconnect',
      error: event.code !== 1000 ? `${event.code}: ${event.reason}` : undefined,
    };

    this.webSocketMetrics.push(metric);
  }

  /**
   * Get request metrics summary
   */
  getRequestMetrics(): {
    total: number;
    successful: number;
    failed: number;
    averageDuration: number;
    statusCodes: Record<number, number>;
  } {
    const total = this.requestMetrics.length;
    const successful = this.requestMetrics.filter(
      m => m.status && m.status >= 200 && m.status < 400,
    ).length;
    const failed = this.requestMetrics.filter(m => m.error || (m.status && m.status >= 400)).length;

    const durations = this.requestMetrics.filter(m => m.duration).map(m => m.duration!);
    const averageDuration =
      durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

    const statusCodes: Record<number, number> = {};
    this.requestMetrics.forEach(m => {
      if (m.status) {
        statusCodes[m.status] = (statusCodes[m.status] || 0) + 1;
      }
    });

    return {
      total,
      successful,
      failed,
      averageDuration,
      statusCodes,
    };
  }

  /**
   * Get WebSocket metrics summary
   */
  getWebSocketMetrics(): {
    connections: number;
    disconnections: number;
    messages: number;
    messageTypes: Record<number, number>;
  } {
    const connections = this.webSocketMetrics.filter(m => m.event === 'connect').length;
    const disconnections = this.webSocketMetrics.filter(m => m.event === 'disconnect').length;
    const messages = this.webSocketMetrics.filter(m => m.event === 'message').length;

    const messageTypes: Record<number, number> = {};
    this.webSocketMetrics
      .filter(m => m.event === 'message' && m.messageType !== undefined)
      .forEach(m => {
        const type = m.messageType!;
        messageTypes[type] = (messageTypes[type] || 0) + 1;
      });

    return {
      connections,
      disconnections,
      messages,
      messageTypes,
    };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): {
    requests: RequestMetric[];
    webSocket: WebSocketMetric[];
    summary: {
      requests: ReturnType<MetricsPlugin['getRequestMetrics']>;
      webSocket: ReturnType<MetricsPlugin['getWebSocketMetrics']>;
    };
  } {
    return {
      requests: [...this.requestMetrics],
      webSocket: [...this.webSocketMetrics],
      summary: {
        requests: this.getRequestMetrics(),
        webSocket: this.getWebSocketMetrics(),
      },
    };
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.requestMetrics = [];
    this.webSocketMetrics = [];
    this.requestStartTimes.clear();
  }

  private generateRequestKey(config: RequestConfig): string {
    return `${config.method}:${config.url}:${Date.now()}`;
  }

  private cleanupOldMetrics(): void {
    const cutoffTime = Date.now() - this.config.retentionTime;

    this.requestMetrics = this.requestMetrics.filter(m => m.timestamp > cutoffTime);
    this.webSocketMetrics = this.webSocketMetrics.filter(m => m.timestamp > cutoffTime);

    // Clean up old request start times
    for (const [key, timestamp] of this.requestStartTimes.entries()) {
      if (timestamp < cutoffTime) {
        this.requestStartTimes.delete(key);
      }
    }
  }
}
