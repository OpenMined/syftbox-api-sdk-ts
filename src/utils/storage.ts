import { AuthTokens } from '../types';

/**
 * Interface for token storage implementations
 */
export interface ITokenStorage {
  getTokens(): AuthTokens | null;
  setTokens(tokens: AuthTokens): void;
  clearTokens(): void;
}

/**
 * Local storage implementation for browsers
 */
export class LocalStorageTokenStorage implements ITokenStorage {
  private readonly tokenKey = 'syftbox_auth_tokens';

  getTokens(): AuthTokens | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }

      const stored = localStorage.getItem(this.tokenKey);
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored) as AuthTokens;

      // Validate token structure
      if (!parsed.accessToken || !parsed.refreshToken) {
        this.clearTokens();
        return null;
      }

      return parsed;
    } catch {
      this.clearTokens();
      return null;
    }
  }

  setTokens(tokens: AuthTokens): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      localStorage.setItem(this.tokenKey, JSON.stringify(tokens));
    } catch (error) {
      console.warn('Failed to store tokens in localStorage:', error);
    }
  }

  clearTokens(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      localStorage.removeItem(this.tokenKey);
    } catch (error) {
      console.warn('Failed to clear tokens from localStorage:', error);
    }
  }
}

/**
 * Memory storage implementation (tokens lost on page refresh)
 */
export class MemoryTokenStorage implements ITokenStorage {
  private tokens: AuthTokens | null = null;

  getTokens(): AuthTokens | null {
    return this.tokens;
  }

  setTokens(tokens: AuthTokens): void {
    this.tokens = { ...tokens };
  }

  clearTokens(): void {
    this.tokens = null;
  }
}

/**
 * Session storage implementation for browsers
 */
export class SessionStorageTokenStorage implements ITokenStorage {
  private readonly tokenKey = 'syftbox_auth_tokens';

  getTokens(): AuthTokens | null {
    try {
      if (typeof sessionStorage === 'undefined') {
        return null;
      }

      const stored = sessionStorage.getItem(this.tokenKey);
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored) as AuthTokens;

      // Validate token structure
      if (!parsed.accessToken || !parsed.refreshToken) {
        this.clearTokens();
        return null;
      }

      return parsed;
    } catch {
      this.clearTokens();
      return null;
    }
  }

  setTokens(tokens: AuthTokens): void {
    try {
      if (typeof sessionStorage === 'undefined') {
        return;
      }

      sessionStorage.setItem(this.tokenKey, JSON.stringify(tokens));
    } catch (error) {
      console.warn('Failed to store tokens in sessionStorage:', error);
    }
  }

  clearTokens(): void {
    try {
      if (typeof sessionStorage === 'undefined') {
        return;
      }

      sessionStorage.removeItem(this.tokenKey);
    } catch (error) {
      console.warn('Failed to clear tokens from sessionStorage:', error);
    }
  }
}
