import {
  SyftBoxPlugin,
  SyftBoxPluginContext,
  PluginRegistryEntry,
  PluginConfig,
  PluginLogger,
  PluginStorage,
  PluginEventEmitter,
} from './types';
import { RequestConfig, ResponseData } from '../http/types';
import { Message } from '../types';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';

/**
 * Plugin manager handles plugin lifecycle and coordination
 */
export class PluginManager {
  private readonly registry = new Map<string, PluginRegistryEntry>();
  private readonly eventEmitter = new SimpleEventEmitter();
  private readonly globalStorage = new Map<string, unknown>();

  constructor(
    private readonly logger?: {
      debug: (message: string, ...args: unknown[]) => void;
      info: (message: string, ...args: unknown[]) => void;
      warn: (message: string, ...args: unknown[]) => void;
      error: (message: string, ...args: unknown[]) => void;
    },
    private readonly clientContext?: {
      auth?: { isAuthenticated(): boolean; getCurrentUser(): string | null };
      http?: { request<T>(config: RequestConfig): Promise<T> };
    },
  ) {}

  /**
   * Install a plugin
   */
  async installPlugin(plugin: SyftBoxPlugin, config?: PluginConfig): Promise<void> {
    if (this.registry.has(plugin.name)) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_CONFIGURATION,
        `Plugin '${plugin.name}' is already installed`,
      );
    }

    const pluginContext = this.createPluginContext(plugin, config?.config || {});
    const entry: PluginRegistryEntry = {
      plugin,
      context: pluginContext,
      installed: false,
    };

    const success = await this.executeInstallation(entry, false);
    if (!success) {
      const errorMessage = entry.error ? `: ${entry.error.message}` : '';
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_CONFIGURATION,
        `Failed to install plugin '${plugin.name}'${errorMessage}`,
        { pluginName: plugin.name },
        entry.error,
      );
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginName: string): Promise<void> {
    const entry = this.registry.get(pluginName);
    if (!entry) {
      throw new SyftBoxError(SyftBoxErrorCode.NOT_FOUND, `Plugin '${pluginName}' is not installed`);
    }

    const success = await this.executeUninstallation(
      entry,
      pluginName,
      false,
    );
    if (!success) {
      const errorMessage = entry.error ? `: ${entry.error.message}` : '';
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_CONFIGURATION,
        `Failed to uninstall plugin '${pluginName}'${errorMessage}`,
        { pluginName },
        entry.error,
      );
    }
  }

  /**
   * Get installed plugins
   */
  getInstalledPlugins(): Array<{
    name: string;
    version?: string;
    installed: boolean;
    installDate?: Date;
  }> {
    return Array.from(this.registry.values()).map(entry => ({
      name: entry.plugin.name,
      version: entry.plugin.version,
      installed: entry.installed,
      installDate: entry.installDate,
    }));
  }

  /**
   * Check if plugin is installed
   */
  isPluginInstalled(pluginName: string): boolean {
    const entry = this.registry.get(pluginName);
    return entry?.installed || false;
  }

  /**
   * Check if plugin is installed (for test compatibility)
   */
  isInstalled(pluginName: string): boolean {
    return this.isPluginInstalled(pluginName);
  }

  /**
   * Get plugin information (for test compatibility)
   */
  getPluginInfo(
    pluginName: string,
  ): { name: string; version?: string; description?: string } | undefined {
    const entry = this.registry.get(pluginName);
    if (!entry?.installed) {
      return undefined;
    }

    return {
      name: entry.plugin.name,
      version: entry.plugin.version,
      description: entry.plugin.description,
    };
  }

  /**
   * Execute request hooks
   */
  async executeRequestHooks(config: RequestConfig): Promise<RequestConfig> {
    let currentConfig = config;

    for (const entry of this.registry.values()) {
      if (entry.installed && entry.plugin.onRequest) {
        try {
          currentConfig = await entry.plugin.onRequest(currentConfig);
        } catch (error) {
          this.logger?.error(
            `Plugin '${entry.plugin.name}' request hook failed: ${(error as Error).message}`,
          );
        }
      }
    }

    return currentConfig;
  }

  /**
   * Execute response hooks
   */
  async executeResponseHooks(response: ResponseData): Promise<ResponseData> {
    let currentResponse = response;

    for (const entry of this.registry.values()) {
      if (entry.installed && entry.plugin.onResponse) {
        try {
          currentResponse = await entry.plugin.onResponse(currentResponse);
        } catch (error) {
          this.logger?.error(
            `Plugin '${entry.plugin.name}' response hook failed: ${(error as Error).message}`,
          );
        }
      }
    }

    return currentResponse;
  }

  /**
   * Execute error hooks
   */
  async executeErrorHooks(error: Error): Promise<Error> {
    let currentError = error;

    for (const entry of this.registry.values()) {
      if (entry.installed && entry.plugin.onError) {
        try {
          currentError = await entry.plugin.onError(currentError);
        } catch (hookError) {
          this.logger?.error(
            `Plugin '${entry.plugin.name}' error hook failed: ${(hookError as Error).message}`,
          );
        }
      }
    }

    return currentError;
  }

  /**
   * Execute WebSocket message hooks
   */
  async executeWebSocketMessageHooks(message: Message): Promise<Message> {
    let currentMessage = message;

    for (const entry of this.registry.values()) {
      if (entry.installed && entry.plugin.onWebSocketMessage) {
        try {
          currentMessage = await entry.plugin.onWebSocketMessage(currentMessage);
        } catch (error) {
          this.logger?.error(
            `Plugin '${entry.plugin.name}' WebSocket message hook failed: ${(error as Error).message}`,
          );
        }
      }
    }

    return currentMessage;
  }

  /**
   * Execute WebSocket connect hooks
   */
  async executeWebSocketConnectHooks(): Promise<void> {
    for (const entry of this.registry.values()) {
      if (entry.installed && entry.plugin.onWebSocketConnect) {
        try {
          await entry.plugin.onWebSocketConnect();
        } catch (error) {
          this.logger?.error(
            `Plugin '${entry.plugin.name}' WebSocket connect hook failed: ${(error as Error).message}`,
          );
        }
      }
    }
  }

  /**
   * Execute WebSocket disconnect hooks
   */
  async executeWebSocketDisconnectHooks(event: { code: number; reason: string }): Promise<void> {
    for (const entry of this.registry.values()) {
      if (entry.installed && entry.plugin.onWebSocketDisconnect) {
        try {
          await entry.plugin.onWebSocketDisconnect(event);
        } catch (error) {
          this.logger?.error(
            `Plugin '${entry.plugin.name}' WebSocket disconnect hook failed: ${(error as Error).message}`,
          );
        }
      }
    }
  }

  /**
   * Install a plugin synchronously (for test compatibility)
   */
  install(plugin: SyftBoxPlugin, config?: PluginConfig | Record<string, unknown>): boolean {
    if (this.registry.has(plugin.name)) {
      this.logger?.error(`Plugin '${plugin.name}' is already installed`);
      return false;
    }

    // Handle both plain config objects and wrapped PluginConfig format
    const configObject = config && 'config' in config ? config.config : config || {};
    const pluginContext = this.createPluginContext(plugin, configObject as Record<string, unknown>);
    const entry: PluginRegistryEntry = {
      plugin,
      context: pluginContext,
      installed: false,
    };

    return this.executeInstallation(entry, true) as boolean;
  }

  /**
   * Uninstall a plugin synchronously (for test compatibility)
   */
  uninstall(pluginName: string): boolean {
    const entry = this.registry.get(pluginName);
    if (!entry) {
      return false;
    }

    return this.executeUninstallation(entry, pluginName, true) as boolean;
  }

  /**
   * Uninstall all plugins (for test compatibility)
   */
  uninstallAll(): void {
    const pluginNames = Array.from(this.registry.keys());
    pluginNames.forEach(pluginName => {
      this.uninstall(pluginName);
    });
  }

  /**
   * Get plugin by name
   */
  getPlugin(pluginName: string): SyftBoxPlugin | null {
    const entry = this.registry.get(pluginName);
    return entry?.plugin || null;
  }

  /**
   * Cleanup all plugins
   */
  async cleanup(): Promise<void> {
    const uninstallPromises = Array.from(this.registry.keys()).map(pluginName =>
      this.uninstallPlugin(pluginName).catch(error => {
        console.warn(`Failed to uninstall plugin '${pluginName}' during cleanup:`, error);
      }),
    );

    await Promise.all(uninstallPromises);
    this.globalStorage.clear();
  }

  /**
   * Execute plugin installation with common logic for sync/async
   */
  private executeInstallation(
    entry: PluginRegistryEntry,
    isSync: boolean,
  ): boolean | Promise<boolean> {
    if (isSync) {
      try {
        // Install the plugin synchronously
        if (entry.plugin.install) {
          // For sync compatibility, we assume install is sync if called via this method
          (entry.plugin.install as any)(entry.context);
        }

        entry.installed = true;
        entry.installDate = new Date();
        this.registry.set(entry.plugin.name, entry);

        this.eventEmitter.emit('plugin:installed', entry.plugin.name);
        return true;
      } catch (error) {
        entry.error = error as Error;
        this.registry.set(entry.plugin.name, entry);
        this.logger?.error(
          `Failed to install plugin '${entry.plugin.name}': ${(error as Error).message}`,
        );
        return false;
      }
    } else {
      return this.executeInstallationAsync(entry);
    }
  }

  private async executeInstallationAsync(entry: PluginRegistryEntry): Promise<boolean> {
    try {
      // Install the plugin asynchronously
      if (entry.plugin.install) {
        await entry.plugin.install(entry.context);
      }

      entry.installed = true;
      entry.installDate = new Date();
      this.registry.set(entry.plugin.name, entry);

      this.eventEmitter.emit('plugin:installed', entry.plugin.name);
      return true;
    } catch (error) {
      entry.error = error as Error;
      this.registry.set(entry.plugin.name, entry);
      return false;
    }
  }

  /**
   * Execute plugin uninstallation with common logic for sync/async
   */
  private executeUninstallation(
    entry: PluginRegistryEntry,
    pluginName: string,
    isSync: boolean,
  ): boolean | Promise<boolean> {
    if (isSync) {
      try {
        if (entry.plugin.uninstall && entry.installed) {
          (entry.plugin.uninstall as any)(entry.context);
        }
      } catch (error) {
        this.logger?.error(
          `Failed to uninstall plugin '${pluginName}': ${(error as Error).message}`,
        );
        // Continue with removal even if uninstall hook failed
      }

      this.registry.delete(pluginName);
      this.eventEmitter.emit('plugin:uninstalled', pluginName);
      return true;
    } else {
      return this.executeUninstallationAsync(entry, pluginName);
    }
  }

  private async executeUninstallationAsync(
    entry: PluginRegistryEntry,
    pluginName: string,
  ): Promise<boolean> {
    try {
      if (entry.plugin.uninstall && entry.installed) {
        await entry.plugin.uninstall(entry.context);
      }

      this.registry.delete(pluginName);
      this.eventEmitter.emit('plugin:uninstalled', pluginName);
      return true;
    } catch (error) {
      return false;
    }
  }

  private createPluginContext(
    plugin: SyftBoxPlugin,
    config: Record<string, unknown>,
  ): SyftBoxPluginContext {
    // Use provided logger or create a new PluginLoggerImpl
    const pluginLogger = this.logger || new PluginLoggerImpl(plugin.name);
    const pluginStorage = new PluginStorageImpl(plugin.name, this.globalStorage);
    const pluginEventEmitter = new PluginEventEmitterImpl(this.eventEmitter, plugin.name);

    // Provide mock implementations if clientContext is not available (for tests)
    const auth = this.clientContext?.auth || {
      isAuthenticated: () => false,
      getCurrentUser: () => null,
    };

    const http = this.clientContext?.http || {
      request: async <T>(_config: RequestConfig): Promise<T> => {
        throw new Error('HTTP client not available in test mode');
      },
    };

    return {
      auth,
      http,
      logger: pluginLogger,
      storage: pluginStorage,
      events: pluginEventEmitter,
      config,
    };
  }
}

/**
 * Simple event emitter implementation
 */
class SimpleEventEmitter {
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  emit(event: string, ...args: unknown[]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Event listener error for '${event}':`, error);
        }
      });
    }
  }
}

/**
 * Plugin logger implementation
 */
class PluginLoggerImpl implements PluginLogger {
  constructor(private readonly pluginName: string) {}

  debug(message: string, ...args: unknown[]): void {
    console.debug(`[Plugin:${this.pluginName}] ${message}`, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    console.info(`[Plugin:${this.pluginName}] ${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[Plugin:${this.pluginName}] ${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`[Plugin:${this.pluginName}] ${message}`, ...args);
  }
}

/**
 * Plugin storage implementation
 */
class PluginStorageImpl implements PluginStorage {
  constructor(
    private readonly pluginName: string,
    private readonly globalStorage: Map<string, unknown>,
  ) {}

  private getKey(key: string): string {
    return `plugin:${this.pluginName}:${key}`;
  }

  get<T = unknown>(key: string): T | null {
    const fullKey = this.getKey(key);
    return (this.globalStorage.get(fullKey) as T) || null;
  }

  set<T = unknown>(key: string, value: T): void {
    const fullKey = this.getKey(key);
    this.globalStorage.set(fullKey, value);
  }

  remove(key: string): void {
    const fullKey = this.getKey(key);
    this.globalStorage.delete(fullKey);
  }

  clear(): void {
    const prefix = `plugin:${this.pluginName}:`;
    for (const key of this.globalStorage.keys()) {
      if (typeof key === 'string' && key.startsWith(prefix)) {
        this.globalStorage.delete(key);
      }
    }
  }

  keys(): string[] {
    const prefix = `plugin:${this.pluginName}:`;
    const pluginKeys: string[] = [];

    for (const key of this.globalStorage.keys()) {
      if (typeof key === 'string' && key.startsWith(prefix)) {
        pluginKeys.push(key.substring(prefix.length));
      }
    }

    return pluginKeys;
  }
}

/**
 * Plugin event emitter implementation
 */
class PluginEventEmitterImpl implements PluginEventEmitter {
  constructor(
    private readonly globalEmitter: SimpleEventEmitter,
    private readonly pluginName: string,
  ) {}

  private getEventKey(event: string): string {
    return `plugin:${this.pluginName}:${event}`;
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.globalEmitter.on(this.getEventKey(event), listener);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.globalEmitter.off(this.getEventKey(event), listener);
  }

  emit(event: string, ...args: unknown[]): void {
    this.globalEmitter.emit(this.getEventKey(event), ...args);
  }
}
