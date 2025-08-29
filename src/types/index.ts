// Core SyftBox types matching the server API

export interface SyftBoxURL {
  user: string;
  domain: string;
  path: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Message types
export enum MessageType {
  SYSTEM = 0,
  ERROR = 1,
  FILE_WRITE = 2,
  FILE_DELETE = 3,
  ACK = 4,
  NACK = 5,
  HTTP = 6,
}

export interface Message<T = unknown> {
  id: string;
  typ: MessageType;
  dat: T;
}

// System message
export interface SystemMessage {
  version: string;
  status: string;
}

// Error message
export interface ErrorMessage {
  code: string;
  message: string;
  details?: unknown;
}

// File messages
export interface FileWriteMessage {
  path: string;
  size: number;
  checksum?: string;
}

export interface FileDeleteMessage {
  path: string;
}

// HTTP message
export interface HttpMessage {
  from: string;
  syft_url: SyftBoxURL;
  method: string;
  headers?: Record<string, string>;
  body?: ArrayBuffer;
  id: string;
  etag?: string;
}

// Auth types
export interface OTPRequest {
  email: string;
}

export interface OTPVerification {
  email: string;
  code: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

// Blob types
export interface BlobUploadRequest {
  key: string;
}

export interface BlobUploadResponse {
  key: string;
  version: string;
  etag: string;
  size: number;
  lastModified: string;
}

export interface BlobURL {
  key: string;
  url: string;
}

export interface BlobAPIError {
  code: string;
  message: string;
  key: string;
}

export interface PresignURLRequest {
  keys: string[];
}

export interface PresignURLResponse {
  urls: BlobURL[];
  errors: BlobAPIError[];
}

export interface DeleteRequest {
  keys: string[];
}

export interface DeleteResponse {
  deleted: string[];
  errors: BlobAPIError[];
}

export interface BlobListResponse {
  blobs: Array<{
    key: string;
    size: number;
    lastModified: string;
    etag: string;
  }>;
}

// RPC types
export interface MessageRequest {
  syftURL: SyftBoxURL;
  from: string;
  timeout?: number;
  asRaw?: boolean;
  method?: string;
  headers?: Record<string, string>;
}

export interface PollObjectRequest {
  requestId: string;
  from: string;
  syftURL: SyftBoxURL;
  timeout?: number;
  asRaw?: boolean;
}

export interface SendResult {
  status: number;
  requestId: string;
  pollURL?: string;
  response?: Record<string, unknown>;
}

export interface PollResult {
  status: number;
  requestId: string;
  response?: Record<string, unknown>;
}

// ACL types
export enum AccessLevel {
  READ = 1,
  CREATE = 2,
  WRITE = 4,
  ADMIN = 8,
}

export interface ACLCheckRequest {
  user: string;
  path: string;
  size?: number;
  level: AccessLevel;
}

export interface ACLCheckResponse {
  user: string;
  path: string;
  level: string;
}

// Datasite types
export interface BlobInfo {
  key: string;
  etag: string;
  size: number;
  lastModified: string;
}

export interface DatasiteViewResponse {
  files: BlobInfo[];
}
