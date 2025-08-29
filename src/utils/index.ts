export * from './url';
export * from './storage';

// Import error classes for utility functions
import { SyftBoxError, SyftBoxErrorCode } from '../errors';

/**
 * Utility functions
 */
export const utils = {
  /**
   * Delay execution for specified milliseconds
   */
  delay: (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Retry a function with exponential backoff
   */
  retry: async <T>(
    fn: () => Promise<T>,
    attempts: number = 3,
    delayMs: number = 1000,
    backoffFactor: number = 2,
  ): Promise<T> => {
    let lastError: Error;
    let currentDelay = delayMs;

    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (i === attempts - 1) {
          break; // Last attempt, don't wait
        }

        await utils.delay(currentDelay);
        currentDelay *= backoffFactor;
      }
    }

    throw lastError!;
  },

  /**
   * Retry a function with conditional retry and max delay cap
   */
  retryWithCondition: async <T>(
    fn: () => Promise<T>,
    options: {
      attempts?: number;
      delayMs?: number;
      backoffFactor?: number;
      maxDelay?: number;
      shouldRetry?: (error: Error) => boolean;
    } = {},
  ): Promise<T> => {
    const {
      attempts = 3,
      delayMs = 1000,
      backoffFactor = 2,
      maxDelay = 30000,
      shouldRetry = () => true,
    } = options;

    let lastError: Error;
    let currentDelay = delayMs;

    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (i === attempts - 1) {
          break; // Last attempt, don't wait
        }

        if (!shouldRetry(lastError)) {
          break; // Don't retry this error
        }

        await utils.delay(Math.min(currentDelay, maxDelay));
        currentDelay *= backoffFactor;
      }
    }

    throw lastError!;
  },

  /**
   * Validate email format
   */
  isValidEmail: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Generate a unique ID
   */
  generateId: (): string => {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Debounce function calls
   */
  debounce: <T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number,
  ): ((...args: Parameters<T>) => void) => {
    let timeout: NodeJS.Timeout;

    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  },

  /**
   * Throttle function calls
   */
  throttle: <T extends (...args: unknown[]) => unknown>(
    func: T,
    limit: number,
  ): ((...args: Parameters<T>) => void) => {
    let inThrottle: boolean;

    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },

  /**
   * Check if code is running in browser environment
   */
  isBrowser: (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined',

  /**
   * Check if code is running in Node.js environment
   */
  isNode: (): boolean => typeof process !== 'undefined' && process.versions?.node !== undefined,

  /**
   * Check if code is running in web worker
   */
  isWebWorker: (): boolean =>
    typeof self !== 'undefined' && typeof (self as any).importScripts === 'function',

  /**
   * Deep clone an object
   */
  deepClone: <T>(obj: T): T => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as T;
    }

    if (obj instanceof Array) {
      return obj.map(item => utils.deepClone(item)) as T;
    }

    if (typeof obj === 'object') {
      const cloned = {} as T;
      Object.keys(obj).forEach(key => {
        (cloned as Record<string, unknown>)[key] = utils.deepClone(
          (obj as Record<string, unknown>)[key],
        );
      });
      return cloned;
    }

    return obj;
  },

  /**
   * Safe JSON parse with fallback
   */
  safeJsonParse: <T>(str: string, fallback: T): T => {
    try {
      return JSON.parse(str) as T;
    } catch {
      return fallback;
    }
  },

  /**
   * Convert bytes to human readable format
   */
  formatBytes: (bytes: number, decimals: number = 2): string => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  },

  /**
   * Handle service errors with consistent pattern
   * Preserves SyftBoxError as-is, wraps other errors
   */
  preserveOrWrapError: (
    error: unknown,
    fallbackCode: SyftBoxErrorCode,
    fallbackMessage: string,
    details?: unknown,
  ): never => {
    if (error instanceof SyftBoxError) {
      throw error;
    }
    throw new SyftBoxError(fallbackCode, fallbackMessage, details, error as Error);
  },

  /**
   * Wrap any error with additional context
   * Always creates new SyftBoxError with context
   */
  wrapError: (error: unknown, code: SyftBoxErrorCode, message: string, details?: unknown): never => {
    if (error instanceof SyftBoxError) {
      throw new SyftBoxError(code, `${message}: ${error.message}`, details, error);
    }
    const errorObj = error as Error;
    throw new SyftBoxError(code, message, details, errorObj);
  },

  /**
   * Validate that a value is a non-empty string
   */
  validateRequiredString: (value: unknown, fieldName: string, details?: unknown): void => {
    if (!value || typeof value !== 'string') {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        `${fieldName} must be a non-empty string`,
        details || { [fieldName]: value },
      );
    }
  },

  /**
   * Validate string length constraints
   */
  validateStringLength: (
    value: string,
    fieldName: string,
    maxLength: number,
    details?: unknown,
  ): void => {
    if (value.length > maxLength) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        `${fieldName} is too long (maximum ${maxLength} characters)`,
        details || { [fieldName]: value, length: value.length, maxLength },
      );
    }
  },

  /**
   * Validate that a string doesn't contain invalid characters
   */
  validateStringCharacters: (
    value: string,
    fieldName: string,
    invalidChars: string[],
    details?: unknown,
  ): void => {
    for (const char of invalidChars) {
      if (value.includes(char)) {
        throw new SyftBoxError(
          SyftBoxErrorCode.INVALID_REQUEST,
          `${fieldName} contains invalid characters`,
          details || { [fieldName]: value, invalidChar: char },
        );
      }
    }
  },

  /**
   * Validate numeric range
   */
  validateNumberRange: (
    value: number,
    fieldName: string,
    min: number,
    max: number,
    details?: unknown,
  ): void => {
    if (value < min || value > max) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        `${fieldName} must be between ${min} and ${max}`,
        details || { [fieldName]: value, min, max },
      );
    }
  },
};
