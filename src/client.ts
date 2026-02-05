import { Readable } from 'stream';
import {
  EmailVerifyConfig,
  VerifyOptions,
  VerifyResponse,
  BatchVerifyOptions,
  BatchVerifyResponse,
  FileUploadOptions,
  FileUploadResponse,
  FileJobStatusOptions,
  FileJobStatusResponse,
  FileJobResultsOptions,
  CreditsResponse,
  WebhookConfig,
  Webhook,
  HealthCheckResponse,
  ApiError,
  ApiResponse,
} from './types.js';
import {
  EmailVerifyError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  InsufficientCreditsError,
  NotFoundError,
  TimeoutError,
} from './errors.js';

const DEFAULT_BASE_URL = 'https://api.emailverify.ai/v1';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;

export class EmailVerify {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config: EmailVerifyConfig) {
    if (!config.apiKey) {
      throw new AuthenticationError('API key is required');
    }

    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') || DEFAULT_BASE_URL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    attempt: number = 1,
    options?: { skipAuth?: boolean; customTimeout?: number }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const requestTimeout = options?.customTimeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': '@emailverify/node/1.0.0',
      };

      if (!options?.skipAuth) {
        headers['EV-API-KEY'] = this.apiKey;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response, attempt, method, path, body, options);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const json = await response.json() as ApiResponse<T>;
      return json.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof EmailVerifyError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${requestTimeout}ms`);
      }

      throw new EmailVerifyError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        0
      );
    }
  }

  private async requestMultipart<T>(
    path: string,
    formData: FormData,
    attempt: number = 1
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'EV-API-KEY': this.apiKey,
          'User-Agent': '@emailverify/node/1.0.0',
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response, attempt, 'POST', path, formData);
      }

      const json = await response.json() as ApiResponse<T>;
      return json.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof EmailVerifyError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${this.timeout}ms`);
      }

      throw new EmailVerifyError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        0
      );
    }
  }

  private async handleErrorResponse(
    response: Response,
    attempt: number,
    method: string,
    path: string,
    body?: unknown,
    options?: { skipAuth?: boolean; customTimeout?: number }
  ): Promise<never> {
    let errorData: { error?: ApiError } = {};
    try {
      errorData = await response.json() as { error?: ApiError };
    } catch {
      // Response body is not JSON
    }

    const error = errorData.error;
    const message = error?.message || response.statusText;
    const code = error?.code || 'UNKNOWN_ERROR';

    switch (response.status) {
      case 401:
        throw new AuthenticationError(message);

      case 402:
        throw new InsufficientCreditsError(message);

      case 404:
        throw new NotFoundError(message);

      case 429:
        const retryAfter = parseInt(response.headers.get('Retry-After') || '0', 10);
        if (attempt < this.retries) {
          await this.sleep((retryAfter || Math.pow(2, attempt)) * 1000);
          return this.request(method, path, body, attempt + 1, options);
        }
        throw new RateLimitError(message, retryAfter);

      case 400:
        throw new ValidationError(message, error?.details);

      case 500:
      case 502:
      case 503:
        if (attempt < this.retries) {
          await this.sleep(Math.pow(2, attempt) * 1000);
          return this.request(method, path, body, attempt + 1, options);
        }
        throw new EmailVerifyError(message, code, response.status);

      default:
        throw new EmailVerifyError(message, code, response.status);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Verify a single email address
   */
  async verify(email: string, options?: VerifyOptions): Promise<VerifyResponse> {
    return this.request<VerifyResponse>('POST', '/verify/single', {
      email,
      check_smtp: options?.checkSmtp ?? true,
    });
  }

  /**
   * Verify multiple emails synchronously (max 50 emails)
   */
  async verifyBatch(
    emails: string[],
    options?: BatchVerifyOptions
  ): Promise<BatchVerifyResponse> {
    if (emails.length > 50) {
      throw new ValidationError('Maximum 50 emails per batch request. For larger lists, use uploadFile().');
    }

    return this.request<BatchVerifyResponse>('POST', '/verify/bulk', {
      emails,
      check_smtp: options?.checkSmtp ?? true,
    });
  }

  /**
   * Upload a file for asynchronous verification
   */
  async uploadFile(
    file: Buffer | Readable,
    fileName: string,
    options?: FileUploadOptions
  ): Promise<FileUploadResponse> {
    const formData = new FormData();

    // Convert Buffer or Readable stream to Blob
    let fileBlob: Blob;
    if (Buffer.isBuffer(file)) {
      fileBlob = new Blob([file]);
    } else {
      // For ReadStream, we need to collect the data first
      const chunks: Buffer[] = [];
      for await (const chunk of file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      fileBlob = new Blob([Buffer.concat(chunks)]);
    }

    formData.append('file', fileBlob, fileName);

    if (options?.checkSmtp !== undefined) {
      formData.append('check_smtp', String(options.checkSmtp));
    }
    if (options?.emailColumn) {
      formData.append('email_column', options.emailColumn);
    }
    if (options?.preserveOriginal !== undefined) {
      formData.append('preserve_original', String(options.preserveOriginal));
    }

    return this.requestMultipart<FileUploadResponse>('/verify/file', formData);
  }

  /**
   * Get the status of a file verification job
   * Supports long-polling with timeout parameter (0-300 seconds)
   */
  async getFileJobStatus(
    jobId: string,
    options?: FileJobStatusOptions
  ): Promise<FileJobStatusResponse> {
    const params = new URLSearchParams();

    if (options?.timeout !== undefined) {
      if (options.timeout < 0 || options.timeout > 300) {
        throw new ValidationError('Timeout must be between 0 and 300 seconds');
      }
      params.set('timeout', options.timeout.toString());
    }

    const query = params.toString();
    const path = `/verify/file/${jobId}${query ? `?${query}` : ''}`;

    // Extend the request timeout if long-polling is used
    const customTimeout = options?.timeout
      ? (options.timeout + 10) * 1000 // Add 10 seconds buffer
      : undefined;

    return this.request<FileJobStatusResponse>('GET', path, undefined, 1, { customTimeout });
  }

  /**
   * Get the results of a completed file verification job
   * Can filter by status types (valid, invalid, catchall, role, unknown, disposable, risky)
   */
  async getFileJobResults(
    jobId: string,
    options?: FileJobResultsOptions
  ): Promise<Response> {
    const params = new URLSearchParams();

    if (options?.valid) params.set('valid', 'true');
    if (options?.invalid) params.set('invalid', 'true');
    if (options?.catchall) params.set('catchall', 'true');
    if (options?.role) params.set('role', 'true');
    if (options?.unknown) params.set('unknown', 'true');
    if (options?.disposable) params.set('disposable', 'true');
    if (options?.risky) params.set('risky', 'true');

    const query = params.toString();
    const path = `/verify/file/${jobId}/results${query ? `?${query}` : ''}`;
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'EV-API-KEY': this.apiKey,
        'User-Agent': '@emailverify/node/1.0.0',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      await this.handleErrorResponse(response, 1, 'GET', path);
    }

    return response;
  }

  /**
   * Poll for file job completion
   */
  async waitForFileJobCompletion(
    jobId: string,
    pollInterval: number = 5000,
    maxWait: number = 600000
  ): Promise<FileJobStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const status = await this.getFileJobStatus(jobId);

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      await this.sleep(pollInterval);
    }

    throw new TimeoutError(`File job ${jobId} did not complete within ${maxWait}ms`);
  }

  /**
   * Get current credit balance
   */
  async getCredits(): Promise<CreditsResponse> {
    return this.request<CreditsResponse>('GET', '/credits');
  }

  /**
   * Create a new webhook
   */
  async createWebhook(config: WebhookConfig): Promise<Webhook> {
    return this.request<Webhook>('POST', '/webhooks', config);
  }

  /**
   * List all webhooks
   */
  async listWebhooks(): Promise<{ webhooks: Webhook[]; total: number }> {
    return this.request<{ webhooks: Webhook[]; total: number }>('GET', '/webhooks');
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.request<void>('DELETE', `/webhooks/${webhookId}`);
  }

  /**
   * Verify a webhook signature
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const crypto = require('crypto');
    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Health check endpoint (no authentication required)
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const url = this.baseUrl.replace(/\/v1$/, '') + '/health';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': '@emailverify/node/1.0.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new EmailVerifyError(
          response.statusText || 'Health check failed',
          'HEALTH_CHECK_FAILED',
          response.status
        );
      }

      return await response.json() as HealthCheckResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof EmailVerifyError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${this.timeout}ms`);
      }

      throw new EmailVerifyError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NETWORK_ERROR',
        0
      );
    }
  }
}
