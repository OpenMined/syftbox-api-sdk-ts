import { RPCService } from '../../services/rpc';
import { HTTPClient } from '../../http/client';
import { MessageRequest, PollObjectRequest, SendResult, PollResult } from '../../types';
import { SyftBoxError, SyftBoxErrorCode } from '../../errors';

// Mock HTTP client
const mockHttpClient = {
  request: jest.fn(),
} as unknown as HTTPClient;

describe('RPCService', () => {
  let service: RPCService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RPCService(mockHttpClient);
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('sendMessage', () => {
    const validRequest: MessageRequest = {
      syftURL: { user: 'test', domain: 'example.com', path: 'endpoint' },
      from: 'sender@example.com',
      method: 'POST',
      timeout: 5000,
    };

    it('should send message successfully', async () => {
      const mockResponse: SendResult = {
        status: 200,
        requestId: 'req-123',
        response: { data: 'test' },
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.sendMessage(validRequest, { test: 'data' });

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.request).toHaveBeenCalledWith({
        method: 'POST',
        url: expect.stringContaining('/api/v1/send/msg'),
        data: { test: 'data' },
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should handle raw message sending', async () => {
      const rawRequest = { ...validRequest, asRaw: true };
      const mockResponse: SendResult = {
        status: 200,
        requestId: 'req-123',
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      await service.sendMessage(rawRequest, 'raw data');

      expect(mockHttpClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/octet-stream',
          }),
        }),
      );
    });

    it('should validate request parameters', async () => {
      const invalidRequest = { ...validRequest, from: '' };

      await expect(service.sendMessage(invalidRequest)).rejects.toThrow(SyftBoxError);
      await expect(service.sendMessage(invalidRequest)).rejects.toThrow('valid "from" field');
    });

    it('should handle HTTP errors', async () => {
      (mockHttpClient.request as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(service.sendMessage(validRequest)).rejects.toThrow(SyftBoxError);
      await expect(service.sendMessage(validRequest)).rejects.toThrow('Failed to send RPC message');
    });
  });

  describe('pollForResponse', () => {
    const validPollRequest: PollObjectRequest = {
      requestId: 'req-123',
      from: 'sender@example.com',
      syftURL: { user: 'test', domain: 'example.com', path: 'endpoint' },
    };

    it('should poll for response successfully', async () => {
      const mockResponse: PollResult = {
        status: 200,
        requestId: 'req-123',
        response: { result: 'success' },
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.pollForResponse(validPollRequest);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.request).toHaveBeenCalledWith({
        method: 'GET',
        url: expect.stringContaining('/api/v1/send/poll'),
        signal: expect.any(AbortSignal),
      });
    });

    it('should deduplicate concurrent polls for same request', async () => {
      const mockResponse: PollResult = {
        status: 200,
        requestId: 'req-123',
        response: { result: 'success' },
      };

      (mockHttpClient.request as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockResponse), 100)),
      );

      // Start two concurrent polls for the same request
      const promise1 = service.pollForResponse(validPollRequest);
      const promise2 = service.pollForResponse(validPollRequest);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(mockResponse);
      expect(result2).toEqual(mockResponse);
      // HTTP client should only be called once due to deduplication
      expect(mockHttpClient.request).toHaveBeenCalledTimes(1);
    });

    it('should handle poll cancellation', async () => {
      (mockHttpClient.request as jest.Mock).mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new DOMException('Aborted', 'AbortError')), 50);
          }),
      );

      const pollPromise = service.pollForResponse(validPollRequest);

      // Cancel the poll
      setTimeout(() => service.cancelPoll('req-123'), 10);

      await expect(pollPromise).rejects.toThrow(SyftBoxError);
      await expect(pollPromise).rejects.toThrow('cancelled');
    });

    it('should validate poll request parameters', async () => {
      const invalidRequest = { ...validPollRequest, requestId: '' };

      await expect(service.pollForResponse(invalidRequest)).rejects.toThrow(SyftBoxError);
      await expect(service.pollForResponse(invalidRequest)).rejects.toThrow(
        'valid "requestId" field',
      );
    });
  });

  describe('sendAndWait', () => {
    const validRequest: MessageRequest = {
      syftURL: { user: 'test', domain: 'example.com', path: 'endpoint' },
      from: 'sender@example.com',
    };

    it('should return immediate response when available', async () => {
      const mockSendResult: SendResult = {
        status: 200,
        requestId: 'req-123',
        response: { immediate: 'response' },
      };

      (mockHttpClient.request as jest.Mock).mockResolvedValue(mockSendResult);

      const result = await service.sendAndWait(validRequest);

      expect(result).toEqual({ immediate: 'response' });
      expect(mockHttpClient.request).toHaveBeenCalledTimes(1); // Only send, no poll
    });

    it('should poll when no immediate response', async () => {
      const mockSendResult: SendResult = {
        status: 202,
        requestId: 'req-123',
        pollURL: '/poll-url',
      };

      const mockPollResult: PollResult = {
        status: 200,
        requestId: 'req-123',
        response: { polled: 'response' },
      };

      (mockHttpClient.request as jest.Mock)
        .mockResolvedValueOnce(mockSendResult) // Send
        .mockResolvedValueOnce(mockPollResult); // Poll

      const result = await service.sendAndWait(validRequest);

      expect(result).toEqual({ polled: 'response' });
      expect(mockHttpClient.request).toHaveBeenCalledTimes(2); // Send + Poll
    });

    it('should retry polling on timeout', async () => {
      const mockSendResult: SendResult = {
        status: 202,
        requestId: 'req-123',
        pollURL: '/poll-url',
      };

      const mockPollResult: PollResult = {
        status: 200,
        requestId: 'req-123',
        response: { final: 'response' },
      };

      (mockHttpClient.request as jest.Mock)
        .mockResolvedValueOnce(mockSendResult) // Send
        .mockRejectedValueOnce(new SyftBoxError(SyftBoxErrorCode.RPC_TIMEOUT, 'Timeout')) // First poll fails
        .mockResolvedValueOnce(mockPollResult); // Second poll succeeds

      const result = await service.sendAndWait(validRequest, undefined, {
        maxPollAttempts: 3,
        pollInterval: 10,
      });

      expect(result).toEqual({ final: 'response' });
      expect(mockHttpClient.request).toHaveBeenCalledTimes(3); // Send + 2 Polls
    });

    it('should respect timeout option', async () => {
      const mockSendResult: SendResult = {
        status: 202,
        requestId: 'req-123',
        pollURL: '/poll-url',
      };

      (mockHttpClient.request as jest.Mock)
        .mockResolvedValueOnce(mockSendResult) // Send
        .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000))); // Slow poll

      await expect(service.sendAndWait(validRequest, undefined, { timeout: 50 })).rejects.toThrow(
        'timed out',
      );
    });

    it('should handle maximum poll attempts exceeded', async () => {
      const mockSendResult: SendResult = {
        status: 202,
        requestId: 'req-123',
        pollURL: '/poll-url',
      };

      (mockHttpClient.request as jest.Mock)
        .mockResolvedValueOnce(mockSendResult) // Send
        .mockRejectedValue(new SyftBoxError(SyftBoxErrorCode.RPC_TIMEOUT, 'Timeout')); // All polls fail

      await expect(
        service.sendAndWait(validRequest, undefined, {
          maxPollAttempts: 2,
          pollInterval: 10,
        }),
      ).rejects.toThrow('Maximum poll attempts exceeded');
    });
  });

  describe('utility methods', () => {
    it('should track pending requests', async () => {
      const mockSendResult: SendResult = {
        status: 202,
        requestId: 'req-123',
        pollURL: '/poll-url',
      };

      (mockHttpClient.request as jest.Mock)
        .mockResolvedValueOnce(mockSendResult)
        .mockImplementation(() => new Promise(() => {})); // Never resolves

      const pollRequest: PollObjectRequest = {
        requestId: 'req-123',
        from: 'test@example.com',
        syftURL: { user: 'test', domain: 'example.com', path: 'endpoint' },
      };

      // Start polling
      service.pollForResponse(pollRequest);

      expect(service.getPendingRequests()).toContain('req-123');

      // Cancel poll
      service.cancelPoll('req-123');

      expect(service.getPendingRequests()).not.toContain('req-123');
    });

    it('should cleanup all pending requests', async () => {
      const mockSendResult: SendResult = {
        status: 202,
        requestId: 'req-123',
        pollURL: '/poll-url',
      };

      (mockHttpClient.request as jest.Mock)
        .mockResolvedValue(mockSendResult)
        .mockImplementation(() => new Promise(() => {})); // Never resolves

      const pollRequest: PollObjectRequest = {
        requestId: 'req-123',
        from: 'test@example.com',
        syftURL: { user: 'test', domain: 'example.com', path: 'endpoint' },
      };

      // Start multiple polls
      service.pollForResponse({ ...pollRequest, requestId: 'req-1' });
      service.pollForResponse({ ...pollRequest, requestId: 'req-2' });

      expect(service.getPendingRequests()).toHaveLength(2);

      service.cleanup();

      expect(service.getPendingRequests()).toHaveLength(0);
    });
  });
});
