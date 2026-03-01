"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AuthenticationError: () => AuthenticationError,
  BillionVerify: () => BillionVerify,
  BillionVerifyError: () => BillionVerifyError,
  InsufficientCreditsError: () => InsufficientCreditsError,
  NotFoundError: () => NotFoundError,
  RateLimitError: () => RateLimitError,
  TimeoutError: () => TimeoutError,
  ValidationError: () => ValidationError
});
module.exports = __toCommonJS(index_exports);

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

// src/client.ts
var DEFAULT_BASE_URL = "https://api.billionverify.com/v1";
var DEFAULT_TIMEOUT = 3e4;
var DEFAULT_RETRIES = 3;
var BillionVerify = class {
  apiKey;
  baseUrl;
  timeout;
  retries;
  constructor(config) {
    if (!config.apiKey) {
      throw new AuthenticationError("API key is required");
    }
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
  }
  async request(method, path, body, attempt = 1, options) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const requestTimeout = options?.customTimeout ?? this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);
    try {
      const headers = {
        "Content-Type": "application/json",
        "User-Agent": "billionverify-sdk/1.0.4"
      };
      if (!options?.skipAuth) {
        headers["EV-API-KEY"] = this.apiKey;
      }
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        await this.handleErrorResponse(response, attempt, method, path, body, options);
      }
      if (response.status === 204) {
        return void 0;
      }
      const json = await response.json();
      return json.data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof BillionVerifyError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(`Request timed out after ${requestTimeout}ms`);
      }
      throw new BillionVerifyError(
        `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "NETWORK_ERROR",
        0
      );
    }
  }
  async requestMultipart(path, formData, attempt = 1) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "EV-API-KEY": this.apiKey,
          "User-Agent": "billionverify-sdk/1.0.4"
        },
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        await this.handleErrorResponse(response, attempt, "POST", path, formData);
      }
      const json = await response.json();
      return json.data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof BillionVerifyError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(`Request timed out after ${this.timeout}ms`);
      }
      throw new BillionVerifyError(
        `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "NETWORK_ERROR",
        0
      );
    }
  }
  async handleErrorResponse(response, attempt, method, path, body, options) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch {
    }
    const error = errorData.error;
    const message = error?.message || response.statusText;
    const code = error?.code || "UNKNOWN_ERROR";
    switch (response.status) {
      case 401:
        throw new AuthenticationError(message);
      case 402:
        throw new InsufficientCreditsError(message);
      case 404:
        throw new NotFoundError(message);
      case 429:
        const retryAfter = parseInt(response.headers.get("Retry-After") || "0", 10);
        if (attempt < this.retries) {
          await this.sleep((retryAfter || Math.pow(2, attempt)) * 1e3);
          return this.request(method, path, body, attempt + 1, options);
        }
        throw new RateLimitError(message, retryAfter);
      case 400:
        throw new ValidationError(message, error?.details);
      case 500:
      case 502:
      case 503:
        if (attempt < this.retries) {
          await this.sleep(Math.pow(2, attempt) * 1e3);
          return this.request(method, path, body, attempt + 1, options);
        }
        throw new BillionVerifyError(message, code, response.status);
      default:
        throw new BillionVerifyError(message, code, response.status);
    }
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Verify a single email address
   */
  async verify(email, options) {
    return this.request("POST", "/verify/single", {
      email,
      check_smtp: options?.checkSmtp ?? true
    });
  }
  /**
   * Verify multiple emails synchronously (max 50 emails)
   */
  async verifyBatch(emails, options) {
    if (emails.length > 50) {
      throw new ValidationError("Maximum 50 emails per batch request. For larger lists, use uploadFile().");
    }
    return this.request("POST", "/verify/bulk", {
      emails,
      check_smtp: options?.checkSmtp ?? true
    });
  }
  /**
   * Upload a file for asynchronous verification
   */
  async uploadFile(file, fileName, options) {
    const formData = new FormData();
    let fileBlob;
    if (Buffer.isBuffer(file)) {
      fileBlob = new Blob([file]);
    } else {
      const chunks = [];
      for await (const chunk of file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      fileBlob = new Blob([Buffer.concat(chunks)]);
    }
    formData.append("file", fileBlob, fileName);
    if (options?.checkSmtp !== void 0) {
      formData.append("check_smtp", String(options.checkSmtp));
    }
    if (options?.emailColumn) {
      formData.append("email_column", options.emailColumn);
    }
    if (options?.preserveOriginal !== void 0) {
      formData.append("preserve_original", String(options.preserveOriginal));
    }
    return this.requestMultipart("/verify/file", formData);
  }
  /**
   * Get the status of a file verification job
   * Supports long-polling with timeout parameter (0-300 seconds)
   */
  async getFileJobStatus(jobId, options) {
    const params = new URLSearchParams();
    if (options?.timeout !== void 0) {
      if (options.timeout < 0 || options.timeout > 300) {
        throw new ValidationError("Timeout must be between 0 and 300 seconds");
      }
      params.set("timeout", options.timeout.toString());
    }
    const query = params.toString();
    const path = `/verify/file/${jobId}${query ? `?${query}` : ""}`;
    const customTimeout = options?.timeout ? (options.timeout + 10) * 1e3 : void 0;
    return this.request("GET", path, void 0, 1, { customTimeout });
  }
  /**
   * Get the results of a completed file verification job
   * Can filter by status types (valid, invalid, catchall, role, unknown, disposable, risky)
   */
  async getFileJobResults(jobId, options) {
    const params = new URLSearchParams();
    if (options?.valid) params.set("valid", "true");
    if (options?.invalid) params.set("invalid", "true");
    if (options?.catchall) params.set("catchall", "true");
    if (options?.role) params.set("role", "true");
    if (options?.unknown) params.set("unknown", "true");
    if (options?.disposable) params.set("disposable", "true");
    if (options?.risky) params.set("risky", "true");
    const query = params.toString();
    const path = `/verify/file/${jobId}/results${query ? `?${query}` : ""}`;
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "EV-API-KEY": this.apiKey,
        "User-Agent": "billionverify-sdk/1.0.4"
      },
      redirect: "follow"
    });
    if (!response.ok) {
      await this.handleErrorResponse(response, 1, "GET", path);
    }
    return response;
  }
  /**
   * Poll for file job completion
   */
  async waitForFileJobCompletion(jobId, pollInterval = 5e3, maxWait = 6e5) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      const status = await this.getFileJobStatus(jobId);
      if (status.status === "completed" || status.status === "failed") {
        return status;
      }
      await this.sleep(pollInterval);
    }
    throw new TimeoutError(`File job ${jobId} did not complete within ${maxWait}ms`);
  }
  /**
   * Get current credit balance
   */
  async getCredits() {
    return this.request("GET", "/credits");
  }
  /**
   * Create a new webhook
   */
  async createWebhook(config) {
    return this.request("POST", "/webhooks", config);
  }
  /**
   * List all webhooks
   */
  async listWebhooks() {
    return this.request("GET", "/webhooks");
  }
  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId) {
    await this.request("DELETE", `/webhooks/${webhookId}`);
  }
  /**
   * Verify a webhook signature
   */
  verifyWebhookSignature(payload, signature, secret) {
    const crypto = require("crypto");
    const expectedSignature = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
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
  async healthCheck() {
    const url = this.baseUrl.replace(/\/v1$/, "") + "/health";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "billionverify-sdk/1.0.4"
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new BillionVerifyError(
          response.statusText || "Health check failed",
          "HEALTH_CHECK_FAILED",
          response.status
        );
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof BillionVerifyError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(`Request timed out after ${this.timeout}ms`);
      }
      throw new BillionVerifyError(
        `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
        "NETWORK_ERROR",
        0
      );
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AuthenticationError,
  BillionVerify,
  BillionVerifyError,
  InsufficientCreditsError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  ValidationError
});
