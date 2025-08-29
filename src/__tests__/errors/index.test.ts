import { SyftBoxError, SyftBoxErrorCode } from '../../errors';

describe('SyftBoxError', () => {
  it('should create error with code and message', () => {
    const error = new SyftBoxError(SyftBoxErrorCode.AUTHENTICATION_FAILED, 'Authentication failed');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SyftBoxError);
    expect(error.code).toBe(SyftBoxErrorCode.AUTHENTICATION_FAILED);
    expect(error.message).toBe('Authentication failed');
    expect(error.name).toBe('SyftBoxError');
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it('should include details and cause', () => {
    const cause = new Error('Original error');
    const details = { statusCode: 401 };

    const error = new SyftBoxError(
      SyftBoxErrorCode.AUTHENTICATION_FAILED,
      'Authentication failed',
      details,
      cause,
    );

    expect(error.details).toEqual(details);
    expect(error.cause).toBe(cause);
  });

  describe('fromHTTPError', () => {
    it('should create appropriate error for 401', () => {
      const error = SyftBoxError.fromHTTPError(401, 'Unauthorized');
      expect(error.code).toBe(SyftBoxErrorCode.AUTHENTICATION_FAILED);
      expect(error.message).toBe('Authentication failed');
    });

    it('should create appropriate error for 403', () => {
      const error = SyftBoxError.fromHTTPError(403, 'Forbidden');
      expect(error.code).toBe(SyftBoxErrorCode.PERMISSION_DENIED);
      expect(error.message).toBe('Permission denied');
    });

    it('should create appropriate error for 404', () => {
      const error = SyftBoxError.fromHTTPError(404, 'Not Found');
      expect(error.code).toBe(SyftBoxErrorCode.NOT_FOUND);
      expect(error.message).toBe('Resource not found');
    });

    it('should create appropriate error for 500', () => {
      const error = SyftBoxError.fromHTTPError(500, 'Internal Server Error');
      expect(error.code).toBe(SyftBoxErrorCode.INTERNAL_ERROR);
      expect(error.message).toBe('Internal server error');
    });
  });

  describe('fromNetworkError', () => {
    it('should handle AbortError', () => {
      const originalError = new Error('Request was cancelled');
      originalError.name = 'AbortError';

      const error = SyftBoxError.fromNetworkError(originalError);
      expect(error.code).toBe(SyftBoxErrorCode.TIMEOUT);
    });

    it('should handle network errors', () => {
      const originalError = new Error('fetch failed');

      const error = SyftBoxError.fromNetworkError(originalError);
      expect(error.code).toBe(SyftBoxErrorCode.NETWORK_ERROR);
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable errors', () => {
      const error = new SyftBoxError(SyftBoxErrorCode.NETWORK_ERROR, 'Network error');
      expect(error.isRetryable()).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const error = new SyftBoxError(SyftBoxErrorCode.AUTHENTICATION_FAILED, 'Auth failed');
      expect(error.isRetryable()).toBe(false);
    });
  });

  describe('isAuthError', () => {
    it('should return true for auth errors', () => {
      const error = new SyftBoxError(SyftBoxErrorCode.TOKEN_EXPIRED, 'Token expired');
      expect(error.isAuthError()).toBe(true);
    });

    it('should return false for non-auth errors', () => {
      const error = new SyftBoxError(SyftBoxErrorCode.NETWORK_ERROR, 'Network error');
      expect(error.isAuthError()).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should serialize error to JSON', () => {
      const error = new SyftBoxError(SyftBoxErrorCode.INVALID_REQUEST, 'Invalid request', {
        field: 'email',
      });

      const json = error.toJSON();
      expect(json).toMatchObject({
        name: 'SyftBoxError',
        code: SyftBoxErrorCode.INVALID_REQUEST,
        message: 'Invalid request',
        details: { field: 'email' },
        timestamp: expect.any(String),
      });
    });
  });

  describe('getUserMessage', () => {
    it('should return user-friendly message for auth errors', () => {
      const error = new SyftBoxError(SyftBoxErrorCode.AUTHENTICATION_FAILED, 'Auth failed');
      expect(error.getUserMessage()).toBe('Please check your credentials and try again.');
    });

    it('should return original message for unknown errors', () => {
      const error = new SyftBoxError(SyftBoxErrorCode.UNKNOWN_ERROR, 'Something went wrong');
      expect(error.getUserMessage()).toBe('Something went wrong');
    });
  });
});
