import { PluginManager } from '../../plugins/manager';
import { SyftBoxPlugin, SyftBoxPluginContext } from '../../plugins/types';
import { RequestConfig, ResponseData } from '../../http/types';
import { Message } from '../../types';

// Mock plugin for testing
class MockPlugin implements SyftBoxPlugin {
  readonly name = 'mock-plugin';
  readonly version = '1.0.0';
  readonly description = 'Mock plugin for testing';

  private isInstalled = false;
  public onRequestCalled = false;
  public onResponseCalled = false;
  public onErrorCalled = false;
  public onWebSocketMessageCalled = false;
  public onWebSocketConnectCalled = false;
  public onWebSocketDisconnectCalled = false;

  install(context: SyftBoxPluginContext): void {
    this.isInstalled = true;
  }

  uninstall?(): void {
    this.isInstalled = false;
  }

  async onRequest?(config: RequestConfig): Promise<RequestConfig> {
    this.onRequestCalled = true;
    return { ...config, headers: { ...config.headers, 'X-Mock-Plugin': 'true' } };
  }

  async onResponse?(response: ResponseData): Promise<ResponseData> {
    this.onResponseCalled = true;
    return response;
  }

  async onError?(error: Error): Promise<Error> {
    this.onErrorCalled = true;
    return error;
  }

  async onWebSocketMessage?(message: Message): Promise<Message> {
    this.onWebSocketMessageCalled = true;
    return message;
  }

  async onWebSocketConnect?(): Promise<void> {
    this.onWebSocketConnectCalled = true;
  }

  async onWebSocketDisconnect?(event: { code: number; reason: string }): Promise<void> {
    this.onWebSocketDisconnectCalled = true;
  }

  getIsInstalled(): boolean {
    return this.isInstalled;
  }
}

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('PluginManager', () => {
  let manager: PluginManager;
  let mockPlugin: MockPlugin;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new PluginManager(mockLogger);
    mockPlugin = new MockPlugin();
  });

  afterEach(async () => {
    await manager.cleanup();
  });

  describe('plugin lifecycle', () => {
    it('should install plugin successfully', async () => {
      await manager.installPlugin(mockPlugin);

      expect(mockPlugin.getIsInstalled()).toBe(true);
      expect(manager.getInstalledPlugins().map(p => p.name)).toContain('mock-plugin');
    });

    it('should not install duplicate plugins', async () => {
      await manager.installPlugin(mockPlugin);

      await expect(manager.installPlugin(mockPlugin)).rejects.toThrow();
      expect(manager.getInstalledPlugins()).toHaveLength(1);
    });

    it('should install plugin with custom config', async () => {
      const config = { customOption: true };
      await manager.installPlugin(mockPlugin, { config });

      expect(mockPlugin.getIsInstalled()).toBe(true);
    });

    it('should uninstall plugin successfully', () => {
      manager.install(mockPlugin);
      expect(manager.getInstalledPlugins().map(p => p.name)).toContain('mock-plugin');

      const result = manager.uninstall('mock-plugin');

      expect(result).toBe(true);
      expect(mockPlugin.getIsInstalled()).toBe(false);
      expect(manager.getInstalledPlugins().map(p => p.name)).not.toContain('mock-plugin');
    });

    it('should not uninstall non-existent plugin', () => {
      const result = manager.uninstall('non-existent');
      expect(result).toBe(false);
    });

    it('should uninstall all plugins', () => {
      const mockPlugin2 = new MockPlugin();
      (mockPlugin2 as any).name = 'mock-plugin-2';

      manager.install(mockPlugin);
      manager.install(mockPlugin2);

      expect(manager.getInstalledPlugins()).toHaveLength(2);

      manager.uninstallAll();

      expect(manager.getInstalledPlugins()).toHaveLength(0);
      expect(mockPlugin.getIsInstalled()).toBe(false);
      expect((mockPlugin2 as any).getIsInstalled()).toBe(false);
    });
  });

  describe('hook execution', () => {
    beforeEach(() => {
      manager.install(mockPlugin);
    });

    it('should execute onRequest hooks', async () => {
      const config: RequestConfig = {
        method: 'GET',
        url: '/test',
      };

      const result = await manager.executeRequestHooks(config);

      expect(mockPlugin.onRequestCalled).toBe(true);
      expect(result.headers).toHaveProperty('X-Mock-Plugin', 'true');
    });

    it('should execute onResponse hooks', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        data: { test: 'data' },
        headers: {},
      };

      await manager.executeResponseHooks(response);

      expect(mockPlugin.onResponseCalled).toBe(true);
    });

    it('should execute onError hooks', async () => {
      const error = new Error('Test error');

      await manager.executeErrorHooks(error);

      expect(mockPlugin.onErrorCalled).toBe(true);
    });

    it('should execute onWebSocketMessage hooks', async () => {
      const message: Message = {
        id: 'test-id',
        typ: 1,
        dat: { test: 'data' },
      };

      await manager.executeWebSocketMessageHooks(message);

      expect(mockPlugin.onWebSocketMessageCalled).toBe(true);
    });

    it('should execute onWebSocketConnect hooks', async () => {
      await manager.executeWebSocketConnectHooks();

      expect(mockPlugin.onWebSocketConnectCalled).toBe(true);
    });

    it('should execute onWebSocketDisconnect hooks', async () => {
      const event = { code: 1000, reason: 'Normal closure' };

      await manager.executeWebSocketDisconnectHooks(event);

      expect(mockPlugin.onWebSocketDisconnectCalled).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle plugin installation errors', () => {
      const faultyPlugin = {
        ...mockPlugin,
        install: () => {
          throw new Error('Installation failed');
        },
      };

      const result = manager.install(faultyPlugin);

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle plugin uninstallation errors', () => {
      const faultyPlugin = {
        ...mockPlugin,
        uninstall: () => {
          throw new Error('Uninstallation failed');
        },
      };

      manager.install(faultyPlugin);
      const result = manager.uninstall('mock-plugin');

      expect(result).toBe(true); // Still removes from manager despite error
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle hook execution errors gracefully', async () => {
      const faultyPlugin = {
        ...mockPlugin,
        onRequest: async () => {
          throw new Error('Hook failed');
        },
      };

      manager.install(faultyPlugin);

      const config: RequestConfig = {
        method: 'GET',
        url: '/test',
      };

      const result = await manager.executeRequestHooks(config);

      expect(result).toEqual(config); // Should return original config
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should continue executing other hooks if one fails', async () => {
      const faultyPlugin = {
        ...mockPlugin,
        name: 'faulty-plugin',
        onRequest: async () => {
          throw new Error('Hook failed');
        },
      };

      const workingPlugin = new MockPlugin();
      (workingPlugin as any).name = 'working-plugin';

      manager.install(faultyPlugin);
      manager.install(workingPlugin);

      const config: RequestConfig = {
        method: 'GET',
        url: '/test',
      };

      const result = await manager.executeRequestHooks(config);

      expect(workingPlugin.onRequestCalled).toBe(true);
      expect(result.headers).toHaveProperty('X-Mock-Plugin', 'true');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('plugin information', () => {
    beforeEach(() => {
      manager.install(mockPlugin);
    });

    it('should return installed plugins list', () => {
      const plugins = manager.getInstalledPlugins();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('mock-plugin');
      expect(plugins[0].installed).toBe(true);
    });

    it('should return plugin information', () => {
      const info = manager.getPluginInfo('mock-plugin');

      expect(info).toEqual({
        name: 'mock-plugin',
        version: '1.0.0',
        description: 'Mock plugin for testing',
      });
    });

    it('should return undefined for non-existent plugin info', () => {
      const info = manager.getPluginInfo('non-existent');

      expect(info).toBeUndefined();
    });

    it('should check if plugin is installed', () => {
      expect(manager.isInstalled('mock-plugin')).toBe(true);
      expect(manager.isInstalled('non-existent')).toBe(false);
    });
  });

  describe('context isolation', () => {
    it('should provide isolated context to each plugin', () => {
      const plugin1Config = { plugin1Option: true };
      const plugin2Config = { plugin2Option: false };

      const plugin2 = new MockPlugin();
      (plugin2 as any).name = 'mock-plugin-2';

      let plugin1Context: SyftBoxPluginContext;
      let plugin2Context: SyftBoxPluginContext;

      const originalInstall1 = mockPlugin.install;
      const originalInstall2 = plugin2.install;

      mockPlugin.install = context => {
        plugin1Context = context;
        originalInstall1.call(mockPlugin, context);
      };

      plugin2.install = context => {
        plugin2Context = context;
        originalInstall2.call(plugin2, context);
      };

      manager.install(mockPlugin, plugin1Config);
      manager.install(plugin2, plugin2Config);

      expect(plugin1Context!.config).toEqual(plugin1Config);
      expect(plugin2Context!.config).toEqual(plugin2Config);
      expect(plugin1Context!.logger).toBe(mockLogger);
      expect(plugin2Context!.logger).toBe(mockLogger);
    });
  });
});
