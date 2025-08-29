import { DatasiteService } from '../../services/datasite';
import { HTTPClient } from '../../http/client';
import { DatasiteViewResponse, BlobInfo } from '../../types';
import { SyftBoxError, SyftBoxErrorCode } from '../../errors';

// Mock HTTP client
const mockHttpClient = {
  request: jest.fn(),
} as unknown as HTTPClient;

describe('DatasiteService', () => {
  let service: DatasiteService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DatasiteService(mockHttpClient);
  });

  describe('getView', () => {
    it('should get datasite view successfully', async () => {
      const mockFiles: BlobInfo[] = [
        {
          key: 'user@example.com/public/file1.txt',
          etag: 'abc123',
          size: 1024,
          lastModified: '2024-01-01T00:00:00Z',
        },
        {
          key: 'user@example.com/private/file2.txt',
          etag: 'def456',
          size: 2048,
          lastModified: '2024-01-02T00:00:00Z',
        },
      ];

      const mockResponse: DatasiteViewResponse = {
        files: mockFiles,
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.getView();

      expect(result).toEqual(mockFiles);
      expect(mockHttpClient.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/api/v1/datasite/view',
      });
    });

    it('should return empty array when no files accessible', async () => {
      const mockResponse: DatasiteViewResponse = {
        files: [],
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.getView();

      expect(result).toEqual([]);
      expect(mockHttpClient.request).toHaveBeenCalledWith({
        method: 'GET',
        url: '/api/v1/datasite/view',
      });
    });

    it('should handle HTTP errors', async () => {
      (mockHttpClient.request as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(service.getView()).rejects.toThrow(SyftBoxError);
      await expect(service.getView()).rejects.toThrow('Failed to get datasite view');
    });

    it('should handle SyftBox errors', async () => {
      const originalError = new SyftBoxError(
        SyftBoxErrorCode.AUTHENTICATION_FAILED,
        'Authentication failed',
      );
      (mockHttpClient.request as jest.Mock).mockRejectedValue(originalError);

      await expect(service.getView()).rejects.toThrow(SyftBoxError);

      try {
        await service.getView();
      } catch (error) {
        expect(error).toBeInstanceOf(SyftBoxError);
        const syftError = error as SyftBoxError;
        expect(syftError.code).toBe(SyftBoxErrorCode.DATASITE_ERROR);
        expect(syftError.message).toContain('Failed to get datasite view');
      }
    });

    it('should handle authentication errors', async () => {
      const authError = new SyftBoxError(SyftBoxErrorCode.AUTHENTICATION_FAILED, 'Token expired');
      (mockHttpClient.request as jest.Mock).mockRejectedValue(authError);

      await expect(service.getView()).rejects.toThrow(SyftBoxError);

      try {
        await service.getView();
      } catch (error) {
        expect(error).toBeInstanceOf(SyftBoxError);
        const syftError = error as SyftBoxError;
        expect(syftError.code).toBe(SyftBoxErrorCode.DATASITE_ERROR);
        expect(syftError.cause).toBe(authError);
      }
    });

    it('should handle permission errors', async () => {
      const permissionError = new SyftBoxError(SyftBoxErrorCode.PERMISSION_DENIED, 'Access denied');
      (mockHttpClient.request as jest.Mock).mockRejectedValue(permissionError);

      await expect(service.getView()).rejects.toThrow(SyftBoxError);

      try {
        await service.getView();
      } catch (error) {
        expect(error).toBeInstanceOf(SyftBoxError);
        const syftError = error as SyftBoxError;
        expect(syftError.code).toBe(SyftBoxErrorCode.DATASITE_ERROR);
      }
    });

    it('should handle server errors', async () => {
      const serverError = new SyftBoxError(SyftBoxErrorCode.SERVER_ERROR, 'Internal server error');
      (mockHttpClient.request as jest.Mock).mockRejectedValue(serverError);

      await expect(service.getView()).rejects.toThrow(SyftBoxError);
    });

    it('should handle large file lists', async () => {
      // Create a large list of files to test performance
      const mockFiles: BlobInfo[] = Array.from({ length: 1000 }, (_, i) => ({
        key: `user@example.com/files/file${i}.txt`,
        etag: `etag${i}`,
        size: i * 1024,
        lastModified: `2024-01-${String((i % 31) + 1).padStart(2, '0')}T00:00:00Z`,
      }));

      const mockResponse: DatasiteViewResponse = {
        files: mockFiles,
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.getView();

      expect(result).toHaveLength(1000);
      expect(result[0]).toEqual(mockFiles[0]);
      expect(result[999]).toEqual(mockFiles[999]);
    });

    it('should handle files with special characters in paths', async () => {
      const mockFiles: BlobInfo[] = [
        {
          key: 'user@example.com/files/file with spaces.txt',
          etag: 'abc123',
          size: 1024,
          lastModified: '2024-01-01T00:00:00Z',
        },
        {
          key: 'user@example.com/files/файл.txt', // Cyrillic characters
          etag: 'def456',
          size: 2048,
          lastModified: '2024-01-02T00:00:00Z',
        },
        {
          key: 'user@example.com/files/file-with-émojis-🎉.txt',
          etag: 'ghi789',
          size: 512,
          lastModified: '2024-01-03T00:00:00Z',
        },
      ];

      const mockResponse: DatasiteViewResponse = {
        files: mockFiles,
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.getView();

      expect(result).toEqual(mockFiles);
      expect(result).toHaveLength(3);
    });
  });
});
