import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { BillionVerify } from '../src/client.js';
import { verifyWebhookDelivery } from '../src/webhook.js';
import {
  BillionVerifyError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  InsufficientCreditsError,
  NotFoundError,
  TimeoutError,
} from '../src/errors.js';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const BASE = 'https://api.billionverify.com';

function envelope(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ success: true, code: '0', message: 'Success', data }), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function failure(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ success: false, code: String(status), message, error: { code, message } }),
    { status, headers: { 'Content-Type': 'application/json', ...headers } }
  );
}

function lastCall(index = -1): { url: string; init: RequestInit } {
  const calls = mockFetch.mock.calls;
  const call = calls.at(index)!;
  return { url: call[0] as string, init: call[1] as RequestInit };
}

function headerOf(init: RequestInit, name: string): string | undefined {
  const headers = init.headers as Record<string, string>;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

describe('BillionVerify client', () => {
  let client: BillionVerify;
  let sleeps: number[];

  beforeEach(() => {
    mockFetch.mockReset();
    sleeps = [];
    client = new BillionVerify({
      apiKey: 'test-api-key',
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('throws AuthenticationError when the API key is missing', () => {
      expect(() => new BillionVerify({ apiKey: '' })).toThrow(AuthenticationError);
    });

    it('accepts a base URL with or without /v1', async () => {
      for (const baseUrl of ['https://custom.test', 'https://custom.test/', 'https://custom.test/v1', 'https://custom.test/v1/']) {
        mockFetch.mockResolvedValueOnce(envelope({ credits_balance: 1 }));
        await new BillionVerify({ apiKey: 'k', baseUrl }).getCredits();
        expect(lastCall().url).toBe('https://custom.test/v1/credits');
      }
    });
  });

  describe('verify', () => {
    it('sends BV-API-KEY and only the email by default', async () => {
      mockFetch.mockResolvedValueOnce(
        envelope({ email: 'a@b.co', status: 'valid', score: 0.95, is_deliverable: true, check_smtp: true, verification_mode: 'smtp' })
      );
      const result = await client.verify('a@b.co');
      const { url, init } = lastCall();
      expect(url).toBe(`${BASE}/v1/verify/single`);
      expect(init.method).toBe('POST');
      expect(headerOf(init, 'BV-API-KEY')).toBe('test-api-key');
      expect(headerOf(init, 'EV-API-KEY')).toBeUndefined();
      expect(headerOf(init, 'Content-Type')).toBe('application/json');
      expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.co' });
      expect(result.status).toBe('valid');
      expect(result.verification_mode).toBe('smtp');
    });

    it('sends every option that is given', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ email: 'a@b.co', status: 'unknown' }));
      await client.verify('a@b.co', { checkSmtp: false, forceRefresh: true, includeDomainReputation: true });
      expect(JSON.parse(lastCall().init.body as string)).toEqual({
        email: 'a@b.co',
        check_smtp: false,
        force_refresh: true,
        include_domain_reputation: true,
      });
    });

    it('does not follow redirects on its own', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ email: 'a@b.co', status: 'valid' }));
      await client.verify('a@b.co');
      expect(lastCall().init.redirect).toBe('manual');
    });
  });

  describe('verifyBatch', () => {
    it('returns buckets and the retry lists', async () => {
      mockFetch.mockResolvedValueOnce(
        envelope({
          results: [{ email: 'a@b.co', status: 'valid' }],
          total_emails: 1,
          retryable_emails: ['c@d.co'],
          deferred_emails: [],
          retry_after_seconds: 30,
          deliverability_buckets: { strict_deliverable: 1, not_deliverable: 0 },
        })
      );
      const result = await client.verifyBatch(['a@b.co'], { forceRefresh: true });
      expect(lastCall().url).toBe(`${BASE}/v1/verify/bulk`);
      expect(JSON.parse(lastCall().init.body as string)).toEqual({ emails: ['a@b.co'], force_refresh: true });
      expect(result.retryable_emails).toEqual(['c@d.co']);
      expect(result.retry_after_seconds).toBe(30);
      expect(result.deliverability_buckets?.strict_deliverable).toBe(1);
    });

    it('refuses more than 50 emails without a request', async () => {
      const emails = Array.from({ length: 51 }, (_, i) => `u${i}@x.co`);
      await expect(client.verifyBatch(emails)).rejects.toThrow(ValidationError);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('disposable check', () => {
    it('POST and GET variants', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ email: 'x@mailinator.com', domain: 'mailinator.com', is_disposable: true }));
      mockFetch.mockResolvedValueOnce(envelope({ email: 'x+t@mailinator.com', domain: 'mailinator.com', is_disposable: true }));
      expect((await client.checkDisposable('x@mailinator.com')).is_disposable).toBe(true);
      expect(lastCall().url).toBe(`${BASE}/v1/verify/disposable`);
      expect(JSON.parse(lastCall().init.body as string)).toEqual({ email: 'x@mailinator.com' });
      expect((await client.checkDisposableViaQuery('x+t@mailinator.com')).is_disposable).toBe(true);
      expect(lastCall().url).toBe(`${BASE}/v1/verify/disposable?email=x%2Bt%40mailinator.com`);
      expect(lastCall().init.method).toBe('GET');
    });
  });

  describe('file verification', () => {
    it('uploads multipart with only the given fields', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ task_id: 'job-1', status: 'pending', email_column_candidates: ['email'] }));
      const result = await client.uploadFile(Buffer.from('email\na@b.co\n'), 'emails.csv', {
        checkSmtp: false,
        emailColumn: 'email',
        preserveOriginal: true,
      });
      const { url, init } = lastCall();
      expect(url).toBe(`${BASE}/v1/verify/file`);
      expect(headerOf(init, 'BV-API-KEY')).toBe('test-api-key');
      expect(headerOf(init, 'Content-Type')).toBeUndefined();
      const form = init.body as FormData;
      expect((form.get('file') as File).name).toBe('emails.csv');
      expect((form.get('file') as File).type).toBe('text/csv');
      expect(await (form.get('file') as File).text()).toBe('email\na@b.co\n');
      expect(form.get('check_smtp')).toBe('false');
      expect(form.get('email_column')).toBe('email');
      expect(form.get('preserve_original')).toBe('true');
      expect(result.email_column_candidates).toEqual(['email']);
    });

    it('omits preserve_original unless given, and reads streams', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ task_id: 'j' }));
      await client.uploadFile(Readable.from([Buffer.from('a@b.co\n')]), 'list.txt');
      const form = lastCall().init.body as FormData;
      expect(form.has('preserve_original')).toBe(false);
      expect(form.has('check_smtp')).toBe(false);
      expect(await (form.get('file') as File).text()).toBe('a@b.co\n');
    });

    it('reads the current job status fields', async () => {
      mockFetch.mockResolvedValueOnce(
        envelope({
          task_id: 'job-1',
          status: 'completed_with_warning',
          progress: 100,
          total_emails: 10,
          credits_used: 9,
          deliverability_buckets: { strict_deliverable: 8, unknown: 2 },
          runtime_hints: { inflight_batches: 0 },
        })
      );
      const status = await client.getFileJobStatus('job-1');
      expect(lastCall().url).toBe(`${BASE}/v1/verify/file/job-1`);
      expect(status.task_id).toBe('job-1');
      expect(status.progress).toBe(100);
      expect(status.deliverability_buckets?.unknown).toBe(2);
    });

    it('supports long polling and validates the range', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ task_id: 'job-1', status: 'running' }));
      await client.getFileJobStatus('job-1', { timeout: 60 });
      expect(lastCall().url).toBe(`${BASE}/v1/verify/file/job-1?timeout=60`);
      await expect(client.getFileJobStatus('job-1', { timeout: 301 })).rejects.toThrow(ValidationError);
      await expect(client.getFileJobStatus('job-1', { timeout: -1 })).rejects.toThrow(ValidationError);
    });

    it('escapes ids in paths', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ status: 'running' }));
      await client.getFileJobStatus('a/b c');
      expect(lastCall().url).toBe(`${BASE}/v1/verify/file/a%2Fb%20c`);
    });

    it.each(['completed', 'completed_with_warning', 'failed', 'cancelled', 'paused'])(
      'waitForFileJobCompletion returns on %s',
      async (final) => {
        mockFetch.mockResolvedValueOnce(envelope({ task_id: 'j', status: 'running' }));
        mockFetch.mockResolvedValueOnce(envelope({ task_id: 'j', status: 'merging' }));
        mockFetch.mockResolvedValueOnce(envelope({ task_id: 'j', status: final }));
        const status = await client.waitForFileJobCompletion('j', 7000);
        expect(status.status).toBe(final);
        expect(sleeps).toEqual([7000, 7000]);
      }
    );

    it('waitForFileJobCompletion times out', async () => {
      mockFetch.mockImplementation(async () => envelope({ task_id: 'j', status: 'running' }));
      await expect(client.waitForFileJobCompletion('j', 1, 0)).rejects.toThrow(TimeoutError);
    });

    it('downloads results with filters', async () => {
      mockFetch.mockResolvedValueOnce(new Response('email,status\na@b.co,valid\n'));
      const response = await client.getFileJobResults('job-1', { valid: true, risky: true, invalid: false });
      expect(lastCall().url).toBe(`${BASE}/v1/verify/file/job-1/results?valid=true&risky=true`);
      expect(headerOf(lastCall().init, 'BV-API-KEY')).toBe('test-api-key');
      expect(await response.text()).toBe('email,status\na@b.co,valid\n');
    });

    it('does not send the API key to another host on a redirect', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 307, headers: { Location: 'https://storage.example.net/r/job-1.csv?sig=abc' } })
      );
      mockFetch.mockResolvedValueOnce(new Response('csv-data'));
      const response = await client.getFileJobResults('job-1');
      expect(await response.text()).toBe('csv-data');
      const second = lastCall();
      expect(second.url).toBe('https://storage.example.net/r/job-1.csv?sig=abc');
      expect(headerOf(second.init, 'BV-API-KEY')).toBeUndefined();
      expect(headerOf(lastCall(0).init, 'BV-API-KEY')).toBe('test-api-key');
    });

    it('keeps the API key on a same-origin redirect', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 307, headers: { Location: '/v1/files/x' } }));
      mockFetch.mockResolvedValueOnce(new Response('ok'));
      await client.getFileJobResults('job-1');
      expect(lastCall().url).toBe(`${BASE}/v1/files/x`);
      expect(headerOf(lastCall().init, 'BV-API-KEY')).toBe('test-api-key');
    });

    it('gives up after too many redirects', async () => {
      mockFetch.mockImplementation(async () => new Response(null, { status: 307, headers: { Location: '/v1/loop' } }));
      await expect(client.getFileJobResults('job-1')).rejects.toMatchObject({ code: 'TOO_MANY_REDIRECTS' });
    });

    it('error messages never carry a pre-signed URL', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 307, headers: { Location: 'https://storage.example.net/r/x.csv?sig=SECRETSIG' } })
      );
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed: https://storage.example.net/r/x.csv?sig=SECRETSIG'));
      const error = await client.getFileJobResults('job-1').catch((e) => e);
      expect(error).toBeInstanceOf(BillionVerifyError);
      expect(error.message).not.toContain('SECRETSIG');
      expect(error.message).not.toContain('storage.example.net');
    });

    it('resumes a paused job', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ task_id: 'job-1', status: 'processing' }));
      const status = await client.resumeJob('job-1');
      expect(lastCall().url).toBe(`${BASE}/v1/jobs/job-1/resume`);
      expect(lastCall().init.method).toBe('POST');
      expect(status.status).toBe('processing');
    });
  });

  describe('credits and webhooks', () => {
    it('gets credits', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ account_id: 'a', credits_balance: 9500 }));
      expect((await client.getCredits()).credits_balance).toBe(9500);
    });

    it('creates, lists and deletes webhooks', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ id: 'w1', secret: 's3cret', is_active: true }));
      mockFetch.mockResolvedValueOnce(
        envelope({ webhooks: [{ id: 'w1', url: 'https://x.test/h', last_delivery_status: 'success' }], total: 1 })
      );
      mockFetch.mockResolvedValueOnce(envelope({ message: 'Webhook deleted successfully', webhook_id: 'w1' }));
      const created = await client.createWebhook({ url: 'https://x.test/h', events: ['file.completed'] });
      expect(JSON.parse(lastCall().init.body as string)).toEqual({ url: 'https://x.test/h', events: ['file.completed'] });
      expect(created.secret).toBe('s3cret');
      const list = await client.listWebhooks();
      expect(list.total).toBe(1);
      expect(list.webhooks[0].last_delivery_status).toBe('success');
      await client.deleteWebhook('w1');
      expect(lastCall().url).toBe(`${BASE}/v1/webhooks/w1`);
      expect(lastCall().init.method).toBe('DELETE');
    });
  });

  describe('domain search', () => {
    it('creates a search and validates maxEmails', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ search_id: 's1', status: 'queued', credits_reserved: 50 }, 202));
      const created = await client.createDomainSearch({ domain: 'example.com', maxEmails: 10, includeRoleBased: false, maxPages: 50 });
      expect(lastCall().url).toBe(`${BASE}/v1/domain/search`);
      expect(JSON.parse(lastCall().init.body as string)).toEqual({
        domain: 'example.com',
        max_emails: 10,
        include_role_based: false,
        max_pages: 50,
      });
      expect(created.search_id).toBe('s1');
      await expect(client.createDomainSearch({ domain: 'example.com', maxEmails: 0 })).rejects.toThrow(ValidationError);
      await expect(client.createDomainSearch({ domain: 'example.com', maxEmails: 201 })).rejects.toThrow(ValidationError);
    });

    it('polls a search until it finishes', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ search_id: 's1', status: 'queued', domain: 'example.com' }));
      mockFetch.mockResolvedValueOnce(
        envelope({ search_id: 's1', status: 'completed', domain: 'example.com', result: { emails: [{ email: 'a@example.com' }] } })
      );
      const done = await client.waitForDomainSearch('s1');
      expect(lastCall().url).toBe(`${BASE}/v1/domain/search/s1`);
      expect(done.result?.emails?.[0].email).toBe('a@example.com');
      expect(sleeps).toEqual([5000]);
    });

    it('batch lifecycle', async () => {
      mockFetch.mockResolvedValueOnce(envelope({ batch_id: 'b1', status: 'queued' }, 202));
      const created = await client.createDomainSearchBatch(Buffer.from('domain\nexample.com\n'), 'domains.csv', {
        maxEmails: 5,
        includeRoleBased: false,
        maxPages: 20,
        columnMap: { domain: 'Company Website' },
      });
      expect(created.batch_id).toBe('b1');
      const form = lastCall().init.body as FormData;
      expect(lastCall().url).toBe(`${BASE}/v1/domain/search/batch`);
      expect(form.get('max_emails')).toBe('5');
      expect(form.get('include_role_based')).toBe('false');
      expect(form.get('max_pages')).toBe('20');
      expect(JSON.parse(form.get('column_map') as string)).toEqual({ domain: 'Company Website' });
      expect(await (form.get('file') as File).text()).toBe('domain\nexample.com\n');

      mockFetch.mockResolvedValueOnce(envelope({ items: [{ batch_id: 'b1' }], has_more: true, next_cursor: 'c2' }));
      const page = await client.listDomainSearchBatches({ limit: 5, status: 'completed', cursor: 'c1' });
      expect(lastCall().url).toBe(`${BASE}/v1/domain/search/batch?limit=5&status=completed&cursor=c1`);
      expect(page.has_more).toBe(true);
      expect(page.next_cursor).toBe('c2');

      mockFetch.mockResolvedValueOnce(envelope({ batch_id: 'b1', status: 'running', progress: { processed: 3 }, credits_charged: 15 }));
      expect((await client.getDomainSearchBatch('b1')).progress?.processed).toBe(3);

      mockFetch.mockResolvedValueOnce(new Response('row_no,domain\n1,example.com\n'));
      const csv = await client.downloadDomainSearchBatchResults('b1');
      expect(lastCall().url).toBe(`${BASE}/v1/domain/search/batch/b1/results`);
      expect(await csv.text()).toBe('row_no,domain\n1,example.com\n');
    });

    it('batch results not ready is a 409 error', async () => {
      mockFetch.mockResolvedValueOnce(failure(409, 'NOT_READY', 'Results are not ready yet'));
      await expect(client.downloadDomainSearchBatchResults('b1')).rejects.toMatchObject({
        statusCode: 409,
        code: 'NOT_READY',
      });
    });
  });

  describe('healthCheck', () => {
    it('needs no key and has no envelope', async () => {
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', time: 1705319400 })));
      const health = await client.healthCheck();
      expect(lastCall().url).toBe(`${BASE}/health`);
      expect(headerOf(lastCall().init, 'BV-API-KEY')).toBeUndefined();
      expect(health).toEqual({ status: 'ok', time: 1705319400 });
    });

    it('throws on a bad status', async () => {
      mockFetch.mockImplementation(async () => new Response('', { status: 503, statusText: 'Service Unavailable' }));
      await expect(client.healthCheck()).rejects.toMatchObject({ code: 'HEALTH_CHECK_FAILED', statusCode: 503 });
    });
  });

  describe('errors and retries', () => {
    it.each([
      [400, ValidationError, 'INVALID_REQUEST'],
      [401, AuthenticationError, 'INVALID_API_KEY'],
      [402, InsufficientCreditsError, 'INSUFFICIENT_CREDITS'],
      [404, NotFoundError, 'NOT_FOUND'],
    ])('maps %i to its error class', async (status, klass, code) => {
      mockFetch.mockResolvedValueOnce(failure(status, 'SERVER_CODE', `boom ${status}`));
      const error = await client.getCredits().catch((e) => e);
      expect(error).toBeInstanceOf(klass);
      expect(error.statusCode).toBe(status);
      expect(error.code).toBe(code);
      expect(error.message).toBe(`boom ${status}`);
    });

    it('keeps the server code for other statuses and non-JSON bodies', async () => {
      mockFetch.mockResolvedValueOnce(failure(418, 'TEAPOT', 'short and stout'));
      await expect(client.getCredits()).rejects.toMatchObject({ statusCode: 418, code: 'TEAPOT', message: 'short and stout' });
      mockFetch.mockResolvedValueOnce(new Response('teapot', { status: 418 }));
      await expect(client.getCredits()).rejects.toMatchObject({ statusCode: 418, code: 'UNKNOWN_ERROR' });
    });

    it('retries a 429 using Retry-After', async () => {
      mockFetch.mockResolvedValueOnce(failure(429, 'RATE_LIMIT_EXCEEDED', 'slow', { 'Retry-After': '7' }));
      mockFetch.mockResolvedValueOnce(envelope({ credits_balance: 1 }));
      expect((await client.getCredits()).credits_balance).toBe(1);
      expect(sleeps).toEqual([7000]);
    });

    it('retries 5xx with exponential backoff', async () => {
      mockFetch.mockResolvedValueOnce(failure(503, 'X', 'down'));
      mockFetch.mockResolvedValueOnce(failure(502, 'X', 'down'));
      mockFetch.mockResolvedValueOnce(envelope({ credits_balance: 2 }));
      expect((await client.getCredits()).credits_balance).toBe(2);
      expect(sleeps).toEqual([2000, 4000]);
    });

    it('throws RateLimitError after the attempts run out', async () => {
      mockFetch.mockImplementation(async () => failure(429, 'RATE_LIMIT_EXCEEDED', 'slow', { 'Retry-After': '3' }));
      const error = await client.getCredits().catch((e) => e);
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.retryAfter).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(sleeps).toEqual([3000, 3000]);
    });

    it('does not retry client errors', async () => {
      mockFetch.mockResolvedValueOnce(failure(401, 'INVALID_API_KEY', 'bad'));
      await expect(client.getCredits()).rejects.toThrow(AuthenticationError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('turns an aborted request into TimeoutError and other failures into NETWORK_ERROR', async () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abort);
      await expect(client.getCredits()).rejects.toThrow(TimeoutError);
      mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
      await expect(client.getCredits()).rejects.toMatchObject({ code: 'NETWORK_ERROR', statusCode: 0 });
    });

    it('handles empty and invalid success bodies', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
      await expect(client.deleteWebhook('w1')).resolves.toBeUndefined();
      mockFetch.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
      await expect(client.getCredits()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });
  });
});

describe('webhook delivery signature', () => {
  const secret = '5c609e6893ab3b65ce8940549a030bc165762fe171e0b38f880bd570099619bf';
  const body = '{"event":"file.completed","data":{"job_id":"j1"}}';
  const now = 1_700_000_000_000;
  const sign = (b: string, ts: string, s = secret) => `sha256=${createHmac('sha256', s).update(`${ts}.${b}`).digest('hex')}`;
  const check = (over: Partial<Parameters<typeof verifyWebhookDelivery>[0]> = {}) =>
    verifyWebhookDelivery({ payload: body, signature: sign(body, '1700000000'), timestamp: '1700000000', secret, now, ...over });

  it('accepts a correct signature', () => {
    expect(check()).toBe(true);
    expect(check({ timestamp: 1700000000 })).toBe(true);
  });

  it('rejects a changed body, secret or timestamp', () => {
    expect(check({ payload: body + ' ' })).toBe(false);
    expect(check({ secret: 'other' })).toBe(false);
    expect(check({ timestamp: '1700000001' })).toBe(false);
  });

  it('rejects old and future timestamps, and 0 turns the check off', () => {
    expect(check({ now: now + 301_000 })).toBe(false);
    expect(check({ now: now - 301_000 })).toBe(false);
    expect(check({ now: now + 300_000 })).toBe(true);
    expect(check({ now: now + 10_000_000_000, toleranceSeconds: 0 })).toBe(true);
  });

  it('rejects an empty secret even when the signature was made with it', () => {
    expect(check({ secret: '', signature: sign(body, '1700000000', '') })).toBe(false);
    expect(check({ secret: '  ', signature: sign(body, '1700000000', '  ') })).toBe(false);
  });

  it('rejects malformed and extreme timestamps and bad signatures', () => {
    for (const timestamp of ['yesterday', '-1', '-9223372036854775808', '99999999999999999999', '1.5', '', '1e9']) {
      expect(check({ timestamp, signature: sign(body, timestamp) })).toBe(false);
    }
    expect(check({ signature: 'sha256=' })).toBe(false);
    expect(check({ signature: 'sha256=zz' })).toBe(false);
    expect(check({ signature: undefined as unknown as string })).toBe(false);
  });

  it('accepts a bare hex digest', () => {
    expect(check({ signature: sign(body, '1700000000').slice('sha256='.length) })).toBe(true);
  });

  it('is available on the client, and the body-only method stays but rejects an empty secret', () => {
    const client = new BillionVerify({ apiKey: 'k' });
    expect(client.verifyWebhookDelivery({ payload: body, signature: sign(body, '1700000000'), timestamp: '1700000000', secret, now })).toBe(true);
    const bodyOnly = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(client.verifyWebhookSignature(body, bodyOnly, secret)).toBe(true);
    expect(client.verifyWebhookSignature(body, bodyOnly.replace(/.$/, '0'), secret)).toBe(false);
    expect(client.verifyWebhookSignature(body, 'sha256=anything', '')).toBe(false);
  });
});

describe('error classes', () => {
  it('AuthenticationError', () => {
    const e = new AuthenticationError('x');
    expect(e.statusCode).toBe(401);
    expect(e.code).toBe('INVALID_API_KEY');
  });

  it('RateLimitError carries retryAfter', () => {
    expect(new RateLimitError('slow', 30).retryAfter).toBe(30);
  });

  it('ValidationError carries details', () => {
    expect(new ValidationError('bad', 'why').details).toBe('why');
  });

  it('InsufficientCreditsError is HTTP 402', () => {
    expect(new InsufficientCreditsError().statusCode).toBe(402);
  });

  it('TimeoutError keeps a custom message', () => {
    expect(new TimeoutError('slow').message).toBe('slow');
  });
});
