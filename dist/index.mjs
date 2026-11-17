// src/client.ts
import { createHmac as createHmac2, timingSafeEqual as timingSafeEqual2 } from "crypto";
import { Readable } from "stream";

// src/errors.ts
var BillionVerifyError = class _BillionVerifyError extends Error {
  code;
  statusCode;
  details;
  constructor(message, code, statusCode, details) {
    super(message);
    this.name = "BillionVerifyError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, _BillionVerifyError.prototype);
  }
};
var AuthenticationError = class _AuthenticationError extends BillionVerifyError {
  constructor(message = "Invalid or missing API key") {
    super(message, "INVALID_API_KEY", 401);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, _AuthenticationError.prototype);
  }
};
var RateLimitError = class _RateLimitError extends BillionVerifyError {
  retryAfter;
  constructor(message = "Rate limit exceeded", retryAfter = 0) {
    super(message, "RATE_LIMIT_EXCEEDED", 429);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, _RateLimitError.prototype);
  }
};
var ValidationError = class _ValidationError extends BillionVerifyError {
  constructor(message, details) {
    super(message, "INVALID_REQUEST", 400, details);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, _ValidationError.prototype);
  }
};
var InsufficientCreditsError = class _InsufficientCreditsError extends BillionVerifyError {
  constructor(message = "Insufficient credits") {
    super(message, "INSUFFICIENT_CREDITS", 402);
    this.name = "InsufficientCreditsError";
    Object.setPrototypeOf(this, _InsufficientCreditsError.prototype);
  }
};
var NotFoundError = class _NotFoundError extends BillionVerifyError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, _NotFoundError.prototype);
  }
};
var TimeoutError = class _TimeoutError extends BillionVerifyError {
  constructor(message = "Request timed out") {
    super(message, "TIMEOUT", 504);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, _TimeoutError.prototype);
  }
};

// src/webhook.ts
import { createHmac, timingSafeEqual } from "crypto";
var DEFAULT_TOLERANCE_SECONDS = 300;
function verifyWebhookDelivery(check) {
  const { payload, signature, secret } = check;
  if (typeof payload !== "string" || typeof signature !== "string" || typeof secret !== "string" || secret.trim() === "" || check.timestamp === void 0 || check.timestamp === null) {
    return false;
  }
  const timestamp = String(check.timestamp).trim();
  if (!/^\d{1,15}$/.test(timestamp)) {
    return false;
  }
  const tolerance = check.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (tolerance > 0) {
    const nowSeconds = Math.floor((check.now ?? Date.now()) / 1e3);
    if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) {
      return false;
    }
  }
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
  let given = signature.trim();
  if (!given.startsWith("sha256=")) {
    given = `sha256=${given}`;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// src/client.ts
var DEFAULT_BASE_URL = "https://api.billionverify.com/v1";
var DEFAULT_TIMEOUT = 3e4;
var DEFAULT_RETRIES = 3;
var MAX_BATCH_EMAILS = 50;
var MAX_REDIRECTS = 5;
var USER_AGENT = "billionverify-sdk/1.1.0";
var RETRYABLE_STATUSES = [429, 500, 502, 503];
var REDIRECT_STATUSES = [301, 302, 303, 307, 308];
var FILE_JOB_DONE = ["completed", "completed_with_warning", "failed", "cancelled", "paused"];
var DOMAIN_SEARCH_DONE = ["completed", "completed_with_warning", "failed"];
var BillionVerify = class _BillionVerify {
  apiKey;
  /** The API root without a trailing `/v1`. */
  root;
  timeout;
  retries;
  sleepFn;
  constructor(config) {
    if (!config.apiKey) {
      throw new AuthenticationError("API key is required");
    }
    this.apiKey = config.apiKey;
    this.root = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "").replace(/\/v1$/, "");
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
    this.sleepFn = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }
  // ----- HTTP plumbing ---------------------------------------------------
  buildUrl(path, query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== void 0) {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    return `${this.root}${path}${qs ? `?${qs}` : ""}`;
  }
  headers(auth, json) {
    const headers = {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    };
    if (json) {
      headers["Content-Type"] = "application/json";
    }
    if (auth) {
      headers["BV-API-KEY"] = this.apiKey;
    }
    return headers;
  }
  /** One fetch with a timeout. Network failures become BillionVerifyError, never carrying the URL. */
  async fetchOnce(url, init, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
      }
      throw new BillionVerifyError(
        `Network error: ${error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[url]") : "Unknown error"}`,
        "NETWORK_ERROR",
        0
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
  /** Sends a request, retrying 429, 500, 502 and 503 up to `retries` attempts in total. */
  async send(method, path, options = {}) {
    const url = this.buildUrl(path, options.query);
    const timeoutMs = options.timeout ?? this.timeout;
    for (let attempt = 1; ; attempt++) {
      const init = {
        method,
        headers: this.headers(options.auth !== false, options.json !== void 0),
        redirect: "manual"
      };
      if (options.json !== void 0) {
        init.body = JSON.stringify(options.json);
      } else if (options.form) {
        init.body = options.form();
      }
      const response = await this.fetchOnce(url, init, timeoutMs);
      if (RETRYABLE_STATUSES.includes(response.status) && attempt < this.retries) {
        const retryAfter = this.retryAfter(response);
        const seconds = response.status === 429 && retryAfter > 0 ? retryAfter : Math.pow(2, attempt);
        await this.sleepFn(seconds * 1e3);
        continue;
      }
      return response;
    }
  }
  retryAfter(response) {
    const value = parseInt(response.headers?.get("Retry-After") ?? "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  async throwError(response) {
    let message = response.statusText || `HTTP ${response.status}`;
    let code = "UNKNOWN_ERROR";
    let details;
    try {
      const body = await response.json();
      message = body.error?.message || body.message || message;
      code = body.error?.code || code;
      details = body.error?.details ?? body.error?.description;
    } catch {
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
  async unwrap(response) {
    if (!response.ok) {
      await this.throwError(response);
    }
    if (response.status === 204) {
      return void 0;
    }
    let body;
    try {
      const text = await response.text();
      if (text.trim() === "") {
        return void 0;
      }
      body = JSON.parse(text);
    } catch {
      throw new BillionVerifyError("Invalid JSON in response", "INVALID_RESPONSE", response.status);
    }
    if (body && typeof body === "object" && "success" in body && "data" in body) {
      return body.data;
    }
    return body;
  }
  async call(method, path, options = {}) {
    return this.unwrap(await this.send(method, path, options));
  }
  /**
   * GET that follows redirects itself. The API key goes only to the API's own origin: result
   * files are served from a pre-signed storage URL on another host.
   */
  async download(path, query) {
    let url = this.buildUrl(path, query);
    let auth = true;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let response;
      if (hop === 0) {
        response = await this.send("GET", path, { query });
      } else {
        response = await this.fetchOnce(
          url,
          { method: "GET", headers: this.headers(auth, false), redirect: "manual" },
          this.timeout
        );
      }
      if (response.ok) {
        return response;
      }
      const location = response.headers?.get("Location");
      if (REDIRECT_STATUSES.includes(response.status) && location) {
        const next = new URL(location, url);
        auth = auth && next.origin === new URL(this.root).origin;
        url = next.toString();
        continue;
      }
      await this.throwError(response);
    }
    throw new BillionVerifyError("Too many redirects", "TOO_MANY_REDIRECTS", 0);
  }
  sleep(ms) {
    return this.sleepFn(ms);
  }
  static pathId(id) {
    if (!id) {
      throw new ValidationError("id is required");
    }
    return encodeURIComponent(id);
  }
  static compact(values) {
    return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== void 0));
  }
  static async toBlob(source, fileName) {
    let bytes;
    if (source instanceof Readable) {
      const chunks = [];
      for await (const chunk of source) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks);
    } else {
      bytes = source;
    }
    return new Blob([bytes], { type: _BillionVerify.contentType(fileName) });
  }
  static contentType(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".csv")) return "text/csv";
    if (lower.endsWith(".txt")) return "text/plain";
    if (lower.endsWith(".xlsx")) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    return "application/octet-stream";
  }
  // ----- Verification ----------------------------------------------------
  /**
   * Verify a single email address. Options you leave out are not sent, so the server default
   * applies.
   */
  async verify(email, options) {
    return this.call("POST", "/v1/verify/single", {
      json: _BillionVerify.compact({
        email,
        check_smtp: options?.checkSmtp,
        force_refresh: options?.forceRefresh,
        include_domain_reputation: options?.includeDomainReputation
      })
    });
  }
  /**
   * Verify up to 50 emails in one synchronous request. Use uploadFile() for larger lists.
   */
  async verifyBatch(emails, options) {
    if (emails.length > MAX_BATCH_EMAILS) {
      throw new ValidationError("Maximum 50 emails per batch request. For larger lists, use uploadFile().");
    }
    return this.call("POST", "/v1/verify/bulk", {
      json: _BillionVerify.compact({
        emails,
        check_smtp: options?.checkSmtp,
        force_refresh: options?.forceRefresh,
        include_domain_reputation: options?.includeDomainReputation
      })
    });
  }
  /** Free lookup against the disposable-domain table (POST). */
  async checkDisposable(email) {
    return this.call("POST", "/v1/verify/disposable", { json: { email } });
  }
  /** Same as checkDisposable() with the address in the query string (GET). */
  async checkDisposableViaQuery(email) {
    return this.call("GET", "/v1/verify/disposable", { query: { email } });
  }
  // ----- File verification -----------------------------------------------
  /**
   * Upload a CSV, XLSX or TXT file of addresses for asynchronous verification.
   */
  async uploadFile(file, fileName, options) {
    const blob = await _BillionVerify.toBlob(file, fileName);
    return this.call("POST", "/v1/verify/file", {
      form: () => {
        const formData = new FormData();
        formData.append("file", blob, fileName);
        if (options?.checkSmtp !== void 0) {
          formData.append("check_smtp", String(options.checkSmtp));
        }
        if (options?.emailColumn) {
          formData.append("email_column", options.emailColumn);
        }
        if (options?.preserveOriginal !== void 0) {
          formData.append("preserve_original", String(options.preserveOriginal));
        }
        return formData;
      }
    });
  }
  /**
   * Get the status of a file verification job.
   * Supports long-polling with the timeout option (0-300 seconds).
   */
  async getFileJobStatus(jobId, options) {
    const query = {};
    let customTimeout;
    if (options?.timeout !== void 0) {
      if (options.timeout < 0 || options.timeout > 300) {
        throw new ValidationError("Timeout must be between 0 and 300 seconds");
      }
      query.timeout = options.timeout;
      if (options.timeout > 0) {
        customTimeout = (options.timeout + 10) * 1e3;
      }
    }
    return this.call("GET", `/v1/verify/file/${_BillionVerify.pathId(jobId)}`, {
      query,
      timeout: customTimeout
    });
  }
  /**
   * Download the result CSV of a completed job. Returns the final response (read it with
   * `.text()` or `.arrayBuffer()`). Filters combine with OR. The redirect to the pre-signed
   * storage URL is followed here and the API key is not sent to the storage host.
   */
  async getFileJobResults(jobId, options) {
    const query = {};
    for (const key of ["valid", "invalid", "catchall", "role", "unknown", "disposable", "risky"]) {
      if (options?.[key]) {
        query[key] = "true";
      }
    }
    return this.download(`/v1/verify/file/${_BillionVerify.pathId(jobId)}/results`, query);
  }
  /**
   * Poll until the job ends (completed, completed_with_warning, failed, cancelled) or pauses.
   * Intervals are in milliseconds.
   */
  async waitForFileJobCompletion(jobId, pollInterval = 5e3, maxWait = 6e5) {
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
  async resumeJob(jobId) {
    return this.call("POST", `/v1/jobs/${_BillionVerify.pathId(jobId)}/resume`);
  }
  // ----- Account ---------------------------------------------------------
  /**
   * Get current credit balance
   */
  async getCredits() {
    return this.call("GET", "/v1/credits");
  }
  // ----- Webhooks --------------------------------------------------------
  /**
   * Create a new webhook. The returned object carries the signing secret once; store it.
   */
  async createWebhook(config) {
    return this.call("POST", "/v1/webhooks", { json: config });
  }
  /**
   * List all webhooks
   */
  async listWebhooks() {
    return this.call("GET", "/v1/webhooks");
  }
  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId) {
    await this.call("DELETE", `/v1/webhooks/${_BillionVerify.pathId(webhookId)}`);
  }
  /**
   * Verify a webhook delivery: HMAC-SHA256 over `"<X-Webhook-Timestamp>.<raw body>"` and the age
   * of the delivery (300 seconds by default). Recommended.
   */
  verifyWebhookDelivery(check) {
    return verifyWebhookDelivery(check);
  }
  /**
   * Verify a webhook signature computed over the body alone.
   *
   * @deprecated The server signs `"<timestamp>.<body>"`, so this never matches a real delivery.
   * Use verifyWebhookDelivery().
   */
  verifyWebhookSignature(payload, signature, secret) {
    if (!secret) {
      return false;
    }
    const expected = Buffer.from(`sha256=${createHmac2("sha256", secret).update(payload).digest("hex")}`);
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual2(expected, given);
  }
  // ----- Domain search (email finder) ------------------------------------
  /**
   * Start a domain search: the emails published on a company's site, each verified. Costs
   * 5 credits per returned email; `maxEmails` (1-200) caps the bill.
   */
  async createDomainSearch(params) {
    _BillionVerify.checkMaxEmails(params.maxEmails);
    return this.call("POST", "/v1/domain/search", {
      json: _BillionVerify.compact({
        domain: params.domain,
        max_emails: params.maxEmails,
        include_role_based: params.includeRoleBased,
        max_pages: params.maxPages
      })
    });
  }
  async getDomainSearch(searchId) {
    return this.call("GET", `/v1/domain/search/${_BillionVerify.pathId(searchId)}`);
  }
  /** Poll until the search is completed, completed_with_warning or failed. Intervals are in milliseconds. */
  async waitForDomainSearch(searchId, pollInterval = 5e3, maxWait = 6e5) {
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
  async createDomainSearchBatch(file, fileName, options) {
    if (options?.maxEmails !== void 0) {
      _BillionVerify.checkMaxEmails(options.maxEmails);
    }
    const blob = await _BillionVerify.toBlob(file, fileName);
    return this.call("POST", "/v1/domain/search/batch", {
      form: () => {
        const formData = new FormData();
        formData.append("file", blob, fileName);
        if (options?.maxEmails !== void 0) {
          formData.append("max_emails", String(options.maxEmails));
        }
        if (options?.includeRoleBased !== void 0) {
          formData.append("include_role_based", String(options.includeRoleBased));
        }
        if (options?.maxPages !== void 0) {
          formData.append("max_pages", String(options.maxPages));
        }
        if (options?.columnMap !== void 0) {
          formData.append(
            "column_map",
            typeof options.columnMap === "string" ? options.columnMap : JSON.stringify(options.columnMap)
          );
        }
        return formData;
      }
    });
  }
  /** One page of batches: `items`, `has_more` and `next_cursor`. */
  async listDomainSearchBatches(options) {
    return this.call("GET", "/v1/domain/search/batch", {
      query: { limit: options?.limit, status: options?.status, cursor: options?.cursor }
    });
  }
  async getDomainSearchBatch(batchId) {
    return this.call(
      "GET",
      `/v1/domain/search/batch/${_BillionVerify.pathId(batchId)}`
    );
  }
  /** The results CSV of a finished batch as a Response. Before the batch ends the API answers 409. */
  async downloadDomainSearchBatchResults(batchId) {
    return this.download(`/v1/domain/search/batch/${_BillionVerify.pathId(batchId)}/results`);
  }
  static checkMaxEmails(value) {
    if (!Number.isInteger(value) || value < 1 || value > 200) {
      throw new ValidationError("maxEmails must be an integer between 1 and 200");
    }
  }
  // ----- Health ----------------------------------------------------------
  /**
   * Health check endpoint (no authentication required)
   */
  async healthCheck() {
    const response = await this.send("GET", "/health", { auth: false });
    if (!response.ok) {
      throw new BillionVerifyError(
        response.statusText || "Health check failed",
        "HEALTH_CHECK_FAILED",
        response.status
      );
    }
    return this.unwrap(response);
  }
};
export {
  AuthenticationError,
  BillionVerify,
  BillionVerifyError,
  InsufficientCreditsError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  ValidationError,
  verifyWebhookDelivery
};
