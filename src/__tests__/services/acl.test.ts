import { ACLService } from '../../services/acl';
import { HTTPClient } from '../../http/client';
import { AccessLevel, ACLCheckResponse } from '../../types';
import { SyftBoxError, SyftBoxErrorCode } from '../../errors';

// Mock HTTP client
const mockHttpClient = {
  request: jest.fn(),
} as unknown as HTTPClient;

describe('ACLService', () => {
  let service: ACLService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ACLService(mockHttpClient);
  });

  describe('checkAccess', () => {
    it('should check access successfully', async () => {
      const mockResponse: ACLCheckResponse = {
        user: 'test@example.com',
        path: '/test/file.txt',
        level: 'Read',
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.checkAccess(
        'test@example.com',
        '/test/file.txt',
        AccessLevel.READ,
      );

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/api/v1/acl/check?user=test%40example.com&path=%2Ftest%2Ffile.txt&level=1',
      });
    });

    it('should include size parameter when provided', async () => {
      const mockResponse: ACLCheckResponse = {
        user: 'test@example.com',
        path: '/test/file.txt',
        level: 'Write',
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      await service.checkAccess('test@example.com', '/test/file.txt', AccessLevel.WRITE, 1024);

      expect(mockHttpClient.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/api/v1/acl/check?user=test%40example.com&path=%2Ftest%2Ffile.txt&level=4&size=1024',
      });
    });

    it('should handle combined access levels', async () => {
      const mockResponse: ACLCheckResponse = {
        user: 'test@example.com',
        path: '/test/file.txt',
        level: 'Read+Write',
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const combinedLevel = AccessLevel.READ | AccessLevel.WRITE;
      await service.checkAccess('test@example.com', '/test/file.txt', combinedLevel);

      expect(mockHttpClient.request).toHaveBeenCalledWith({
        method: 'GET',
        url: `/api/v1/acl/check?user=test%40example.com&path=%2Ftest%2Ffile.txt&level=${combinedLevel}`,
      });
    });

    it('should validate required parameters', async () => {
      // Invalid user
      await expect(service.checkAccess('', '/test/file.txt', AccessLevel.READ)).rejects.toThrow(
        SyftBoxError,
      );
      await expect(service.checkAccess('', '/test/file.txt', AccessLevel.READ)).rejects.toThrow(
        'User must be a valid string',
      );

      // Invalid path
      await expect(service.checkAccess('test@example.com', '', AccessLevel.READ)).rejects.toThrow(
        SyftBoxError,
      );
      await expect(service.checkAccess('test@example.com', '', AccessLevel.READ)).rejects.toThrow(
        'Path must be a valid string',
      );

      // Invalid access level (0)
      await expect(
        service.checkAccess('test@example.com', '/test/file.txt', 0 as AccessLevel),
      ).rejects.toThrow(SyftBoxError);
      await expect(
        service.checkAccess('test@example.com', '/test/file.txt', 0 as AccessLevel),
      ).rejects.toThrow('Level must be a valid AccessLevel');

      // Invalid access level (too high)
      const invalidLevel = 999 as AccessLevel;
      await expect(
        service.checkAccess('test@example.com', '/test/file.txt', invalidLevel),
      ).rejects.toThrow(SyftBoxError);
      await expect(
        service.checkAccess('test@example.com', '/test/file.txt', invalidLevel),
      ).rejects.toThrow('Level must be a valid AccessLevel');
    });

    it('should handle HTTP errors', async () => {
      (mockHttpClient.request as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(
        service.checkAccess('test@example.com', '/test/file.txt', AccessLevel.READ),
      ).rejects.toThrow(SyftBoxError);
      await expect(
        service.checkAccess('test@example.com', '/test/file.txt', AccessLevel.READ),
      ).rejects.toThrow('Failed to check access');
    });

    it('should handle SyftBox errors', async () => {
      const originalError = new SyftBoxError(SyftBoxErrorCode.ACCESS_DENIED, 'Access denied');
      (mockHttpClient.request as jest.Mock).mockRejectedValue(originalError);

      await expect(
        service.checkAccess('test@example.com', '/test/file.txt', AccessLevel.READ),
      ).rejects.toThrow(SyftBoxError);

      try {
        await service.checkAccess('test@example.com', '/test/file.txt', AccessLevel.READ);
      } catch (error) {
        expect(error).toBeInstanceOf(SyftBoxError);
        const syftError = error as SyftBoxError;
        expect(syftError.code).toBe(SyftBoxErrorCode.ACL_ERROR);
        expect(syftError.message).toContain('Failed to check access');
        expect(syftError.details).toEqual({
          user: 'test@example.com',
          path: '/test/file.txt',
          level: AccessLevel.READ,
          size: undefined,
        });
      }
    });

    it('should validate all access level types', async () => {
      const mockResponse: ACLCheckResponse = {
        user: 'test@example.com',
        path: '/test/file.txt',
        level: 'Admin',
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      // Test all valid individual levels
      await service.checkAccess('test@example.com', '/test/file.txt', AccessLevel.READ);
      await service.checkAccess('test@example.com', '/test/file.txt', AccessLevel.CREATE);
      await service.checkAccess('test@example.com', '/test/file.txt', AccessLevel.WRITE);
      await service.checkAccess('test@example.com', '/test/file.txt', AccessLevel.ADMIN);

      expect(mockHttpClient.request).toHaveBeenCalledTimes(4);
    });
  });
});
