import { SyftBoxClient, createSyftBoxClient } from '../client';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';
import { MemoryTokenStorage } from '../utils/storage';

describe('SyftBoxClient', () => {
  const validConfig = {
    serverUrl: 'https://api.syftbox.net',
  };

  describe('constructor', () => {
    it('should create client with valid config', () => {
      const client = new SyftBoxClient(validConfig);
      expect(client).toBeInstanceOf(SyftBoxClient);
      expect(client.auth).toBeDefined();
      expect(client.blob).toBeDefined();
    });

    it('should throw error with missing server URL', () => {
      expect(() => {
        new SyftBoxClient({} as any);
      }).toThrow(SyftBoxError);
    });

    it('should throw error with invalid server URL', () => {
      expect(() => {
        new SyftBoxClient({ serverUrl: 'invalid-url' });
      }).toThrow(SyftBoxError);
    });

    it('should throw error with negative timeout', () => {
      expect(() => {
        new SyftBoxClient({
          serverUrl: 'https://api.syftbox.net',
          http: { timeout: -1000 },
        });
      }).toThrow(SyftBoxError);
    });
  });

  describe('createSyftBoxClient factory', () => {
    it('should create client instance', () => {
      const client = createSyftBoxClient(validConfig);
      expect(client).toBeInstanceOf(SyftBoxClient);
    });

    it('should use custom token storage', () => {
      const tokenStorage = new MemoryTokenStorage();
      const client = createSyftBoxClient({
        ...validConfig,
        auth: { tokenStorage },
      });
      expect(client).toBeInstanceOf(SyftBoxClient);
    });
  });

  describe('methods', () => {
    let client: SyftBoxClient;

    beforeEach(() => {
      client = createSyftBoxClient(validConfig);
    });

    it('should return false for isReady when not authenticated', () => {
      expect(client.isReady()).toBe(false);
    });

    it('should return null for getCurrentUser when not authenticated', () => {
      expect(client.getCurrentUser()).toBeNull();
    });

    it('should provide access to services', () => {
      expect(client.auth).toBeDefined();
      expect(client.blob).toBeDefined();
      expect(typeof client.auth.isAuthenticated).toBe('function');
      expect(typeof client.blob.list).toBe('function');
    });
  });
});
