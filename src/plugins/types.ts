import { RequestConfig, ResponseData } from '../http/types';
import { Message } from '../types';

/**
 * Plugin lifecycle hooks
 */
export interface SyftBoxPlugin {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;

  // Lifecycle methods
  install?(client: SyftBoxPluginContext): void | Promise<void>;
  uninstall?(client: SyftBoxPluginContext): void | Promise<void>;

  // Hook methods
  onRequest?(config: RequestConfig): RequestConfig | Promise<RequestConfig>;
  onResponse?(response: ResponseData): ResponseData | Promise<ResponseData>;
  onError?(error: Error): Error | Promise<Error>;
  onWebSocketMessage?(message: Message): Message | Promise<Message>;
  onWebSocketConnect?(): void | Promise<void>;
  onWebSocketDisconnect?(event: { code: number; reason: string }): void | Promise<void>;
}

/**
 * Context provided to plugins
 */
export interface SyftBoxPluginContext {
  // Core services access
  readonly auth: {
    isAuthenticated(): boolean;
    getCurrentUser(): string | null;
  };

  readonly http: {
    request<T>(config: RequestConfig): Promise<T>;
  };

  // Plugin utilities
  readonly logger: PluginLogger;
  readonly storage: PluginStorage;
  readonly events: PluginEventEmitter;

  // Configuration
  readonly config: Record<string, unknown>;
}

/**
 * Plugin-specific logger
 */
export interface PluginLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Plugin-specific storage
 */
export interface PluginStorage {
  get<T = unknown>(key: string): T | null;
  set<T = unknown>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
  keys(): string[];
}

/**
 * Plugin event system
 */
export interface PluginEventEmitter {
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

/**
 * Middleware function type
 */
export type Middleware<T = unknown, U = T> = (
  input: T,
  next: (input: T) => Promise<U>,
) => Promise<U>;

/**
 * Plugin registry entry
 */
export interface PluginRegistryEntry {
  plugin: SyftBoxPlugin;
  context: SyftBoxPluginContext;
  installed: boolean;
  installDate?: Date;
  error?: Error;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  enabled?: boolean;
  config?: Record<string, unknown>;
}
