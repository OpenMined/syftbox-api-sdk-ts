// HTTP client types and interfaces

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface RequestConfig {
  method: HTTPMethod;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
  responseType?: 'json' | 'text' | 'arraybuffer' | 'blob';
}

export interface ResponseData<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface RequestInterceptor {
  (config: RequestConfig): RequestConfig | Promise<RequestConfig>;
}

export interface ResponseInterceptor {
  (response: ResponseData): ResponseData | Promise<ResponseData>;
}

export interface ErrorInterceptor {
  (error: Error): Error | Promise<Error>;
}

export interface HTTPClientConfig {
  baseURL: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
  interceptors?: {
    request?: RequestInterceptor[];
    response?: ResponseInterceptor[];
    error?: ErrorInterceptor[];
  };
}
