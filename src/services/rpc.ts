import { HTTPClient } from '../http/client';
import { HTTPMethod } from '../http/types';
import { MessageRequest, PollObjectRequest, SendResult, PollResult } from '../types';
import { SyftBoxError, SyftBoxErrorCode } from '../errors';
import { SyftBoxURLParser } from '../utils/url';
import { utils } from '../utils';

export interface IRPCService {
  sendMessage(request: MessageRequest, body?: unknown): Promise<SendResult>;
  pollForResponse(request: PollObjectRequest): Promise<PollResult>;
  sendAndWait(
    request: MessageRequest,
    body?: unknown,
    options?: SendAndWaitOptions,
  ): Promise<unknown>;
  cancelPoll(requestId: string): void;
  getPendingRequests(): string[];
}

export interface SendAndWaitOptions {
  maxPollAttempts?: number;
  pollInterval?: number;
  timeout?: number;
}

interface PendingPoll {
  requestId: string;
  promise: Promise<PollResult>;
  abortController: AbortController;
}

export class RPCService implements IRPCService {
  private readonly pendingPolls = new Map<string, PendingPoll>();

  constructor(private readonly httpClient: HTTPClient) {}

  async sendMessage(request: MessageRequest, body?: unknown): Promise<SendResult> {
    this.validateMessageRequest(request);

    const params = this.buildSendParams(request);

    try {
      const response = await this.httpClient.request<SendResult>({
        method: (request.method || 'POST') as HTTPMethod,
        url: `/api/v1/send/msg?${params}`,
        data: body,
        headers: {
          ...request.headers,
          'Content-Type': request.asRaw ? 'application/octet-stream' : 'application/json',
        },
      });

      return response;
    } catch (error) {
      if (error instanceof SyftBoxError) {
        throw new SyftBoxError(
          SyftBoxErrorCode.RPC_ERROR,
          `Failed to send RPC message: ${error.message}`,
          { request, body },
          error,
        );
      }
      throw new SyftBoxError(
        SyftBoxErrorCode.RPC_ERROR,
        'Failed to send RPC message',
        { request, body },
        error as Error,
      );
    }
  }

  async pollForResponse(request: PollObjectRequest): Promise<PollResult> {
    this.validatePollRequest(request);

    // Check if there's already a pending poll for this request
    const existingPoll = this.pendingPolls.get(request.requestId);
    if (existingPoll) {
      return existingPoll.promise;
    }

    const abortController = new AbortController();
    const params = this.buildPollParams(request);

    const pollPromise = this.performPoll(params, abortController.signal, request);

    // Store the pending poll
    this.pendingPolls.set(request.requestId, {
      requestId: request.requestId,
      promise: pollPromise,
      abortController,
    });

    try {
      const result = await pollPromise;
      return result;
    } finally {
      this.pendingPolls.delete(request.requestId);
    }
  }

  async sendAndWait(
    request: MessageRequest,
    body?: unknown,
    options: SendAndWaitOptions = {},
  ): Promise<unknown> {
    const { maxPollAttempts = 10, pollInterval = 1000, timeout = 60000 } = options;

    // Set overall timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new SyftBoxError(SyftBoxErrorCode.RPC_TIMEOUT, 'RPC operation timed out', {
            timeout,
            request,
          }),
        );
      }, timeout);
    });

    const operationPromise = this.performSendAndWait(request, body, maxPollAttempts, pollInterval);

    try {
      return await Promise.race([operationPromise, timeoutPromise]);
    } catch (error) {
      // Cancel any pending polls
      if (error instanceof SyftBoxError && error.details && 
          typeof error.details === 'object' && 
          'sendResult' in error.details &&
          (error.details as any).sendResult?.requestId) {
        this.cancelPoll((error.details as any).sendResult.requestId);
      }
      throw error;
    }
  }

  cancelPoll(requestId: string): void {
    const pendingPoll = this.pendingPolls.get(requestId);
    if (pendingPoll) {
      pendingPoll.abortController.abort();
      this.pendingPolls.delete(requestId);
    }
  }

  getPendingRequests(): string[] {
    return Array.from(this.pendingPolls.keys());
  }

  private async performSendAndWait(
    request: MessageRequest,
    body: unknown,
    maxPollAttempts: number,
    pollInterval: number,
  ): Promise<unknown> {
    // Send the message
    const sendResult = await this.sendMessage(request, body);

    // If we got an immediate response, return it
    if (sendResult.response) {
      return sendResult.response;
    }

    // Otherwise, poll for response
    const pollRequest: PollObjectRequest = {
      requestId: sendResult.requestId,
      from: request.from,
      syftURL: request.syftURL,
      timeout: request.timeout,
      asRaw: request.asRaw,
    };

    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      try {
        const pollResult = await this.pollForResponse(pollRequest);
        if (pollResult.response) {
          return pollResult.response;
        }
      } catch (error) {
        if (error instanceof SyftBoxError) {
          // If it's a timeout error and we haven't exceeded max attempts, continue
          if (error.code === SyftBoxErrorCode.RPC_TIMEOUT && attempt < maxPollAttempts - 1) {
            await utils.delay(pollInterval);
            continue;
          }

          // If it's a not found error, the request might have expired
          if (error.code === SyftBoxErrorCode.NOT_FOUND) {
            throw new SyftBoxError(
              SyftBoxErrorCode.RPC_ERROR,
              'RPC request not found or expired',
              { requestId: sendResult.requestId, attempt },
              error,
            );
          }
        }

        // For non-timeout errors or the last attempt, re-throw
        if (
          !(error instanceof SyftBoxError && error.code === SyftBoxErrorCode.RPC_TIMEOUT) ||
          attempt === maxPollAttempts - 1
        ) {
          // On last attempt, let it fall through to "Maximum poll attempts exceeded"
          if (attempt === maxPollAttempts - 1) {
            break;
          }
          throw error;
        }

        // Wait before retrying
        await utils.delay(pollInterval * (attempt + 1));
      }
    }

    throw new SyftBoxError(SyftBoxErrorCode.RPC_TIMEOUT, 'Maximum poll attempts exceeded', {
      requestId: sendResult.requestId,
      maxPollAttempts,
    });
  }

  private async performPoll(
    params: string,
    signal: AbortSignal,
    request: PollObjectRequest,
  ): Promise<PollResult> {
    try {
      const response = await this.httpClient.request<PollResult>({
        method: 'GET',
        url: `/api/v1/send/poll?${params}`,
        signal,
      });

      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new SyftBoxError(SyftBoxErrorCode.RPC_ERROR, 'Poll request was cancelled', {
          requestId: request.requestId,
        });
      }

      if (error instanceof SyftBoxError) {
        // Map specific error codes
        if (error.code === SyftBoxErrorCode.TIMEOUT) {
          throw new SyftBoxError(
            SyftBoxErrorCode.RPC_TIMEOUT,
            'Poll request timed out',
            { requestId: request.requestId },
            error,
          );
        }

        if (error.code === SyftBoxErrorCode.RPC_TIMEOUT) {
          // Preserve RPC_TIMEOUT errors for retry logic
          throw error;
        }

        if (error.code === SyftBoxErrorCode.NOT_FOUND) {
          throw new SyftBoxError(
            SyftBoxErrorCode.RPC_POLL_FAILED,
            'RPC request not found',
            { requestId: request.requestId },
            error,
          );
        }

        throw new SyftBoxError(
          SyftBoxErrorCode.RPC_POLL_FAILED,
          `Failed to poll for response: ${error.message}`,
          { requestId: request.requestId },
          error,
        );
      }

      throw new SyftBoxError(
        SyftBoxErrorCode.RPC_POLL_FAILED,
        'Failed to poll for response',
        { requestId: request.requestId },
        error as Error,
      );
    }
  }

  private buildSendParams(request: MessageRequest): string {
    const params = new URLSearchParams();

    params.set('x-syft-url', SyftBoxURLParser.stringify(request.syftURL));
    params.set('x-syft-from', request.from);

    if (request.timeout !== undefined) {
      params.set('timeout', request.timeout.toString());
    }

    if (request.asRaw !== undefined) {
      params.set('x-syft-raw', request.asRaw.toString());
    }

    return params.toString();
  }

  private buildPollParams(request: PollObjectRequest): string {
    const params = new URLSearchParams();

    params.set('x-syft-request-id', request.requestId);
    params.set('x-syft-from', request.from);
    params.set('x-syft-url', SyftBoxURLParser.stringify(request.syftURL));

    if (request.timeout !== undefined) {
      params.set('timeout', request.timeout.toString());
    }

    if (request.asRaw !== undefined) {
      params.set('x-syft-raw', request.asRaw.toString());
    }

    return params.toString();
  }

  private validateMessageRequest(request: MessageRequest): void {
    utils.validateRequiredString(request.from, 'Message request "from" field', { request });

    if (!request.syftURL) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        'Message request must have a valid "syftURL" field',
        { request },
      );
    }

    try {
      SyftBoxURLParser.validate(request.syftURL);
    } catch (error) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        'Invalid SyftBox URL in message request',
        { request, syftURL: request.syftURL },
        error as Error,
      );
    }

    if (request.timeout !== undefined) {
      utils.validateNumberRange(request.timeout, 'Timeout', 0, 300000, {
        request,
        timeout: request.timeout,
      });
    }
  }

  private validatePollRequest(request: PollObjectRequest): void {
    utils.validateRequiredString(request.requestId, 'Poll request "requestId" field', { request });
    utils.validateRequiredString(request.from, 'Poll request "from" field', { request });

    if (!request.syftURL) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        'Poll request must have a valid "syftURL" field',
        { request },
      );
    }

    try {
      SyftBoxURLParser.validate(request.syftURL);
    } catch (error) {
      throw new SyftBoxError(
        SyftBoxErrorCode.INVALID_REQUEST,
        'Invalid SyftBox URL in poll request',
        { request, syftURL: request.syftURL },
        error as Error,
      );
    }
  }

  // Cleanup method to cancel all pending polls
  cleanup(): void {
    for (const [, pendingPoll] of this.pendingPolls) {
      pendingPoll.abortController.abort();
    }
    this.pendingPolls.clear();
  }
}
