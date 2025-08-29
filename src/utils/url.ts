import { SyftBoxURL } from '../types';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';

export class SyftBoxURLParser {
  /**
   * Parse a SyftBox URL string into components
   */
  static parse(url: string): SyftBoxURL {
    const match = url.match(/^syft:\/\/([^@]+)@([^\/]+)(?:\/(.*))?$/);

    if (!match) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        `Invalid SyftBox URL format: ${url}`,
        { expectedFormat: 'syft://user@domain/path' },
      );
    }

    const [, user, domain, path = ''] = match;

    if (!user || !domain) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        'SyftBox URL must contain user and domain',
        { url, user, domain },
      );
    }

    return {
      user: decodeURIComponent(user),
      domain: decodeURIComponent(domain),
      path: decodeURIComponent(path),
    };
  }

  /**
   * Convert SyftBoxURL components to string
   */
  static stringify(url: SyftBoxURL): string {
    const { user, domain, path } = url;

    if (!user || !domain) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        'SyftBox URL must contain user and domain',
        { url },
      );
    }

    const encodedUser = encodeURIComponent(user);
    const encodedDomain = encodeURIComponent(domain);
    const encodedPath = path ? `/${encodeURIComponent(path)}` : '';

    return `syft://${encodedUser}@${encodedDomain}${encodedPath}`;
  }

  /**
   * Validate a SyftBox URL
   */
  static validate(url: SyftBoxURL): boolean {
    try {
      const stringified = this.stringify(url);
      const parsed = this.parse(stringified);
      return parsed.user === url.user && parsed.domain === url.domain && parsed.path === url.path;
    } catch {
      return false;
    }
  }

  /**
   * Create a new SyftBoxURL with modified path
   */
  static withPath(url: SyftBoxURL, newPath: string): SyftBoxURL {
    return {
      ...url,
      path: newPath,
    };
  }

  /**
   * Combine two URL paths
   */
  static joinPath(basePath: string, ...segments: string[]): string {
    const cleanBase = basePath.replace(/\/+$/, '');
    const cleanSegments = segments
      .filter(segment => segment.length > 0)
      .map(segment => segment.replace(/^\/+|\/+$/g, ''));

    if (cleanSegments.length === 0) {
      return cleanBase;
    }

    return [cleanBase, ...cleanSegments].join('/');
  }
}
