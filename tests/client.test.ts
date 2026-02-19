import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BillionVerify } from '../src/client.js';
import {
  AuthenticationError,
  RateLimitError,
  ValidationError,
  InsufficientCreditsError,
  NotFoundError,
  TimeoutError,
} from '../src/errors.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('BillionVerify Client', () => {
  let client: BillionVerify;

  beforeEach(() => {
    client = new BillionVerify({ apiKey: 'test-api-key' });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw AuthenticationError when API key is missing', () => {
      expect(() => new BillionVerify({ apiKey: '' })).toThrow(AuthenticationError);
    });

    it('should create client with default options', () => {
      const client = new BillionVerify({ apiKey: 'test-key' });
      expect(client).toBeInstanceOf(BillionVerify);
    });

    it('should create client with custom options', () => {
      const client = new BillionVerify({
        apiKey: 'test-key',
        baseUrl: 'https://custom.api.com',
        timeout: 60000,
        retries: 5,
      });
      expect(client).toBeInstanceOf(BillionVerify);
    });
  });

  describe('verify', () => {
    it('should verify a single email successfully', async () => {
      const mockApiResponse = {
        success: true,
        code: '0',
        message: 'Success',
        data: {
          email: 'test@example.com',
          status: 'valid',
          score: 0.95,
          is_deliverable: true,
          is_disposable: false,
          is_catchall: false,
          is_role: false,
          is_free: false,
          domain: 'example.com',
          domain_age: 10,
          mx_records: ['mail.example.com'],
          smtp_check: true,
          reason: 'accepted',
          response_time: 250,
          credits_used: 1,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const result = await client.verify('test@example.com');

      expect(result.email).toBe('test@example.com');
      expect(result.status).toBe('valid');
      expect(result.is_deliverable).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.billionverify.com/v1/verify/single',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'EV-API-KEY': 'test-api-key',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            email: 'test@example.com',
            check_smtp: true,
          }),
        })
      );
    });

    it('should verify with custom options', async () => {
      const mockApiResponse = {
        success: true,
        code: '0',
        message: 'Success',
        data: {
          email: 'test@example.com',
          status: 'valid',
          score: 0.95,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      await client.verify('test@example.com', { checkSmtp: false });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.billionverify.com/v1/verify/single',
        expect.objectContaining({
          body: JSON.stringify({
            email: 'test@example.com',
            check_smtp: false,
          }),
        })
      );
    });

    it('should throw AuthenticationError on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: { code: 'INVALID_API_KEY', message: 'Invalid API key' },
        }),
      });

      await expect(client.verify('test@example.com')).rejects.toThrow(AuthenticationError);
    });

    it('should throw ValidationError on 400', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({
          error: { code: 'INVALID_EMAIL', message: 'Invalid email format' },
        }),
      });

      await expect(client.verify('invalid')).rejects.toThrow(ValidationError);
    });

    it('should throw InsufficientCreditsError on 402', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        json: async () => ({
          error: { code: 'INSUFFICIENT_CREDITS', message: 'Not enough credits' },
        }),
      });

      await expect(client.verify('test@example.com')).rejects.toThrow(InsufficientCreditsError);
    });

    it('should throw NotFoundError on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Resource not found' },
        }),
      });

      await expect(client.verify('test@example.com')).rejects.toThrow(NotFoundError);
    });

    it('should throw RateLimitError on 429 after retries exhausted', async () => {
      const rateLimitResponse = {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          get: () => '1',
        },
        json: async () => ({
          error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' },
        }),
      };

      // Mock multiple calls for retries
      mockFetch.mockResolvedValue(rateLimitResponse);

      const clientNoRetry = new BillionVerify({ apiKey: 'test-key', retries: 1 });
      await expect(clientNoRetry.verify('test@example.com')).rejects.toThrow(RateLimitError);
    });
  });

  describe('verifyBatch', () => {
    it('should verify batch of emails synchronously', async () => {
      const mockApiResponse = {
        success: true,
        code: '0',
        message: 'Success',
        data: {
          results: [
            { email: 'user1@example.com', status: 'valid', score: 0.95, is_deliverable: true, credits_used: 1 },
            { email: 'user2@example.com', status: 'invalid', score: 0.0, is_deliverable: false, credits_used: 0 },
            { email: 'user3@example.com', status: 'valid', score: 0.90, is_deliverable: true, credits_used: 1 },
          ],
          total_emails: 3,
          valid_emails: 2,
          invalid_emails: 1,
          credits_used: 2,
          process_time: 1500,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const result = await client.verifyBatch([
        'user1@example.com',
        'user2@example.com',
        'user3@example.com',
      ]);

      expect(result.total_emails).toBe(3);
      expect(result.valid_emails).toBe(2);
      expect(result.results).toHaveLength(3);
    });

    it('should throw ValidationError when emails exceed 50', async () => {
      const emails = Array(51).fill('test@example.com');
      await expect(client.verifyBatch(emails)).rejects.toThrow(ValidationError);
    });
  });

  describe('getFileJobStatus', () => {
    it('should get file job status successfully', async () => {
      const mockApiResponse = {
        success: true,
        code: '0',
        message: 'Success',
        data: {
          job_id: 'job_123',
          status: 'processing',
          file_name: 'emails.csv',
          total_emails: 100,
          processed_emails: 50,
          progress_percent: 50,
          valid_emails: 40,
          invalid_emails: 5,
          unknown_emails: 5,
          credits_used: 50,
          created_at: '2026-02-04T10:30:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const result = await client.getFileJobStatus('job_123');

      expect(result.job_id).toBe('job_123');
      expect(result.progress_percent).toBe(50);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.billionverify.com/v1/verify/file/job_123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should support long-polling timeout parameter', async () => {
      const mockApiResponse = {
        success: true,
        code: '0',
        message: 'Success',
        data: {
          job_id: 'job_123',
          status: 'completed',
          total_emails: 100,
          processed_emails: 100,
          progress_percent: 100,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      await client.getFileJobStatus('job_123', { timeout: 30 });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.billionverify.com/v1/verify/file/job_123?timeout=30',
        expect.any(Object)
      );
    });
  });

  describe('getFileJobResults', () => {
    it('should get file job results with filters', async () => {
      const csvContent = 'email,status,score\ntest@example.com,valid,0.95';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => csvContent,
      });

      const response = await client.getFileJobResults('job_123', {
        valid: true,
        invalid: true,
      });

      // getFileJobResults returns a Response object
      const result = await response.text();
      expect(result).toContain('test@example.com');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/verify/file/job_123/results?'),
        expect.any(Object)
      );
    });
  });

  describe('getCredits', () => {
    it('should get credits successfully', async () => {
      const mockApiResponse = {
        success: true,
        code: '0',
        message: 'Success',
        data: {
          account_id: 'abc123',
          api_key_id: 'key_xyz',
          api_key_name: 'Default API Key',
          credits_balance: 9500,
          credits_consumed: 500,
          credits_added: 10000,
          last_updated: '2026-02-04T10:30:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const result = await client.getCredits();

      expect(result.credits_balance).toBe(9500);
      expect(result.account_id).toBe('abc123');
    });
  });

  describe('webhooks', () => {
    it('should create webhook successfully', async () => {
      const mockApiResponse = {
        success: true,
        code: '0',
        message: 'Success',
        data: {
          id: 'webhook_123',
          url: 'https://example.com/webhook',
          events: ['file.completed', 'file.failed'],
          secret: 'generated-secret',
          is_active: true,
          created_at: '2026-02-04T10:30:00Z',
          updated_at: '2026-02-04T10:30:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const result = await client.createWebhook({
        url: 'https://example.com/webhook',
        events: ['file.completed', 'file.failed'],
      });

      expect(result.id).toBe('webhook_123');
      expect(result.secret).toBe('generated-secret');
    });

    it('should list webhooks successfully', async () => {
      const mockApiResponse = {
        success: true,
        code: '0',
        message: 'Success',
        data: {
          webhooks: [
            {
              id: 'webhook_123',
              url: 'https://example.com/webhook',
              events: ['file.completed'],
              is_active: true,
              created_at: '2026-02-04T10:30:00Z',
              updated_at: '2026-02-04T10:30:00Z',
            },
          ],
          total: 1,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const result = await client.listWebhooks();

      expect(result.webhooks).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should delete webhook successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await expect(client.deleteWebhook('webhook_123')).resolves.toBeUndefined();
    });
  });

  describe('healthCheck', () => {
    it('should check health successfully', async () => {
      const mockResponse = {
        status: 'ok',
        time: 1705319400,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.healthCheck();

      expect(result.status).toBe('ok');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.billionverify.com/health',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid webhook signature', () => {
      const payload = '{"event":"test"}';
      const secret = 'test-secret';
      // Pre-computed signature for the payload and secret
      const signature = 'sha256=ad386d9a61a0540a089d2955a07280771439f9f8c41a4b94cd404a740061c3d9';

      const result = client.verifyWebhookSignature(payload, signature, secret);

      expect(result).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const payload = '{"event":"test"}';
      const secret = 'test-secret';
      const invalidSignature = 'sha256=invalid';

      const result = client.verifyWebhookSignature(payload, invalidSignature, secret);

      expect(result).toBe(false);
    });
  });
});

describe('Error Classes', () => {
  it('should create AuthenticationError with correct properties', () => {
    const error = new AuthenticationError();
    expect(error.name).toBe('AuthenticationError');
    expect(error.code).toBe('INVALID_API_KEY');
    expect(error.statusCode).toBe(401);
  });

  it('should create RateLimitError with retryAfter', () => {
    const error = new RateLimitError('Rate limited', 60);
    expect(error.name).toBe('RateLimitError');
    expect(error.retryAfter).toBe(60);
  });

  it('should create ValidationError with details', () => {
    const error = new ValidationError('Invalid input', 'Email format is wrong');
    expect(error.name).toBe('ValidationError');
    expect(error.details).toBe('Email format is wrong');
  });

  it('should create InsufficientCreditsError with HTTP 402', () => {
    const error = new InsufficientCreditsError();
    expect(error.name).toBe('InsufficientCreditsError');
    expect(error.statusCode).toBe(402);
  });

  it('should create TimeoutError with custom message', () => {
    const error = new TimeoutError('Request timed out after 30s');
    expect(error.name).toBe('TimeoutError');
    expect(error.message).toBe('Request timed out after 30s');
  });
});
