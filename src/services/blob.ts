import { HTTPClient } from '../http/client';
import {
  BlobUploadResponse,
  PresignURLRequest,
  PresignURLResponse,
  DeleteRequest,
  DeleteResponse,
  BlobListResponse,
} from '../types';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';
import { utils } from '../utils';

export interface IBlobService {
  upload(key: string, data: Blob | ArrayBuffer | File): Promise<BlobUploadResponse>;
  uploadPresigned(keys: string[]): Promise<PresignURLResponse>;
  uploadWithPresignedURL(key: string, data: Blob | ArrayBuffer | File): Promise<void>;
  download(keys: string[]): Promise<PresignURLResponse>;
  downloadFile(key: string): Promise<ArrayBuffer>;
  delete(keys: string[]): Promise<DeleteResponse>;
  list(): Promise<BlobListResponse>;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<{ size: number; lastModified: string; etag: string } | null>;
}

export class BlobService implements IBlobService {
  private readonly proxyUrl: string;

  constructor(private readonly httpClient: HTTPClient, proxyUrl: string = 'http://localhost:8000/proxy-download') {
    this.proxyUrl = proxyUrl;
  }

  async upload(key: string, data: Blob | ArrayBuffer | File): Promise<BlobUploadResponse> {
    this.validateKey(key);
    this.validateData(data);

    try {
      // CRITICAL FIX: Go server expects 'key' as query parameter, not FormData field
      const formData = new FormData();
      
      // Convert data to Blob if needed
      const blob = this.convertToBlob(data);
      formData.append('file', blob);

      const response = await this.httpClient.request<BlobUploadResponse>({
        method: 'PUT',
        url: '/api/v1/blob/upload',
        params: { key }, // Send key as query parameter to match Go server expectation
        data: formData,
        headers: {
          // Don't set Content-Type for FormData - browser will set it automatically with boundary
        },
      });

      return response;
    } catch (error) {
      // Provide more detailed error context for debugging
      const errorDetails = {
        key,
        size: this.getDataSize(data),
        dataType: data.constructor.name,
        blobType: data instanceof Blob ? data.type : 'N/A'
      };

      if (error instanceof SyftBoxError) {
        // Add more context to SyftBox errors
        utils.wrapError(
          error,
          SyftBoxErrorCode.BLOB_UPLOAD_FAILED,
          `Failed to upload blob: ${error.message}`,
          errorDetails,
        );
      }
      utils.wrapError(
        error, 
        SyftBoxErrorCode.BLOB_UPLOAD_FAILED, 
        'Failed to upload blob', 
        errorDetails
      );
      throw error; // TypeScript needs this even though wrapError never returns
    }
  }

  async uploadPresigned(keys: string[]): Promise<PresignURLResponse> {
    if (!keys || keys.length === 0) {
      throw new SyftBoxError(SyftBoxErrorCode.INVALID_REQUEST, 'At least one key is required');
    }

    keys.forEach(key => this.validateKey(key));

    const request: PresignURLRequest = { keys };

    try {
      const response = await this.httpClient.request<PresignURLResponse>({
        method: 'POST',
        url: '/api/v1/blob/upload/presigned',
        data: request,
      });

      return response;
    } catch (error) {
      utils.preserveOrWrapError(
        error,
        SyftBoxErrorCode.BLOB_UPLOAD_FAILED,
        'Failed to get presigned upload URLs',
        { keys },
      );
      throw error; // TypeScript needs this
    }
  }

  async uploadWithPresignedURL(key: string, data: Blob | ArrayBuffer | File): Promise<void> {
    this.validateKey(key);
    this.validateData(data);

    try {
      // Get presigned URL
      const { urls, errors } = await this.uploadPresigned([key]);

      if (errors && errors.length > 0) {
        const error = errors.find(e => e.key === key);
        if (error) {
          throw new SyftBoxError(
            SyftBoxErrorCode.BLOB_UPLOAD_FAILED,
            `Failed to get presigned URL: ${error.message}`,
            { key, errorCode: error.code },
          );
        }
      }

      const uploadUrl = urls.find(u => u.key === key);
      if (!uploadUrl) {
        throw new SyftBoxError(
          SyftBoxErrorCode.BLOB_UPLOAD_FAILED,
          'No upload URL provided for key',
          { key },
        );
      }

      // Upload directly to storage backend
      const blob = this.convertToBlob(data);
      const response = await this.fetchFromStorage(uploadUrl.url, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': blob.type || 'application/octet-stream',
        },
      });

      if (!response.ok) {
        throw new SyftBoxError(
          SyftBoxErrorCode.BLOB_UPLOAD_FAILED,
          `Upload failed with status ${response.status}`,
          {
            key,
            status: response.status,
            statusText: response.statusText,
          },
        );
      }
    } catch (error) {
      utils.preserveOrWrapError(
        error,
        SyftBoxErrorCode.BLOB_UPLOAD_FAILED,
        'Failed to upload with presigned URL',
        { key },
      );
      throw error; // TypeScript needs this
    }
  }

  async download(keys: string[]): Promise<PresignURLResponse> {
    if (!keys || keys.length === 0) {
      throw new SyftBoxError(SyftBoxErrorCode.INVALID_REQUEST, 'At least one key is required');
    }

    keys.forEach(key => this.validateKey(key));

    const request: PresignURLRequest = { keys };

    try {
      const response = await this.httpClient.request<PresignURLResponse>({
        method: 'POST',
        url: '/api/v1/blob/download',
        data: request,
      });

      return response;
    } catch (error) {
      utils.preserveOrWrapError(
        error,
        SyftBoxErrorCode.BLOB_DOWNLOAD_FAILED,
        'Failed to get download URLs',
        { keys },
      );
      throw error; // TypeScript needs this
    }
  }

  async downloadFile(key: string): Promise<ArrayBuffer> {
    this.validateKey(key);

    try {
      // SOLUTION: Use localhost proxy to bypass CORS restrictions
      // Get presigned URL first, then use localhost proxy to fetch from S3
      
      const { urls, errors } = await this.download([key]);

      if (errors && errors.length > 0) {
        const error = errors.find(e => e.key === key);
        if (error) {
          throw new SyftBoxError(
            SyftBoxErrorCode.BLOB_DOWNLOAD_FAILED,
            `Server error getting download URL: ${error.message}`,
            { key, errorCode: error.code, serverError: true },
          );
        }
      }

      const downloadUrl = urls.find(u => u.key === key);
      if (!downloadUrl) {
        throw new SyftBoxError(
          SyftBoxErrorCode.BLOB_NOT_FOUND,
          'No download URL provided by server',
          { key, serverResponse: { urls: urls.length, errors: errors?.length || 0 } },
        );
      }

      // Use localhost proxy to fetch from S3 (bypasses CORS)
      const response = await this.fetchViaLocalhostProxy(downloadUrl.url, key);
      
      if (typeof console !== 'undefined' && console.debug) {
        console.debug(`[SyftBox] Downloaded ${key}: ${response.byteLength} bytes via localhost proxy`);
      }
      
      return response;
    } catch (error) {
      utils.preserveOrWrapError(
        error,
        SyftBoxErrorCode.BLOB_DOWNLOAD_FAILED,
        `Download failed: ${key}`,
        { 
          key,
          operation: 'downloadFile',
          timestamp: new Date().toISOString()
        },
      );
      throw error; // TypeScript needs this
    }
  }

  /**
   * Fallback method using presigned URLs (will fail in browser due to CORS)
   */
  private async downloadFileWithPresignedURL(key: string): Promise<ArrayBuffer> {
    try {
      // Get download URL from server
      const { urls, errors } = await this.download([key]);

      if (errors && errors.length > 0) {
        const error = errors.find(e => e.key === key);
        if (error) {
          throw new SyftBoxError(
            SyftBoxErrorCode.BLOB_DOWNLOAD_FAILED,
            `Server error getting download URL: ${error.message}`,
            { key, errorCode: error.code, serverError: true },
          );
        }
      }

      const downloadUrl = urls.find(u => u.key === key);
      if (!downloadUrl) {
        throw new SyftBoxError(
          SyftBoxErrorCode.BLOB_NOT_FOUND,
          'No download URL provided by server',
          { key, serverResponse: { urls: urls.length, errors: errors?.length || 0 } },
        );
      }

      // BROWSER LIMITATION: This will fail due to CORS
      // The storage backend (S3/Azure/GCP) doesn't allow cross-origin requests
      const response = await this.fetchFromStorage(downloadUrl.url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new SyftBoxError(SyftBoxErrorCode.BLOB_NOT_FOUND, 'File not found in storage', { 
            key,
            storageStatus: response.status 
          });
        }
        throw new SyftBoxError(
          SyftBoxErrorCode.BLOB_DOWNLOAD_FAILED,
          `Storage backend error: HTTP ${response.status}`,
          {
            key,
            status: response.status,
            statusText: response.statusText,
            storageUrl: downloadUrl.url.substring(0, 100) + '...',
            corsIssue: 'likely'
          },
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      
      if (typeof console !== 'undefined' && console.debug) {
        console.debug(`[SyftBox] Downloaded ${key}: ${arrayBuffer.byteLength} bytes`);
      }
      
      return arrayBuffer;
    } catch (error) {
      // Check if this is a CORS error
      if (error instanceof TypeError && error.message.includes('fetch')) {
        utils.preserveOrWrapError(
          error,
          SyftBoxErrorCode.NETWORK_ERROR,
          `Browser CORS restriction prevents direct storage access for: ${key}. Server needs download proxy endpoint.`,
          { 
            key,
            issue: 'CORS_RESTRICTION',
            solution: 'Server-side download proxy needed',
            browserLimitation: true
          },
        );
      }
      
      utils.preserveOrWrapError(
        error,
        SyftBoxErrorCode.BLOB_DOWNLOAD_FAILED,
        `Presigned URL download failed: ${key}`,
        { 
          key,
          operation: 'downloadFileWithPresignedURL',
          timestamp: new Date().toISOString()
        },
      );
      throw error; // TypeScript needs this
    }
  }

  async delete(keys: string[]): Promise<DeleteResponse> {
    if (!keys || keys.length === 0) {
      throw new SyftBoxError(SyftBoxErrorCode.INVALID_REQUEST, 'At least one key is required');
    }

    keys.forEach(key => this.validateKey(key));

    const request: DeleteRequest = { keys };

    try {
      const response = await this.httpClient.request<DeleteResponse>({
        method: 'POST',
        url: '/api/v1/blob/delete',
        data: request,
      });

      return response;
    } catch (error) {
      utils.preserveOrWrapError(
        error,
        SyftBoxErrorCode.BLOB_DELETE_FAILED,
        'Failed to delete blobs',
        { keys },
      );
      throw error; // TypeScript needs this
    }
  }

  async list(): Promise<BlobListResponse> {
    try {
      const response = await this.httpClient.request<BlobListResponse>({
        method: 'GET',
        url: '/api/v1/blob/list',
      });

      return response;
    } catch (error) {
      utils.preserveOrWrapError(error, SyftBoxErrorCode.SERVER_ERROR, 'Failed to list blobs');
      throw error; // TypeScript needs this even though preserveOrWrapError never returns
      throw error; // TypeScript needs this even though the utility never returns
    }
  }

  async exists(key: string): Promise<boolean> {
    this.validateKey(key);

    try {
      const { blobs } = await this.list();
      return blobs.some(blob => blob.key === key);
    } catch (error) {
      // If we can't list blobs, we can't determine existence
      return false;
    }
  }

  /**
   * Fetch file via localhost proxy to bypass CORS restrictions
   */
  private async fetchViaLocalhostProxy(s3Url: string, key: string): Promise<ArrayBuffer> {
    const proxyUrl = this.proxyUrl;
    
    try {
      if (typeof console !== 'undefined' && console.debug) {
        console.debug(`[SyftBox] Using localhost proxy: ${proxyUrl}`);
        console.debug(`[SyftBox] S3 URL: ${s3Url.substring(0, 100)}...`);
      }

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: s3Url,
          key: key,
        }),
      });

      if (!response.ok) {
        throw new SyftBoxError(
          SyftBoxErrorCode.NETWORK_ERROR,
          `Localhost proxy error: HTTP ${response.status}`,
          { 
            key,
            proxyUrl,
            status: response.status,
            statusText: response.statusText,
          },
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      
      if (typeof console !== 'undefined' && console.debug) {
        console.debug(`[SyftBox] Proxy download success: ${arrayBuffer.byteLength} bytes`);
      }
      
      return arrayBuffer;
    } catch (error) {
      if (error instanceof SyftBoxError) {
        throw error;
      }
      
      // Check if proxy server is not running
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const baseUrl = new URL(this.proxyUrl).origin;
        throw new SyftBoxError(
          SyftBoxErrorCode.NETWORK_ERROR,
          `Unified server not running at ${baseUrl}. Please start the unified server.`,
          { 
            key,
            proxyUrl,
            solution: 'Run: node unified-server.js',
            originalError: error.message,
          },
        );
      }
      
      throw new SyftBoxError(
        SyftBoxErrorCode.BLOB_DOWNLOAD_FAILED,
        `Proxy download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { key, proxyUrl },
      );
    }
  }

  async getMetadata(
    key: string,
  ): Promise<{ size: number; lastModified: string; etag: string } | null> {
    this.validateKey(key);

    try {
      const { blobs } = await this.list();
      const blob = blobs.find(b => b.key === key);

      if (!blob) {
        return null;
      }

      return {
        size: blob.size,
        lastModified: blob.lastModified,
        etag: blob.etag,
      };
    } catch (error) {
      if (error instanceof SyftBoxError && error.code === SyftBoxErrorCode.NOT_FOUND) {
        return null;
      }
      throw error;
    }
  }

  // Helper methods
  private validateKey(key: string): void {
    utils.validateRequiredString(key, 'Key', { key });
    utils.validateStringLength(key, 'Key', 1024, { key });
    utils.validateStringCharacters(key, 'Key', ['\0', '\n', '\r'], { key });
  }

  private validateData(data: Blob | ArrayBuffer | File): void {
    if (!data) {
      throw new SyftBoxError(SyftBoxErrorCode.INVALID_REQUEST, 'Data is required');
    }

    const size = this.getDataSize(data);
    if (size === 0) {
      throw new SyftBoxError(SyftBoxErrorCode.INVALID_REQUEST, 'Data cannot be empty');
    }

    // Check for reasonable size limit (100MB)
    const maxSize = 100 * 1024 * 1024;
    if (size > maxSize) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        `Data is too large (maximum ${utils.formatBytes(maxSize)})`,
        { size: utils.formatBytes(size) },
      );
    }
  }

  private convertToBlob(data: Blob | ArrayBuffer | File): Blob {
    if (data instanceof Blob) {
      return data;
    }

    if (data instanceof ArrayBuffer) {
      return new Blob([data]);
    }

    // File is a subclass of Blob, so this shouldn't happen
    // but included for completeness
    return data as Blob;
  }

  private getDataSize(data: Blob | ArrayBuffer | File): number {
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    return data.size;
  }

  /**
   * Consistent fetch wrapper for storage backend operations
   */
  private async fetchFromStorage(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        mode: 'cors', // Explicitly handle CORS
        credentials: 'omit', // Don't send credentials to storage backends
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new SyftBoxError(SyftBoxErrorCode.TIMEOUT, 'Storage operation timeout', { url });
      }
      
      // Provide more detailed error information
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      
      throw new SyftBoxError(
        SyftBoxErrorCode.NETWORK_ERROR,
        `Storage operation failed: ${errorMessage}`,
        { 
          url: url.substring(0, 100) + '...', // Truncate URL for security
          errorName,
          errorMessage,
          isStorageBackend: true
        },
        error as Error,
      );
    }
  }
}
