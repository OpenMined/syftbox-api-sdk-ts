import { HTTPClient } from '../http/client';
import { AuthTokens, OTPRequest, OTPVerification, RefreshRequest } from '../types';
import { ITokenStorage, LocalStorageTokenStorage } from '../utils/storage';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';
import { utils } from '../utils';

export interface IAuthService {
  requestOTP(email: string): Promise<void>;
  verifyOTP(email: string, code: string): Promise<AuthTokens>;
  refreshToken(refreshToken?: string): Promise<AuthTokens>;
  logout(): Promise<void>;
  isAuthenticated(): boolean;
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  getCurrentUser(): string | null;
  ensureValidToken(): Promise<string>;
}

export class AuthenticationManager implements IAuthService {
  private tokens: AuthTokens | null = null;
  private refreshPromise: Promise<AuthTokens> | null = null;
  private currentUser: string | null = null;

  constructor(
    private readonly httpClient: HTTPClient,
    private readonly tokenStorage: ITokenStorage = new LocalStorageTokenStorage(),
  ) {
    this.loadTokensFromStorage();
  }

  async requestOTP(email: string): Promise<void> {
    if (!utils.isValidEmail(email)) {
      throw new SyftBoxError(SyftBoxErrorCode.INVALID_REQUEST, 'Invalid email format', { email });
    }

    const request: OTPRequest = { email };

    try {
      await this.httpClient.request<void>({
        method: 'POST',
        url: '/auth/otp/request',
        data: request,
      });
    } catch (error) {
      utils.preserveOrWrapError(error, SyftBoxErrorCode.OTP_REQUIRED, 'Failed to request OTP', {
        email,
      });
      throw error; // TypeScript needs this even though preserveOrWrapError never returns
    }
  }

  async verifyOTP(email: string, code: string): Promise<AuthTokens> {
    if (!utils.isValidEmail(email)) {
      throw new SyftBoxError(SyftBoxErrorCode.INVALID_REQUEST, 'Invalid email format', { email });
    }

    if (!code || code.length === 0) {
      throw new SyftBoxError(SyftBoxErrorCode.INVALID_REQUEST, 'OTP code is required', { email });
    }

    const request: OTPVerification = { email, code };

    try {
      const tokens = await this.httpClient.request<AuthTokens>({
        method: 'POST',
        url: '/auth/otp/verify',
        data: request,
      });

      this.setTokens(tokens);
      this.currentUser = email;

      return tokens;
    } catch (error) {
      if (error instanceof SyftBoxError) {
        // Map specific error codes
        if (error.code === SyftBoxErrorCode.AUTHENTICATION_FAILED) {
          throw new SyftBoxError(
            SyftBoxErrorCode.OTP_INVALID,
            'Invalid OTP code',
            { email },
            error,
          );
        }
        throw error;
      }
      utils.wrapError(error, SyftBoxErrorCode.OTP_INVALID, 'Failed to verify OTP', { email });
      throw error; // TypeScript needs this even though wrapError never returns
    }
  }

  async refreshToken(refreshToken?: string): Promise<AuthTokens> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const tokenToRefresh = refreshToken ?? this.tokens?.refreshToken;

    if (!tokenToRefresh) {
      throw new SyftBoxError(SyftBoxErrorCode.TOKEN_EXPIRED, 'No refresh token available');
    }

    this.refreshPromise = this.performTokenRefresh(tokenToRefresh);

    try {
      const tokens = await this.refreshPromise;
      this.setTokens(tokens);
      return tokens;
    } catch (error) {
      this.clearTokens();
      throw error;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(refreshToken: string): Promise<AuthTokens> {
    const request: RefreshRequest = { refreshToken };

    try {
      const tokens = await this.httpClient.request<AuthTokens>({
        method: 'POST',
        url: '/auth/refresh',
        data: request,
      });

      return tokens;
    } catch (error) {
      if (error instanceof SyftBoxError) {
        if (error.code === SyftBoxErrorCode.AUTHENTICATION_FAILED) {
          throw new SyftBoxError(
            SyftBoxErrorCode.TOKEN_EXPIRED,
            'Refresh token is invalid or expired',
            undefined,
            error,
          );
        }
        throw error;
      }
      utils.wrapError(error, SyftBoxErrorCode.TOKEN_EXPIRED, 'Failed to refresh token');
      throw error; // TypeScript needs this even though wrapError never returns
    }
  }

  async logout(): Promise<void> {
    this.clearTokens();
    this.currentUser = null;

    // Note: The server doesn't have a logout endpoint in the documented API
    // so we just clear local tokens
  }

  isAuthenticated(): boolean {
    const tokens = this.getTokens();
    if (!tokens) return false;

    // Check if access token is expired (basic check)
    try {
      const payload = this.parseJWTPayload(tokens.accessToken);
      const now = Math.floor(Date.now() / 1000);

      // If token expires within next 30 seconds, consider it expired
      return typeof payload.exp === 'number' && payload.exp > now + 30;
    } catch {
      return false;
    }
  }

  getAccessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  getRefreshToken(): string | null {
    return this.tokens?.refreshToken ?? null;
  }

  getCurrentUser(): string | null {
    if (this.currentUser) {
      return this.currentUser;
    }

    // Try to extract user from access token
    try {
      const accessToken = this.getAccessToken();
      if (accessToken) {
        const payload = this.parseJWTPayload(accessToken);
        this.currentUser =
          (typeof payload.sub === 'string' ? payload.sub : null) ||
          (typeof payload.email === 'string' ? payload.email : null) ||
          null;
        return this.currentUser;
      }
    } catch {
      // Ignore errors in JWT parsing
    }

    return null;
  }

  private setTokens(tokens: AuthTokens): void {
    this.tokens = { ...tokens };
    this.tokenStorage.setTokens(tokens);
  }

  private getTokens(): AuthTokens | null {
    return this.tokens;
  }

  private clearTokens(): void {
    this.tokens = null;
    this.tokenStorage.clearTokens();
  }

  private loadTokensFromStorage(): void {
    try {
      const tokens = this.tokenStorage.getTokens();
      if (tokens) {
        this.tokens = tokens;
        this.currentUser = this.getCurrentUser();
      }
    } catch (error) {
      console.warn('Failed to load tokens from storage:', error);
      this.clearTokens();
    }
  }

  private parseJWTPayload(token: string): Record<string, unknown> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const payload = parts[1];
    if (!payload) {
      throw new Error('Invalid JWT payload');
    }
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as Record<string, unknown>;
  }

  // Method to check if token needs refresh
  public shouldRefreshToken(): boolean {
    const tokens = this.getTokens();
    if (!tokens) return false;

    try {
      const payload = this.parseJWTPayload(tokens.accessToken);
      const now = Math.floor(Date.now() / 1000);

      // Refresh if token expires within next 5 minutes
      return typeof payload.exp === 'number' && payload.exp < now + 300;
    } catch {
      return true; // If we can't parse the token, try to refresh
    }
  }

  // Automatic token refresh if needed
  public async ensureValidToken(): Promise<string> {
    if (!this.isAuthenticated()) {
      throw new SyftBoxError(SyftBoxErrorCode.AUTHENTICATION_FAILED, 'User is not authenticated');
    }

    if (this.shouldRefreshToken()) {
      await this.refreshToken();
    }

    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new SyftBoxError(SyftBoxErrorCode.TOKEN_EXPIRED, 'No valid access token available');
    }

    return accessToken;
  }
}
