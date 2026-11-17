import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  BillionVerifyConfig,
  VerifyOptions,
  VerifyResponse,
  BatchVerifyOptions,
  BatchVerifyResponse,
  DisposableCheckResponse,
  FileUploadOptions,
  FileUploadResponse,
  FileJobStatusOptions,
  FileJobStatusResponse,
  FileJobResultsOptions,
  CreditsResponse,
  WebhookConfig,
  Webhook,
  HealthCheckResponse,
  DomainSearchParams,
  DomainSearchCreated,
  DomainSearchStatus,
  DomainSearchBatchOptions,
  DomainSearchBatchCreated,
  DomainSearchBatchStatus,
  DomainSearchBatchListOptions,
  DomainSearchBatchPage,
  WebhookDeliveryCheck,
} from './types.js';
import {
  BillionVerifyError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  InsufficientCreditsError,
  NotFoundError,
  TimeoutError,
} from './errors.js';
import { verifyWebhookDelivery } from './webhook.js';

const DEFAULT_BASE_URL = 'https://api.billionverify.com/v1';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;
const MAX_BATCH_EMAILS = 50;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'billionverify-sdk/1.1.0';
const RETRYABLE_STATUSES = [429, 500, 502, 503];
const REDIRECT_STATUSES = [301, 302, 303, 307, 308];
const FILE_JOB_DONE = ['completed', 'completed_with_warning', 'failed', 'cancelled', 'paused'];
const DOMAIN_SEARCH_DONE = ['completed', 'completed_with_warning', 'failed'];

type Query = Record<string, string | number | boolean | undefined>;
type UploadSource = Buffer | Uint8Array | Readable;

interface RequestOptions {
  query?: Query;
  json?: unknown;
  /** Builds a fresh form for each attempt. */
  form?: () => FormData;
  auth?: boolean;
  timeout?: number;
}

export class BillionVerify {
  private readonly apiKey: string;
  /** The API root without a trailing `/v1`. */
  private readonly root: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(config: BillionVerifyConfig) {
    if (!config.apiKey) {
      throw new AuthenticationError('API key is required');
    }

    this.apiKey = config.apiKey;
    this.root = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '').replace(/\/v1$/, '');
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
    this.sleepFn = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  // ----- HTTP plumbing ---------------------------------------------------

  private buildUrl(path: string, query?: Query): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return `${this.root}${path}${qs ? `?${qs}` : ''}`;
  }

  private headers(auth: boolean, json: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };
    if (json) {
      headers['Content-Type'] = 'application/json';
    }
    if (auth) {
      headers['BV-API-KEY'] = this.apiKey;
    }
    return headers;
  }

  /** One fetch with a timeout. Network failures become BillionVerifyError, never carrying the URL. */
  private async fetchOnce(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }
      throw new BillionVerifyError(
        `Network error: ${error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[url]') : 'Unknown error'}`,
        'NETWORK_ERROR',
        0
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Sends a request, retrying 429, 500, 502 and 503 up to `retries` attempts in total. */
  private async send(method: string, path: string, options: RequestOptions = {}): Promise<Response> {
    const url = this.buildUrl(path, options.query);
    const timeoutMs = options.timeout ?? this.timeout;
    for (let attempt = 1; ; attempt++) {
      const init: RequestInit = {
        method,
        headers: this.headers(options.auth !== false, options.json !== undefined),
        redirect: 'manual',
      };
      if (options.json !== undefined) {
        init.body = JSON.stringify(options.json);
      } else if (options.form) {
        init.body = options.form();
      }
      const response = await this.fetchOnce(url, init, timeoutMs);
      if (RETRYABLE_STATUSES.includes(response.status) && attempt < this.retries) {
        const retryAfter = this.retryAfter(response);
        const seconds = response.status === 429 && retryAfter > 0 ? retryAfter : Math.pow(2, attempt);
        await this.sleepFn(seconds * 1000);
        continue;
      }
      return response;
    }
  }

  private retryAfter(response: Response): number {
    const value = parseInt(response.headers?.get('Retry-After') ?? '0', 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  private async throwError(response: Response): Promise<never> {
    let message = response.statusText || `HTTP ${response.status}`;
    let code = 'UNKNOWN_ERROR';
    let details: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        error?: { code?: string; message?: string; details?: string; description?: string };
      };
      message = body.error?.message || body.message || message;
      code = body.error?.code || code;
      details = body.error?.details ?? body.error?.description;
    } catch {
      // The body is not JSON; keep the status text.
    }

    switch (response.status) {
      case 400:
        throw new ValidationError(message, details);
      case 401:
        throw new AuthenticationError(message);
      case 402:
        throw new InsufficientCreditsError(message);
      case 404:
        throw new NotFoundError(message);
      case 429:
        throw new RateLimitError(message, this.retryAfter(response));
      default:
        throw new BillionVerifyError(message, code, response.status, details);
    }
  }

  /** Raises for an error status; otherwise returns the envelope's `data` (or the body when there is none). */
  private async unwrap<T>(response: Response): Promise<T> {
    if (!response.ok) {
      await this.throwError(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    let body: unknown;
    try {
      const text = await response.text();
      if (text.trim() === '') {
        return undefined as T;
      }
      body = JSON.parse(text);
    } catch {
      throw new BillionVerifyError('Invalid JSON in response', 'INVALID_RESPONSE', response.status);
    }
    if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
      return (body as { data: T }).data;
    }
    return body as T;
  }

  private async call<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    return this.unwrap<T>(await this.send(method, path, options));
  }

  /**
   * GET that follows redirects itself. The API key goes only to the API's own origin: result
   * files are served from a pre-signed storage URL on another host.
   */
  private async download(path: string, query?: Query): Promise<Response> {
    let url = this.buildUrl(path, query);
    let auth = true;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let response: Response;
      if (hop === 0) {
        response = await this.send('GET', path, { query });
      } else {
        response = await this.fetchOnce(
          url,
          { method: 'GET', headers: this.headers(auth, false), redirect: 'manual' },
          this.timeout
        );
      }
      if (response.ok) {
        return response;
      }
      const location = response.headers?.get('Location');
      if (REDIRECT_STATUSES.includes(response.status) && location) {
        const next = new URL(location, url);
        auth = auth && next.origin === new URL(this.root).origin;
        url = next.toString();
        continue;
      }
      await this.throwError(response);
    }
    throw new BillionVerifyError('Too many redirects', 'TOO_MANY_REDIRECTS', 0);
  }

  private sleep(ms: number): Promise<void> {
    return this.sleepFn(ms);
  }

  private static pathId(id: string): string {
    if (!id) {
      throw new ValidationError('id is required');
    }
    return encodeURIComponent(id);
  }

  private static compact(values: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
  }

  private static async toBlob(source: UploadSource, fileName: string): Promise<Blob> {
    let bytes: Uint8Array;
    if (source instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of source) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks);
    } else {
      bytes = source;
    }
    return new Blob([bytes as unknown as ArrayBuffer], { type: BillionVerify.contentType(fileName) });
  }

  private static contentType(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.csv')) return 'text/csv';
    if (lower.endsWith('.txt')) return 'text/plain';
    if (lower.endsWith('.xlsx')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return 'application/octet-stream';
  }

  // ----- Verification ----------------------------------------------------

  /**
   * Verify a single email address. Options you leave out are not sent, so the server default
   * applies.
   */
  async verify(email: string, options?: VerifyOptions): Promise<VerifyResponse> {
    return this.call<VerifyResponse>('POST', '/v1/verify/single', {
      json: BillionVerify.compact({
        email,
        check_smtp: options?.checkSmtp,
        force_refresh: options?.forceRefresh,
        include_domain_reputation: options?.includeDomainReputation,
      }),
    });
  }

  /**
   * Verify up to 50 emails in one synchronous request. Use uploadFile() for larger lists.
   */
  async verifyBatch(
    emails: string[],
    options?: BatchVerifyOptions
  ): Promise<BatchVerifyResponse> {
    if (emails.length > MAX_BATCH_EMAILS) {
      throw new ValidationError('Maximum 50 emails per batch request. For larger lists, use uploadFile().');
    }

    return this.call<BatchVerifyResponse>('POST', '/v1/verify/bulk', {
      json: BillionVerify.compact({
        emails,
        check_smtp: options?.checkSmtp,
        force_refresh: options?.forceRefresh,
        include_domain_reputation: options?.includeDomainReputation,
      }),
    });
  }

  /** Free lookup against the disposable-domain table (POST). */
  async checkDisposable(email: string): Promise<DisposableCheckResponse> {
    return this.call<DisposableCheckResponse>('POST', '/v1/verify/disposable', { json: { email } });
  }

  /** Same as checkDisposable() with the address in the query string (GET). */
  async checkDisposableViaQuery(email: string): Promise<DisposableCheckResponse> {
    return this.call<DisposableCheckResponse>('GET', '/v1/verify/disposable', { query: { email } });
  }

  // ----- File verification -----------------------------------------------

  /**
   * Upload a CSV, XLSX or TXT file of addresses for asynchronous verification.
   */
  async uploadFile(
    file: UploadSource,
    fileName: string,
    options?: FileUploadOptions
  ): Promise<FileUploadResponse> {
    const blob = await BillionVerify.toBlob(file, fileName);
    return this.call<FileUploadResponse>('POST', '/v1/verify/file', {
      form: () => {
        const formData = new FormData();
        formData.append('file', blob, fileName);
        if (options?.checkSmtp !== undefined) {
          formData.append('check_smtp', String(options.checkSmtp));
        }
        if (options?.emailColumn) {
          formData.append('email_column', options.emailColumn);
        }
        if (options?.preserveOriginal !== undefined) {
          formData.append('preserve_original', String(options.preserveOriginal));
        }
        return formData;
      },
    });
  }

  /**
   * Get the status of a file verification job.
   * Supports long-polling with the timeout option (0-300 seconds).
   */
  async getFileJobStatus(
    jobId: string,
    options?: FileJobStatusOptions
  ): Promise<FileJobStatusResponse> {
    const query: Query = {};
    let customTimeout: number | undefined;

    if (options?.timeout !== undefined) {
      if (options.timeout < 0 || options.timeout > 300) {
        throw new ValidationError('Timeout must be between 0 and 300 seconds');
      }
      query.timeout = options.timeout;
      if (options.timeout > 0) {
        customTimeout = (options.timeout + 10) * 1000;
      }
    }

    return this.call<FileJobStatusResponse>('GET', `/v1/verify/file/${BillionVerify.pathId(jobId)}`, {
      query,
      timeout: customTimeout,
    });
  }

  /**
   * Download the result CSV of a completed job. Returns the final response (read it with
   * `.text()` or `.arrayBuffer()`). Filters combine with OR. The redirect to the pre-signed
   * storage URL is followed here and the API key is not sent to the storage host.
   */
  async getFileJobResults(jobId: string, options?: FileJobResultsOptions): Promise<Response> {
    const query: Query = {};
    for (const key of ['valid', 'invalid', 'catchall', 'role', 'unknown', 'disposable', 'risky'] as const) {
      if (options?.[key]) {
        query[key] = 'true';
      }
    }
    return this.download(`/v1/verify/file/${BillionVerify.pathId(jobId)}/results`, query);
  }

  /**
   * Poll until the job ends (completed, completed_with_warning, failed, cancelled) or pauses.
   * Intervals are in milliseconds.
   */
  async waitForFileJobCompletion(
    jobId: string,
    pollInterval: number = 5000,
    maxWait: number = 600000
  ): Promise<FileJobStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const status = await this.getFileJobStatus(jobId);

      if (FILE_JOB_DONE.includes(status.status)) {
        return status;
      }

      await this.sleep(pollInterval);
    }

    throw new TimeoutError(`File job ${jobId} did not complete within ${maxWait}ms`);
  }

  /** Resume a paused file job. Returns its status. */
  async resumeJob(jobId: string): Promise<FileJobStatusResponse> {
    return this.call<FileJobStatusResponse>('POST', `/v1/jobs/${BillionVerify.pathId(jobId)}/resume`);
  }

  // ----- Account ---------------------------------------------------------

  /**
   * Get current credit balance
   */
  async getCredits(): Promise<CreditsResponse> {
    return this.call<CreditsResponse>('GET', '/v1/credits');
  }

  // ----- Webhooks --------------------------------------------------------

  /**
   * Create a new webhook. The returned object carries the signing secret once; store it.
   */
  async createWebhook(config: WebhookConfig): Promise<Webhook> {
    return this.call<Webhook>('POST', '/v1/webhooks', { json: config });
  }

  /**
   * List all webhooks
   */
  async listWebhooks(): Promise<{ webhooks: Webhook[]; total: number }> {
    return this.call<{ webhooks: Webhook[]; total: number }>('GET', '/v1/webhooks');
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    await this.call<void>('DELETE', `/v1/webhooks/${BillionVerify.pathId(webhookId)}`);
  }

  /**
   * Verify a webhook delivery: HMAC-SHA256 over `"<X-Webhook-Timestamp>.<raw body>"` and the age
   * of the delivery (300 seconds by default). Recommended.
   */
  verifyWebhookDelivery(check: WebhookDeliveryCheck): boolean {
    return verifyWebhookDelivery(check);
  }

  /**
   * Verify a webhook signature computed over the body alone.
   *
   * @deprecated The server signs `"<timestamp>.<body>"`, so this never matches a real delivery.
   * Use verifyWebhookDelivery().
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    if (!secret) {
      return false;
    }
    const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`);
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  // ----- Domain search (email finder) ------------------------------------

  /**
   * Start a domain search: the emails published on a company's site, each verified. Costs
   * 5 credits per returned email; `maxEmails` (1-200) caps the bill.
   */
  async createDomainSearch(params: DomainSearchParams): Promise<DomainSearchCreated> {
    BillionVerify.checkMaxEmails(params.maxEmails);
    return this.call<DomainSearchCreated>('POST', '/v1/domain/search', {
      json: BillionVerify.compact({
        domain: params.domain,
        max_emails: params.maxEmails,
        include_role_based: params.includeRoleBased,
        max_pages: params.maxPages,
      }),
    });
  }

  async getDomainSearch(searchId: string): Promise<DomainSearchStatus> {
    return this.call<DomainSearchStatus>('GET', `/v1/domain/search/${BillionVerify.pathId(searchId)}`);
  }

  /** Poll until the search is completed, completed_with_warning or failed. Intervals are in milliseconds. */
  async waitForDomainSearch(
    searchId: string,
    pollInterval: number = 5000,
    maxWait: number = 600000
  ): Promise<DomainSearchStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const search = await this.getDomainSearch(searchId);

      if (DOMAIN_SEARCH_DONE.includes(search.status)) {
        return search;
      }

      await this.sleep(pollInterval);
    }

    throw new TimeoutError(`Domain search ${searchId} did not finish within ${maxWait}ms`);
  }

  /** Upload a CSV of domains. The results CSV has one row per returned email. */
  async createDomainSearchBatch(
    file: UploadSource,
    fileName: string,
    options?: DomainSearchBatchOptions
  ): Promise<DomainSearchBatchCreated> {
    if (options?.maxEmails !== undefined) {
      BillionVerify.checkMaxEmails(options.maxEmails);
    }
    const blob = await BillionVerify.toBlob(file, fileName);
    return this.call<DomainSearchBatchCreated>('POST', '/v1/domain/search/batch', {
      form: () => {
        const formData = new FormData();
        formData.append('file', blob, fileName);
        if (options?.maxEmails !== undefined) {
          formData.append('max_emails', String(options.maxEmails));
        }
        if (options?.includeRoleBased !== undefined) {
          formData.append('include_role_based', String(options.includeRoleBased));
        }
        if (options?.maxPages !== undefined) {
          formData.append('max_pages', String(options.maxPages));
        }
        if (options?.columnMap !== undefined) {
          formData.append(
            'column_map',
            typeof options.columnMap === 'string' ? options.columnMap : JSON.stringify(options.columnMap)
          );
        }
        return formData;
      },
    });
  }

  /** One page of batches: `items`, `has_more` and `next_cursor`. */
  async listDomainSearchBatches(options?: DomainSearchBatchListOptions): Promise<DomainSearchBatchPage> {
    return this.call<DomainSearchBatchPage>('GET', '/v1/domain/search/batch', {
      query: { limit: options?.limit, status: options?.status, cursor: options?.cursor },
    });
  }

  async getDomainSearchBatch(batchId: string): Promise<DomainSearchBatchStatus> {
    return this.call<DomainSearchBatchStatus>(
      'GET',
      `/v1/domain/search/batch/${BillionVerify.pathId(batchId)}`
    );
  }

  /** The results CSV of a finished batch as a Response. Before the batch ends the API answers 409. */
  async downloadDomainSearchBatchResults(batchId: string): Promise<Response> {
    return this.download(`/v1/domain/search/batch/${BillionVerify.pathId(batchId)}/results`);
  }

  private static checkMaxEmails(value: number): void {
    if (!Number.isInteger(value) || value < 1 || value > 200) {
      throw new ValidationError('maxEmails must be an integer between 1 and 200');
    }
  }

  // ----- Health ----------------------------------------------------------

  /**
   * Health check endpoint (no authentication required)
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const response = await this.send('GET', '/health', { auth: false });
    if (!response.ok) {
      throw new BillionVerifyError(
        response.statusText || 'Health check failed',
        'HEALTH_CHECK_FAILED',
        response.status
      );
    }
    return this.unwrap<HealthCheckResponse>(response);
  }
}
