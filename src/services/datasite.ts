import { HTTPClient } from '../http/client';
import { DatasiteViewResponse, BlobInfo } from '../types';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';

export interface IDatasiteService {
  getView(): Promise<BlobInfo[]>;
}

/**
 * Datasite service for managing datasite views and file information
 */
export class DatasiteService implements IDatasiteService {
  constructor(private readonly httpClient: HTTPClient) {}

  /**
   * Get the current user's datasite view (list of accessible files)
   * This returns all files the authenticated user has read access to,
   * which is essential for the sync system's three-way merge algorithm.
   */
  async getView(): Promise<BlobInfo[]> {
    try {
      const response = await this.httpClient.request<DatasiteViewResponse>({
        method: 'GET',
        url: '/api/v1/datasite/view',
      });

      return response.files;
    } catch (error) {
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
  }
}
