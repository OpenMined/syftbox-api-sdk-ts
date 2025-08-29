import { SyftBoxErrorCode } from './codes';

export { SyftBoxErrorCode };

export class SyftBoxError extends Error {
  public readonly code: SyftBoxErrorCode;
  public readonly details?: unknown;
  public readonly cause: Error | undefined;
  public readonly timestamp: Date;

  constructor(code: SyftBoxErrorCode, message: string, details?: unknown, cause?: Error) {
    super(message);
    this.name = 'SyftBoxError';
    this.code = code;
    this.details = details;
    this.cause = cause;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SyftBoxError);
    }
  }

  /**
   * Create a SyftBoxError from an HTTP response
   */
  static fromHTTPError(status: number, statusText: string, data?: unknown): SyftBoxError {
    switch (status) {
      case 400:
        return new SyftBoxError(
          SyftBoxErrorCode.INVALID_REQUEST,
          `Bad Request: ${statusText}`,
          data,
        );
      case 401:
        return new SyftBoxError(
          SyftBoxErrorCode.AUTHENTICATION_FAILED,
          'Authentication failed',
          data,
        );
      case 403:
        return new SyftBoxError(SyftBoxErrorCode.PERMISSION_DENIED, 'Permission denied', data);
      case 404:
        return new SyftBoxError(SyftBoxErrorCode.NOT_FOUND, 'Resource not found', data);
      case 409:
        return new SyftBoxError(SyftBoxErrorCode.CONFLICT, 'Resource conflict', data);
      case 429:
        return new SyftBoxError(SyftBoxErrorCode.RATE_LIMITED, 'Rate limit exceeded', data);
      case 500:
        return new SyftBoxError(SyftBoxErrorCode.INTERNAL_ERROR, 'Internal server error', data);
      case 502:
      case 503:
        return new SyftBoxError(SyftBoxErrorCode.SERVICE_UNAVAILABLE, 'Service unavailable', data);
      case 504:
        return new SyftBoxError(SyftBoxErrorCode.TIMEOUT, 'Gateway timeout', data);
      default:
        if (status >= 500) {
          return new SyftBoxError(
            SyftBoxErrorCode.SERVER_ERROR,
            `Server error: ${status} ${statusText}`,
            data,
          );
        }
        return new SyftBoxError(
          SyftBoxErrorCode.INVALID_REQUEST,
          `HTTP ${status}: ${statusText}`,
          data,
        );
    }
  }

  /**
   * Create a SyftBoxError from a network error
   */
  static fromNetworkError(error: Error, context?: string): SyftBoxError {
    if (error.name === 'AbortError') {
      return new SyftBoxError(
        SyftBoxErrorCode.TIMEOUT,
        'Request was cancelled or timed out',
        { context },
        error,
      );
    }

    if (error.message.includes('fetch') || error.message.includes('network')) {
      return new SyftBoxError(
        SyftBoxErrorCode.NETWORK_ERROR,
        'Network error occurred',
        { context, originalMessage: error.message },
        error,
      );
    }

    return new SyftBoxError(SyftBoxErrorCode.UNKNOWN_ERROR, error.message, { context }, error);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    const retryableCodes = [
      SyftBoxErrorCode.NETWORK_ERROR,
      SyftBoxErrorCode.TIMEOUT,
      SyftBoxErrorCode.SERVER_ERROR,
      SyftBoxErrorCode.SERVICE_UNAVAILABLE,
      SyftBoxErrorCode.RATE_LIMITED,
    ];

    return retryableCodes.includes(this.code);
  }

  /**
   * Check if error is authentication-related
   */
  isAuthError(): boolean {
    const authCodes = [
      SyftBoxErrorCode.AUTHENTICATION_FAILED,
      SyftBoxErrorCode.TOKEN_EXPIRED,
      SyftBoxErrorCode.INVALID_CREDENTIALS,
      SyftBoxErrorCode.OTP_REQUIRED,
      SyftBoxErrorCode.OTP_INVALID,
      SyftBoxErrorCode.OTP_EXPIRED,
    ];

    return authCodes.includes(this.code);
  }

  /**
   * Convert error to JSON representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Create a user-friendly error message
   */
  getUserMessage(): string {
    switch (this.code) {
      case SyftBoxErrorCode.AUTHENTICATION_FAILED:
        return 'Please check your credentials and try again.';
      case SyftBoxErrorCode.TOKEN_EXPIRED:
        return 'Your session has expired. Please log in again.';
      case SyftBoxErrorCode.PERMISSION_DENIED:
        return 'You do not have permission to perform this action.';
      case SyftBoxErrorCode.NOT_FOUND:
        return 'The requested resource could not be found.';
      case SyftBoxErrorCode.NETWORK_ERROR:
        return 'Unable to connect to the server. Please check your internet connection.';
      case SyftBoxErrorCode.TIMEOUT:
        return 'The request took too long to complete. Please try again.';
      case SyftBoxErrorCode.RATE_LIMITED:
        return 'Too many requests. Please wait a moment before trying again.';
      case SyftBoxErrorCode.SERVER_ERROR:
        return 'The server encountered an error. Please try again later.';
      default:
        return this.message;
    }
  }
}
