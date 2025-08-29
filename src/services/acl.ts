import { HTTPClient } from '../http/client';
import { AccessLevel, ACLCheckResponse } from '../types';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';
import { utils } from '../utils';

export interface IACLService {
  checkAccess(
    user: string,
    path: string,
    level: AccessLevel,
    size?: number,
  ): Promise<ACLCheckResponse>;
}

export class ACLService implements IACLService {
  constructor(private readonly httpClient: HTTPClient) {}

  async checkAccess(
    user: string,
    path: string,
    level: AccessLevel,
    size?: number,
  ): Promise<ACLCheckResponse> {
    this.validateCheckAccessParams(user, path, level);

    const params = new URLSearchParams();
    params.set('user', user);
    params.set('path', path);
    params.set('level', level.toString());

    if (size !== undefined) {
      params.set('size', size.toString());
    }

    try {
      const response = await this.httpClient.request<ACLCheckResponse>({
        method: 'GET',
        url: `/api/v1/acl/check?${params.toString()}`,
      });

      return response;
    } catch (error) {
      if (error instanceof SyftBoxError) {
        throw new SyftBoxError(
          SyftBoxErrorCode.ACL_ERROR,
          `Failed to check access: ${error.message}`,
          { user, path, level, size },
          error,
        );
      }
      throw new SyftBoxError(
        SyftBoxErrorCode.ACL_ERROR,
        'Failed to check access',
        { user, path, level, size },
        error as Error,
      );
    }
  }

  private validateCheckAccessParams(user: string, path: string, level: AccessLevel): void {
    utils.validateRequiredString(user, 'User', { user });
    utils.validateRequiredString(path, 'Path', { path });

    if (!this.isValidAccessLevel(level)) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        'Level must be a valid AccessLevel',
        { level },
      );
    }
  }

  private isValidAccessLevel(level: AccessLevel): boolean {
    const validLevels = [
      AccessLevel.READ,
      AccessLevel.CREATE,
      AccessLevel.WRITE,
      AccessLevel.ADMIN,
    ];

    // Check if it's a single valid level
    if (validLevels.includes(level)) {
      return true;
    }

    // Check if it's a combination of valid levels
    const maxCombination =
      AccessLevel.READ | AccessLevel.CREATE | AccessLevel.WRITE | AccessLevel.ADMIN;
    return level > 0 && level <= maxCombination;
  }
}
