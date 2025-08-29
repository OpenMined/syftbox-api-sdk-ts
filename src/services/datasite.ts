import { HTTPClient } from '../http/client';
import { DatasiteViewResponse, BlobInfo } from '../types';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';

export interface IDatasiteService {
  getView(): Promise<BlobInfo[]>;
  getPathView(path: string): Promise<BlobInfo[]>;
  destroy(): void;
  getCacheStatus(): { cached: boolean; lastFetch: Date | null };
}

export interface DatasiteServiceConfig {
  refreshIntervalMs?: number;
  autoRefresh?: boolean;
}

/**
 * Datasite service for managing datasite views and file information
 */
export class DatasiteService implements IDatasiteService {
  private cachedView: BlobInfo[] | null = null;
  private lastFetchTime: Date | null = null;
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly refreshIntervalMs: number;
  private readonly autoRefresh: boolean;

  constructor(
    private readonly httpClient: HTTPClient,
    config: DatasiteServiceConfig = {}
  ) {
    this.refreshIntervalMs = config.refreshIntervalMs ?? 10000;
    this.autoRefresh = config.autoRefresh ?? true;
  }

  /**
   * Get the current user's datasite view (list of accessible files)
   * This returns all files the authenticated user has read access to,
   * which is essential for the sync system's three-way merge algorithm.
   * Uses caching with automatic refresh every 10 seconds.
   */
  async getView(): Promise<BlobInfo[]> {
    if (!this.cachedView) {
      await this.refreshCache();
      if (this.autoRefresh) {
        this.startAutoRefresh();
      }
    }
    
    return this.cachedView || [];
  }

  /**
   * Get filtered view of files matching a specific path prefix
   * @param path - The base path to filter by (e.g., 'ionesio/' or 'user/folder/')
   * @returns Promise resolving to filtered array of BlobInfo matching the path
   */
  async getPathView(path: string): Promise<BlobInfo[]> {
    if (!this.cachedView) {
      await this.getView();
    }

    const normalizedPath = path.endsWith('/') ? path : path ? path + '/' : '';
    
    return (this.cachedView || []).filter(item => 
      item.key.startsWith(normalizedPath)
    );
  }

  /**
   * Refresh the cached datasite view
   */
  private async refreshCache(): Promise<void> {
    try {
      const response = await this.httpClient.request<DatasiteViewResponse>({
        method: 'GET',
        url: '/api/v1/datasite/view',
      });

      this.cachedView = response.files;
      this.lastFetchTime = new Date();
    } catch (error) {
      if (!this.cachedView) {
        if (error instanceof SyftBoxError) {
          throw new SyftBoxError(
            SyftBoxErrorCode.DATASITE_ERROR,
            'Failed to get datasite view',
            undefined,
            error,
          );
        }

        throw new SyftBoxError(
          SyftBoxErrorCode.DATASITE_ERROR,
          'Failed to get datasite view',
          undefined,
          error as Error,
        );
      }
      console.error('Failed to refresh datasite cache:', error);
    }
  }

  /**
   * Start automatic cache refresh interval
   */
  private startAutoRefresh(): void {
    if (this.refreshInterval) {
      return;
    }

    this.refreshInterval = setInterval(async () => {
      await this.refreshCache();
    }, this.refreshIntervalMs);
  }

  /**
   * Stop automatic cache refresh interval
   */
  private stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Get cache status information
   */
  getCacheStatus(): { cached: boolean; lastFetch: Date | null } {
    return {
      cached: this.cachedView !== null,
      lastFetch: this.lastFetchTime,
    };
  }

  /**
   * Clean up resources (stop intervals)
   */
  destroy(): void {
    this.stopAutoRefresh();
    this.cachedView = null;
    this.lastFetchTime = null;
  }
}
