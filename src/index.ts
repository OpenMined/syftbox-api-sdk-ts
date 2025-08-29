// Main exports for the SyftBox TypeScript client library

// Client
export { SyftBoxClient, createSyftBoxClient } from './client';
export type { SyftBoxClientConfig } from './client';

// Services
export type { IAuthService } from './services/auth';
export type { IBlobService } from './services/blob';
export type { IACLService } from './services/acl';
export type { IDatasiteService } from './services/datasite';

// Types
export type * from './types';

// Errors
export { SyftBoxError, SyftBoxErrorCode } from './errors';

// Utilities
export { SyftBoxURLParser } from './utils/url';
export type { ITokenStorage } from './utils/storage';
export {
  LocalStorageTokenStorage,
  MemoryTokenStorage,
  SessionStorageTokenStorage,
} from './utils/storage';
export { utils } from './utils';

// HTTP types (for advanced usage)
export type { HTTPMethod, RequestConfig, ResponseData } from './http/types';

// Default export
import { createSyftBoxClient } from './client';
export default createSyftBoxClient;
