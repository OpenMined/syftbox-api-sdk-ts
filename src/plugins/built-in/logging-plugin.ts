import { SyftBoxPlugin, SyftBoxPluginContext } from '../types';
import { RequestConfig, ResponseData } from '../../http/types';
import { Message } from '../../types';

export interface LoggingPluginConfig {
  logRequests?: boolean;
  logResponses?: boolean;
  logWebSocketMessages?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  sanitizeHeaders?: boolean;
}

/**
 * Built-in logging plugin for debugging and monitoring
 */
export class LoggingPlugin implements SyftBoxPlugin {
  readonly name = 'logging';
  readonly version = '1.0.0';
  readonly description = 'Logs HTTP requests, responses, and WebSocket messages';

  private config: Required<LoggingPluginConfig> = {
    logRequests: true,
    logResponses: true,
    logWebSocketMessages: true,
    logLevel: 'info',
    sanitizeHeaders: true,
  };

  private logger!: any;

  install(context: SyftBoxPluginContext): void {
    this.config = { ...this.config, ...(context.config as LoggingPluginConfig) };
    this.logger = context.logger;

    this.logger.info('Logging plugin installed', { config: this.config });
  }

  async onRequest(config: RequestConfig): Promise<RequestConfig> {
    if (!this.config.logRequests) {
      return config;
    }

    const logData = {
      method: config.method,
      url: config.url,
      headers: this.config.sanitizeHeaders ? this.sanitizeHeaders(config.headers) : config.headers,
      hasData: !!config.data,
    };

    this.logByLevel('Request', logData);
    return config;
  }

  async onResponse(response: ResponseData): Promise<ResponseData> {
    if (!this.config.logResponses) {
      return response;
    }

    const logData = {
      status: response.status,
      statusText: response.statusText,
      headers: this.config.sanitizeHeaders
        ? this.sanitizeHeaders(response.headers)
        : response.headers,
      hasData: !!response.data,
    };

    this.logByLevel('Response', logData);
    return response;
  }

  async onError(error: Error): Promise<Error> {
    this.logger.error('HTTP Error', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    return error;
  }

  async onWebSocketMessage(message: Message): Promise<Message> {
    if (!this.config.logWebSocketMessages) {
      return message;
    }

    this.logByLevel('WebSocket Message', {
      id: message.id,
      type: message.typ,
      hasData: !!message.dat,
    });

    return message;
  }

  async onWebSocketConnect(): Promise<void> {
    this.logger.info('WebSocket Connected');
  }

  async onWebSocketDisconnect(event: { code: number; reason: string }): Promise<void> {
    this.logger.warn('WebSocket Disconnected', event);
  }

  private logByLevel(title: string, data: unknown): void {
    switch (this.config.logLevel) {
      case 'debug':
        this.logger.debug(title, data);
        break;
      case 'info':
        this.logger.info(title, data);
        break;
      case 'warn':
        this.logger.warn(title, data);
        break;
      case 'error':
        this.logger.error(title, data);
        break;
    }
  }

  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {};

    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];

    sensitiveHeaders.forEach(header => {
      Object.keys(sanitized).forEach(key => {
        if (key.toLowerCase() === header) {
          sanitized[key] = '[REDACTED]';
        }
      });
    });

    return sanitized;
  }
}
