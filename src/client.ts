import { HTTPClient } from './http/client';
import { AuthenticationManager, IAuthService } from './services/auth';
import { BlobService, IBlobService } from './services/blob';
import { WebSocketService, IWebSocketService, WebSocketConfig } from './services/websocket';
import { RPCService, IRPCService } from './services/rpc';
import { ACLService, IACLService } from './services/acl';
import { DatasiteService, IDatasiteService, DatasiteServiceConfig } from './services/datasite';
import { PluginManager } from './plugins/manager';
import { ITokenStorage } from './utils/storage';
import { SyftBoxError, SyftBoxErrorCode } from './errors';
import { RequestConfig } from './http/types';

export interface SyftBoxClientConfig {
  serverUrl: string;
  auth?: {
    tokenStorage?: ITokenStorage;
    autoRefresh?: boolean;
  };
  http?: {
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
    headers?: Record<string, string>;
  };
  websocket?: WebSocketConfig;
  logging?: {
    enabled?: boolean;
    level?: 'debug' | 'info' | 'warn' | 'error';
  };
  proxy?: {
    baseUrl?: string; // Base URL like 'http://localhost:8000' or 'https://myserver.com:8443'
  };
  datasite?: DatasiteServiceConfig;
}

export class SyftBoxClient {
  private readonly httpClient: HTTPClient;
  private readonly authService: IAuthService;
  private readonly blobService: IBlobService;
  private readonly websocketService: IWebSocketService;
  private readonly rpcService: IRPCService;
  private readonly aclService: IACLService;
  private readonly datasiteService: IDatasiteService;
  private readonly pluginManager: PluginManager;

  constructor(config: SyftBoxClientConfig) {
    this.validateConfig(config);

    // Initialize logger
    const logger = {
      debug: config.logging?.enabled ? console.debug : () => {},
      info: config.logging?.enabled ? console.info : () => {},
      warn: config.logging?.enabled ? console.warn : () => {},
      error: config.logging?.enabled ? console.error : () => {},
    };

    // Initialize HTTP client with interceptors
    this.httpClient = new HTTPClient({
      baseURL: config.serverUrl,
      timeout: config.http?.timeout ?? 30000,
      retryAttempts: config.http?.retryAttempts ?? 3,
      retryDelay: config.http?.retryDelay ?? 1000,
      headers: config.http?.headers ?? {},
    });

    // Initialize authentication service
    this.authService = new AuthenticationManager(this.httpClient);

    // Initialize plugin manager
    this.pluginManager = new PluginManager(logger, {
      http: this.httpClient,
    });

    // Initialize blob service
    const baseUrl = config.proxy?.baseUrl || 'http://localhost:8000';
    const proxyUrl = `${baseUrl}/proxy-download`;
    this.blobService = new BlobService(this.httpClient, proxyUrl);

    // Initialize WebSocket service
    const wsConfig: WebSocketConfig = {
      url: config.websocket?.url || config.serverUrl.replace(/^http/, 'ws') + '/ws',
      ...config.websocket,
    };
    this.websocketService = new WebSocketService(wsConfig, this.authService);

    // Initialize RPC service
    this.rpcService = new RPCService(this.httpClient);

    // Initialize ACL service
    this.aclService = new ACLService(this.httpClient);

    // Initialize Datasite service with caching configuration
    this.datasiteService = new DatasiteService(this.httpClient, config.datasite);

    // Set up interceptors
    this.setupInterceptors(config);
  }

  /**
   * Authentication service
   */
  get auth(): IAuthService {
    return this.authService;
  }

  /**
   * Blob storage service
   */
  get blob(): IBlobService {
    return this.blobService;
  }

  /**
   * WebSocket service
   */
  get websocket(): IWebSocketService {
    return this.websocketService;
  }

  /**
   * RPC service
   */
  get rpc(): IRPCService {
    return this.rpcService;
  }

  /**
   * ACL service
   */
  get acl(): IACLService {
    return this.aclService;
  }

  /**
   * Datasite service
   */
  get datasite(): IDatasiteService {
    return this.datasiteService;
  }

  /**
   * Plugin manager
   */
  get plugins(): PluginManager {
    return this.pluginManager;
  }

  /**
   * Check if client is ready (authenticated)
   */
  isReady(): boolean {
    return this.authService.isAuthenticated();
  }

  /**
   * Get current user
   */
  getCurrentUser(): string | null {
    return this.authService.getCurrentUser();
  }

  /**
   * Perform a custom HTTP request with authentication
   */
  async request<T = unknown>(config: RequestConfig): Promise<T> {
    return this.httpClient.request<T>(config);
  }

  private validateConfig(config: SyftBoxClientConfig): void {
    if (!config.serverUrl) {
      throw new SyftBoxError(SyftBoxErrorCode.INVALID_CONFIGURATION, 'Server URL is required');
    }

    try {
      new URL(config.serverUrl);
    } catch {
      throw new SyftBoxError(SyftBoxErrorCode.INVALID_CONFIGURATION, 'Invalid server URL format', {
        serverUrl: config.serverUrl,
      });
    }

    if (config.http?.timeout && config.http.timeout <= 0) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_CONFIGURATION,
        'HTTP timeout must be positive',
        { timeout: config.http.timeout },
      );
    }

    if (config.http?.retryAttempts && config.http.retryAttempts < 0) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_CONFIGURATION,
        'Retry attempts cannot be negative',
        { retryAttempts: config.http.retryAttempts },
      );
    }
  }

  private setupInterceptors(config: SyftBoxClientConfig): void {
    // Request interceptor to add authentication
    this.httpClient.addRequestInterceptor(async requestConfig => {
      // Skip auth for auth endpoints
      if (this.isAuthEndpoint(requestConfig.url)) {
        return requestConfig;
      }

      // Add authentication header if user is authenticated
      if (this.authService.isAuthenticated()) {
        try {
          const token = await this.authService.ensureValidToken();
          return {
            ...requestConfig,
            headers: {
              ...requestConfig.headers,
              Authorization: `Bearer ${token}`,
            },
          };
        } catch (error) {
          // If we can't get a valid token, proceed without auth
          // The server will return 401 if auth is required
          if (config.logging?.enabled) {
            console.warn('Failed to add authentication to request:', error);
          }
        }
      }

      return requestConfig;
    });

    // Response interceptor for automatic token refresh
    this.httpClient.addResponseInterceptor(async response => {
      return response;
    });

    // Error interceptor for handling auth errors
    this.httpClient.addErrorInterceptor(async error => {
      if (error instanceof SyftBoxError) {
        // Handle token expiration
        if (error.code === SyftBoxErrorCode.AUTHENTICATION_FAILED) {
          // Clear invalid tokens
          await this.authService.logout();
        }
      }

      return error;
    });

    // Logging interceptors if enabled
    if (config.logging?.enabled) {
      this.setupLoggingInterceptors(config.logging.level ?? 'info');
    }
  }

  private isAuthEndpoint(url: string): boolean {
    const authEndpoints = ['/auth/otp/request', '/auth/otp/verify', '/auth/refresh'];
    return authEndpoints.some(endpoint => url.includes(endpoint));
  }

  private setupLoggingInterceptors(level: string): void {
    const shouldLog = (targetLevel: string): boolean => {
      const levels = ['debug', 'info', 'warn', 'error'];
      const currentIndex = levels.indexOf(level);
      const targetIndex = levels.indexOf(targetLevel);
      return targetIndex >= currentIndex;
    };

    if (shouldLog('debug')) {
      this.httpClient.addRequestInterceptor(async config => {
        console.debug('[SyftBox] Request:', {
          method: config.method,
          url: config.url,
          headers: this.sanitizeHeaders(config.headers),
        });
        return config;
      });

      this.httpClient.addResponseInterceptor(async response => {
        console.debug('[SyftBox] Response:', {
          status: response.status,
          statusText: response.statusText,
          headers: this.sanitizeHeaders(response.headers),
        });
        return response;
      });
    }

    if (shouldLog('error')) {
      this.httpClient.addErrorInterceptor(async error => {
        if (error instanceof SyftBoxError) {
          console.error('[SyftBox] Error:', {
            code: error.code,
            message: error.message,
            details: error.details,
          });
        } else {
          console.error('[SyftBox] Unexpected error:', error);
        }
        return error;
      });
    }
  }

  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
    if (!headers) return {};

    const sanitized = { ...headers };

    // Remove sensitive headers from logs
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    sensitiveHeaders.forEach(header => {
      Object.keys(sanitized).forEach(key => {
        if (key.toLowerCase() === header) {
          sanitized[key] = '[REDACTED]';
        }
      });
    });

    return sanitized;
  }

  /**
   * Clean up resources and stop background processes
   */
  destroy(): void {
    // Clean up datasite service (stop auto-refresh interval)
    this.datasiteService.destroy();
    
    // Disconnect WebSocket if connected
    if (this.websocketService.isConnected()) {
      this.websocketService.disconnect();
    }
  }
}

/**
 * Factory function to create a SyftBox client with sensible defaults
 */
export function createSyftBoxClient(config: SyftBoxClientConfig): SyftBoxClient {
  return new SyftBoxClient(config);
}
