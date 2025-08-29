import { Message, MessageType } from '../types';
import { IAuthService } from './auth';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';
import { utils } from '../utils';

export interface WebSocketConfig {
  url: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  heartbeatInterval?: number;
  messageQueueSize?: number;
}

export interface IWebSocketService {
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  send(message: Message): void;
  getConnectionState(): WebSocketConnectionState;
  getReconnectAttempts(): number;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void;
  dispatchEvent(event: Event): boolean;
}

export enum WebSocketConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

export interface WebSocketEventMap {
  connected: CustomEvent<void>;
  disconnected: CustomEvent<{ code: number; reason: string }>;
  message: CustomEvent<Message>;
  error: CustomEvent<Error>;
  reconnecting: CustomEvent<{ attempt: number; maxAttempts: number }>;
  reconnected: CustomEvent<void>;
  reconnectFailed: CustomEvent<void>;
}

export class WebSocketService extends EventTarget implements IWebSocketService {
  private ws: WebSocket | null = null;
  private state: WebSocketConnectionState = WebSocketConnectionState.DISCONNECTED;
  private messageQueue: Message[] = [];
  private reconnectAttempts = 0;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private heartbeatIntervalId: NodeJS.Timeout | null = null;
  private readonly config: Required<WebSocketConfig>;

  constructor(
    config: WebSocketConfig,
    private readonly authService: IAuthService,
  ) {
    super();

    this.config = {
      url: config.url,
      autoConnect: config.autoConnect ?? false,
      reconnectAttempts: config.reconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 1000,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      messageQueueSize: config.messageQueueSize ?? 100,
    };

    if (this.config.autoConnect) {
      this.connect().catch(error => {
        console.warn('Auto-connect failed:', error);
      });
    }
  }

  async connect(): Promise<void> {
    if (
      this.state === WebSocketConnectionState.CONNECTING ||
      this.state === WebSocketConnectionState.CONNECTED
    ) {
      return;
    }

    // Check authentication
    if (!this.authService.isAuthenticated()) {
      throw new SyftBoxError(
        SyftBoxErrorCode.WEBSOCKET_AUTHENTICATION_FAILED,
        'Authentication required for WebSocket connection',
      );
    }

    try {
      this.setState(WebSocketConnectionState.CONNECTING);

      const token = await this.authService.ensureValidToken();
      const wsUrl = this.buildWebSocketURL(token);

      await this.establishConnection(wsUrl);

      this.reconnectAttempts = 0;
      this.setState(WebSocketConnectionState.CONNECTED);
      this.startHeartbeat();
      this.flushMessageQueue();

      this.dispatchEvent(new CustomEvent('connected'));

      if (this.reconnectAttempts > 0) {
        this.dispatchEvent(new CustomEvent('reconnected'));
      }
    } catch (error) {
      this.setState(WebSocketConnectionState.FAILED);

      utils.preserveOrWrapError(
        error,
        SyftBoxErrorCode.WEBSOCKET_CONNECTION_FAILED,
        'Failed to establish WebSocket connection',
      );
    }
  }

  disconnect(): void {
    this.clearReconnectTimeout();
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState(WebSocketConnectionState.DISCONNECTED);
    this.reconnectAttempts = 0;
    this.messageQueue = [];
  }

  isConnected(): boolean {
    return (
      this.state === WebSocketConnectionState.CONNECTED && this.ws?.readyState === WebSocket.OPEN
    );
  }

  send(message: Message): void {
    if (!this.isConnected()) {
      // Queue message if not connected
      if (this.messageQueue.length >= this.config.messageQueueSize) {
        this.messageQueue.shift(); // Remove oldest message
      }
      this.messageQueue.push(message);

      // Try to reconnect if not already trying
      if (this.state === WebSocketConnectionState.DISCONNECTED) {
        this.connect().catch(error => {
          console.warn('Failed to auto-reconnect for message sending:', error);
        });
      }
      return;
    }

    try {
      const messageStr = JSON.stringify(message);
      this.ws!.send(messageStr);
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: new SyftBoxError(
            SyftBoxErrorCode.WEBSOCKET_CONNECTION_FAILED,
            'Failed to send WebSocket message',
            { message },
            error as Error,
          ),
        }),
      );
    }
  }

  getConnectionState(): WebSocketConnectionState {
    return this.state;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  private buildWebSocketURL(token: string): string {
    const url = new URL('/api/v1/events', this.config.url);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

    // Add token as query parameter for WebSocket authentication
    // (since WebSocket doesn't support custom headers in browser)
    url.searchParams.set('token', token);

    return url.toString();
  }

  private establishConnection(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Use dynamic import for Node.js WebSocket support
        const WebSocketConstructor = this.getWebSocketConstructor();
        this.ws = new WebSocketConstructor(wsUrl);

        this.ws.onopen = () => {
          resolve();
        };

        this.ws.onmessage = event => {
          this.handleMessage(event);
        };

        this.ws.onclose = event => {
          this.handleClose(event);
        };

        this.ws.onerror = event => {
          this.handleError(event);
          reject(new Error('WebSocket connection error'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private getWebSocketConstructor(): typeof WebSocket {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined' && window.WebSocket) {
      return window.WebSocket;
    }

    // Check if we're in a web worker
    if (typeof self !== 'undefined' && (self as any).WebSocket) {
      return (self as any).WebSocket;
    }

    // Node.js environment - require ws package
    try {
      // Dynamic require to avoid bundling issues
      const ws = eval('require')('ws');
      return ws;
    } catch (error) {
      throw new SyftBoxError(
        SyftBoxErrorCode.WEBSOCKET_CONNECTION_FAILED,
        'WebSocket not available. Install "ws" package for Node.js environments.',
        undefined,
        error as Error,
      );
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as Message;
      this.dispatchEvent(new CustomEvent('message', { detail: message }));
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: new SyftBoxError(
            SyftBoxErrorCode.WEBSOCKET_CONNECTION_FAILED,
            'Failed to parse WebSocket message',
            { rawData: event.data },
            error as Error,
          ),
        }),
      );
    }
  }

  private handleClose(event: CloseEvent): void {
    this.stopHeartbeat();

    const wasConnected = this.state === WebSocketConnectionState.CONNECTED;

    this.dispatchEvent(
      new CustomEvent('disconnected', {
        detail: { code: event.code, reason: event.reason },
      }),
    );

    // Don't reconnect if it was a clean close (code 1000)
    if (event.code === 1000) {
      this.setState(WebSocketConnectionState.DISCONNECTED);
      return;
    }

    // Attempt reconnection if we were previously connected and haven't exceeded max attempts
    if (wasConnected && this.reconnectAttempts < this.config.reconnectAttempts) {
      this.attemptReconnection();
    } else {
      this.setState(WebSocketConnectionState.FAILED);
      if (this.reconnectAttempts >= this.config.reconnectAttempts) {
        this.dispatchEvent(new CustomEvent('reconnectFailed'));
      }
    }
  }

  private handleError(event: Event): void {
    const error = new SyftBoxError(
      SyftBoxErrorCode.WEBSOCKET_CONNECTION_FAILED,
      'WebSocket error occurred',
      { event },
    );

    this.dispatchEvent(new CustomEvent('error', { detail: error }));
  }

  private attemptReconnection(): void {
    this.setState(WebSocketConnectionState.RECONNECTING);
    this.reconnectAttempts++;

    this.dispatchEvent(
      new CustomEvent('reconnecting', {
        detail: {
          attempt: this.reconnectAttempts,
          maxAttempts: this.config.reconnectAttempts,
        },
      }),
    );

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxReconnectDelay,
    );

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect().catch(error => {
        console.warn(`Reconnection attempt ${this.reconnectAttempts} failed:`, error);
      });
    }, delay);
  }

  private setState(newState: WebSocketConnectionState): void {
    this.state = newState;
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()!;
      this.send(message);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatIntervalId = setInterval(() => {
      if (this.isConnected()) {
        // Send ping message
        const pingMessage: Message = {
          id: utils.generateId(),
          typ: MessageType.SYSTEM,
          dat: { type: 'ping', timestamp: Date.now() },
        };
        this.send(pingMessage);
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  // TypeScript event listener overrides for better type safety
  override addEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (event: WebSocketEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener as EventListenerOrEventListenerObject, options);
  }

  override removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (event: WebSocketEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener as EventListenerOrEventListenerObject, options);
  }
}
