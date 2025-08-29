import {
  HTTPClientConfig,
  RequestConfig,
  ResponseData,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
} from './types';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';
import { utils } from '../utils';

export class HTTPClient {
  private readonly config: Required<HTTPClientConfig>;
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(config: HTTPClientConfig) {
    this.config = {
      baseURL: config.baseURL,
      timeout: config.timeout ?? 30000,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      headers: config.headers ?? {},
      interceptors: {
        request: config.interceptors?.request ?? [],
        response: config.interceptors?.response ?? [],
        error: config.interceptors?.error ?? [],
      },
    };
  }

  async request<T = unknown>(config: RequestConfig): Promise<T> {
    const requestId = `req_${utils.generateId()}`;
    let finalConfig = this.mergeConfig(config);

    try {
      // Apply request interceptors
      for (const interceptor of this.config.interceptors.request ?? []) {
        finalConfig = await interceptor(finalConfig);
      }

      // Perform request with retry logic
      const response = await this.requestWithRetry(finalConfig, requestId);

      // Apply response interceptors
      let finalResponse = response;
      for (const interceptor of this.config.interceptors.response ?? []) {
        finalResponse = await interceptor(finalResponse);
      }

      return finalResponse.data as T;
    } catch (error) {
      // Apply error interceptors
      let finalError = error as Error;
      for (const interceptor of this.config.interceptors.error ?? []) {
        finalError = await interceptor(finalError);
      }
      throw finalError;
    } finally {
      this.abortControllers.delete(requestId);
    }
  }

  private async requestWithRetry(config: RequestConfig, requestId: string): Promise<ResponseData> {
    return utils.retryWithCondition(() => this.performRequest(config, requestId), {
      attempts: this.config.retryAttempts,
      delayMs: this.config.retryDelay,
      backoffFactor: 2,
      maxDelay: 30000,
      shouldRetry: (error: Error) => {
        if (error instanceof SyftBoxError) {
          // Don't retry client errors (4xx) except 429 (rate limit)
          if (error.code === SyftBoxErrorCode.RATE_LIMITED) return true;
          if (error.code === SyftBoxErrorCode.AUTHENTICATION_FAILED) return false;
          if (error.code === SyftBoxErrorCode.PERMISSION_DENIED) return false;
          if (error.code === SyftBoxErrorCode.NOT_FOUND) return false;
        }
        return true; // Retry network errors and 5xx
      },
    });
  }

  private async performRequest(config: RequestConfig, requestId: string): Promise<ResponseData> {
    const abortController = new AbortController();
    this.abortControllers.set(requestId, abortController);

    // Setup timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, config.timeout ?? this.config.timeout);

    try {
      const url = this.buildURL(config.url, config.params);
      const headers = this.buildHeaders(config.headers);
      const body = this.buildBody(config.data, headers);

      const response = await fetch(url, {
        method: config.method,
        headers,
        body,
        signal: config.signal ?? abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw await this.handleHTTPError(response);
      }

      const responseData = await this.parseResponse(response, config.responseType);
      const responseHeaders = this.parseHeaders(response.headers);

      return {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new SyftBoxError(
          SyftBoxErrorCode.TIMEOUT,
          'Request timeout',
          { timeout: config.timeout ?? this.config.timeout },
          error,
        );
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new SyftBoxError(
          SyftBoxErrorCode.NETWORK_ERROR,
          'Network error',
          { url: config.url },
          error,
        );
      }

      throw error;
    }
  }

  private async handleHTTPError(response: Response): Promise<SyftBoxError> {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = await response.text();
    }

    switch (response.status) {
      case 401:
        return new SyftBoxError(
          SyftBoxErrorCode.AUTHENTICATION_FAILED,
          'Authentication failed',
          errorData,
        );
      case 403:
        return new SyftBoxError(SyftBoxErrorCode.PERMISSION_DENIED, 'Permission denied', errorData);
      case 404:
        return new SyftBoxError(SyftBoxErrorCode.NOT_FOUND, 'Resource not found', errorData);
      case 429:
        return new SyftBoxError(SyftBoxErrorCode.RATE_LIMITED, 'Rate limit exceeded', errorData);
      case 408:
        return new SyftBoxError(SyftBoxErrorCode.TIMEOUT, 'Request timeout', errorData);
      default:
        if (response.status >= 500) {
          return new SyftBoxError(
            SyftBoxErrorCode.SERVER_ERROR,
            `Server error: ${response.status}`,
            errorData,
          );
        }
        return new SyftBoxError(
          SyftBoxErrorCode.INVALID_REQUEST,
          `HTTP ${response.status}: ${response.statusText}`,
          errorData,
        );
    }
  }

  private mergeConfig(config: RequestConfig): RequestConfig {
    return {
      ...config,
      headers: {
        ...this.config.headers,
        ...config.headers,
      },
      timeout: config.timeout ?? this.config.timeout,
    };
  }

  private buildURL(url: string, params?: Record<string, string>): string {
    const baseURL = this.config.baseURL.endsWith('/')
      ? this.config.baseURL.slice(0, -1)
      : this.config.baseURL;
    const fullURL = url.startsWith('/') ? `${baseURL}${url}` : `${baseURL}/${url}`;

    if (!params || Object.keys(params).length === 0) {
      return fullURL;
    }

    const urlObj = new URL(fullURL);
    Object.entries(params).forEach(([key, value]) => {
      urlObj.searchParams.append(key, value);
    });

    return urlObj.toString();
  }

  private buildHeaders(headers?: Record<string, string>): Record<string, string> {
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    return {
      ...defaultHeaders,
      ...headers,
    };
  }

  private buildBody(data: unknown, headers: Record<string, string>): string | FormData | null {
    if (!data) return null;

    if (data instanceof FormData) {
      // Remove Content-Type header for FormData (browser will set it with boundary)
      delete headers['Content-Type'];
      return data;
    }

    if (headers['Content-Type']?.includes('application/json')) {
      return JSON.stringify(data);
    }

    return String(data);
  }

  private async parseResponse(response: Response, responseType?: 'json' | 'text' | 'arraybuffer' | 'blob'): Promise<unknown> {
    // If responseType is explicitly specified, use it
    if (responseType) {
      switch (responseType) {
        case 'json':
          return response.json();
        case 'text':
          return response.text();
        case 'arraybuffer':
          return response.arrayBuffer();
        case 'blob':
          return response.blob();
      }
    }

    // Otherwise, auto-detect based on Content-Type
    const contentType = response.headers.get('Content-Type') ?? '';

    if (contentType.includes('application/json')) {
      return response.json();
    } else if (contentType.includes('text/')) {
      return response.text();
    } else {
      return response.arrayBuffer();
    }
  }

  private parseHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  // Public methods for managing requests
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.config.interceptors.request?.push(interceptor);
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.config.interceptors.response?.push(interceptor);
  }

  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.config.interceptors.error?.push(interceptor);
  }

  cancelRequest(requestId: string): void {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
    }
  }

  cancelAllRequests(): void {
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
  }
}
