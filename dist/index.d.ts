import { Readable } from 'node:stream';

interface BillionVerifyConfig {
    apiKey: string;
    /** Defaults to `https://api.billionverify.com/v1`. With or without the trailing `/v1`. */
    baseUrl?: string;
    /** Request timeout in milliseconds (default 30000). */
    timeout?: number;
    /** Total attempts for 429, 500, 502 and 503 responses (default 3). */
    retries?: number;
    /** Replaces the wait between attempts and polls. For tests. */
    sleep?: (ms: number) => Promise<void>;
}
interface VerifyOptions {
    /** Force SMTP checking on or off. Not sent when omitted, so the server default applies. */
    checkSmtp?: boolean;
    /** Skip every cache and verify live. A credit is always used. */
    forceRefresh?: boolean;
    /** Also fetch the MX IP reputation when a cached result is returned. */
    includeDomainReputation?: boolean;
}
type VerificationStatus = 'valid' | 'invalid' | 'unknown' | 'risky' | 'disposable' | 'catchall' | 'role';
interface DomainReputation {
    mx_ip?: string | null;
    is_listed?: boolean;
    blacklists?: string[];
    advisory?: string[];
    checked?: boolean;
    drop_listed?: boolean;
    drop_cidr?: string;
    drop_sblid?: string;
    drop_attribution?: string;
}
/** The result of verifying one address. Only the first four fields are always present. */
interface VerifyResponse {
    email: string;
    status: VerificationStatus;
    score: number;
    is_deliverable: boolean;
    is_disposable?: boolean;
    is_catchall?: boolean;
    is_role?: boolean;
    is_free?: boolean;
    domain?: string;
    domain_age?: number | null;
    mx_records?: string[] | null;
    mx_ip?: string | null;
    mx_asn?: number;
    mx_as_org?: string | null;
    domain_reputation?: DomainReputation | null;
    check_smtp?: boolean;
    /** @deprecated The API field is `check_smtp`. */
    smtp_check?: boolean;
    smtp_result?: 'not_checked' | 'deliverable' | 'undeliverable' | 'inconclusive';
    catch_all_evidence?: string;
    reason?: string;
    /** @deprecated Use `domain_suggestion`. */
    suggestion?: string;
    domain_suggestion?: string;
    alias_of?: string;
    risk_reasons?: string[];
    smtp_response?: string | null;
    response_time?: number;
    credits_used?: number;
    verification_mode?: string;
    /** True when re-running with `forceRefresh` could give a different result. */
    retryable?: boolean;
    smtputf8?: boolean;
    retry_after_seconds?: number | null;
}
interface BatchVerifyOptions extends VerifyOptions {
}
type BatchVerifyResultItem = VerifyResponse;
interface DeliverabilityBuckets {
    strict_deliverable: number;
    usable_with_catchall: number;
    not_deliverable: number;
    unknown: number;
    anti_verified: number;
    transient_failure: number;
}
interface BatchVerifyResponse {
    results: BatchVerifyResultItem[];
    total_emails: number;
    valid_emails: number;
    invalid_emails: number;
    credits_used: number;
    process_time: number;
    retryable_emails?: string[] | null;
    deferred_emails?: string[] | null;
    retry_after_seconds?: number | null;
    deliverability_buckets?: DeliverabilityBuckets | null;
}
interface DisposableCheckResponse {
    email: string;
    domain: string;
    is_disposable: boolean;
    checked_at?: string;
}
interface FileUploadOptions {
    checkSmtp?: boolean;
    emailColumn?: string;
    /** Keep the original columns in the result file. Not sent when omitted (the server default is true). */
    preserveOriginal?: boolean;
}
interface FileUploadResponse {
    task_id: string;
    status: string;
    message?: string;
    file_name?: string;
    file_size?: number;
    estimated_count?: number;
    unique_emails?: number | null;
    total_rows?: number | null;
    email_column?: string | null;
    email_column_candidates?: string[];
    status_url?: string;
    created_at?: string;
}
interface FileJobStatusOptions {
    /** Long-polling seconds (0-300). */
    timeout?: number;
}
type FileJobStatus = 'preparing' | 'pending' | 'running' | 'processing' | 'merging' | 'paused' | 'completed' | 'completed_with_warning' | 'failed' | 'cancelled';
interface FileJobRuntimeHints {
    has_live_execution?: boolean | null;
    inflight_batches?: number | null;
    last_execution_fact_at?: string | null;
}
interface FileJobStatusResponse {
    task_id: string;
    status: FileJobStatus;
    stage?: 'verifying' | 'retry_tail' | 'generating_report' | null;
    pending_retry_emails?: number | null;
    progress: number;
    email_progress?: number | null;
    chunk_progress?: number | null;
    progress_source?: string | null;
    total_emails: number;
    processed_emails: number;
    valid_emails: number;
    invalid_emails: number;
    role_emails: number;
    catchall_emails: number;
    unknown_emails: number;
    risky_emails?: number;
    disposable_emails: number;
    disposable_charged_emails?: number;
    credits_used: number;
    cache_hit_not_charged?: number | null;
    started_at?: string | null;
    completed_at?: string | null;
    error_message?: string | null;
    pause_reason?: string | null;
    can_pause?: boolean | null;
    can_resume?: boolean | null;
    can_restart?: boolean | null;
    restart_attempts?: number | null;
    current_attempt?: number | null;
    download_url?: string | null;
    direct_download_url?: string | null;
    direct_download_expires_at?: string | null;
    result_download_available?: boolean;
    result_download_expires_at?: string | null;
    result_download_unavailable_reason?: string | null;
    total_chunks?: number | null;
    completed_chunks?: number | null;
    failed_chunks?: number | null;
    runtime_hints?: FileJobRuntimeHints | null;
    capacity_wait?: {
        waiting_emails?: number;
        next_eligible_at?: string;
        waiting_since?: string;
    };
    deliverability_buckets?: DeliverabilityBuckets | null;
    unique_emails?: number | null;
    total_rows?: number | null;
    /** @deprecated The API returns `task_id`. */
    job_id?: string;
    /** @deprecated The API returns `progress`. */
    progress_percent?: number;
}
interface FileJobResultsOptions {
    valid?: boolean;
    invalid?: boolean;
    catchall?: boolean;
    role?: boolean;
    unknown?: boolean;
    disposable?: boolean;
    risky?: boolean;
}
interface CreditsResponse {
    account_id: string;
    api_key_id: string;
    api_key_name: string;
    credits_balance: number;
    credits_consumed: number;
    credits_added: number;
    last_updated: string;
}
type WebhookEvent = 'file.completed' | 'file.failed';
interface WebhookConfig {
    url: string;
    events: WebhookEvent[];
}
interface Webhook {
    id: string;
    url: string;
    events: WebhookEvent[];
    /** Returned only when the webhook is created. */
    secret?: string;
    is_active: boolean;
    last_delivery_status?: 'success' | 'failed' | null;
    last_delivery_at?: string | null;
    last_error?: string | null;
    created_at: string;
    updated_at: string;
}
interface WebhookPayload {
    event: WebhookEvent;
    timestamp: string;
    data: {
        job_id: string;
        file_name: string;
        total_emails: number;
        valid_emails: number;
        invalid_emails: number;
        role_emails: number;
        catchall_emails: number;
        unknown_emails: number;
        disposable_emails: number;
        credits_used: number;
        process_time_seconds: number;
        download_url: string;
        direct_download_url?: string;
        direct_download_expires_at?: string;
        error_message?: string;
        /** @deprecated No longer sent. */
        result_file_path?: string;
    };
}
interface WebhookDeliveryCheck {
    /** The raw request body, exactly as received. */
    payload: string;
    /** The `X-Webhook-Signature` header. */
    signature: string;
    /** The `X-Webhook-Timestamp` header (Unix seconds). */
    timestamp: string | number;
    /** The secret returned when the webhook was created. */
    secret: string;
    /** Largest accepted age in seconds, either direction (default 300). 0 turns the check off. */
    toleranceSeconds?: number;
    /** The current time in milliseconds (for tests). */
    now?: number;
}
interface HealthCheckResponse {
    status: string;
    time: number;
}
interface DomainSearchParams {
    domain: string;
    /** 1-200. Caps the bill: 5 credits per returned email. */
    maxEmails: number;
    includeRoleBased?: boolean;
    /** Crawl the sitemap up to this many pages instead of the default two passes. */
    maxPages?: number;
}
interface DomainSearchCreated {
    search_id: string;
    status: string;
    domain: string;
    credits_reserved: number;
    status_url?: string;
}
interface DomainSearchStatus {
    search_id: string;
    status: string;
    domain: string;
    credits_charged?: number;
    /** emails, crawl_report and warnings once the search has finished. */
    result?: {
        emails?: Array<Record<string, unknown>>;
        crawl_report?: Record<string, unknown>;
        warnings?: string[];
        [key: string]: unknown;
    };
}
interface DomainSearchBatchOptions {
    /** 1-200 per domain (server default 200). */
    maxEmails?: number;
    includeRoleBased?: boolean;
    maxPages?: number;
    /** Which CSV column holds the domain, e.g. `{ domain: 'Company Website' }`. */
    columnMap?: Record<string, string> | string;
}
interface DomainSearchBatchCreated {
    batch_id: string;
    status: string;
    total_rows: number;
    unique_domains: number;
    max_emails: number;
    include_role_based: boolean;
    max_pages?: number;
    status_url?: string;
    results_url?: string;
}
type DomainSearchBatchState = 'queued' | 'running' | 'completed' | 'completed_with_warning' | 'failed' | 'cancelled';
interface DomainSearchBatchStatus {
    batch_id: string;
    status: DomainSearchBatchState;
    max_emails?: number;
    max_pages?: number;
    progress?: {
        total_rows: number;
        processed: number;
        found: number;
        emails_returned: number;
        unique_domains: number;
    };
    credits_charged?: number;
}
interface DomainSearchBatchListOptions {
    limit?: number;
    status?: DomainSearchBatchState;
    cursor?: string;
}
interface DomainSearchBatchPage {
    items: DomainSearchBatchStatus[];
    has_more: boolean;
    next_cursor?: string;
}
interface ApiError {
    code: string;
    message: string;
    description?: string;
    details?: string;
}
interface ApiResponse<T> {
    success: boolean;
    code: string;
    message: string;
    data: T;
}

type UploadSource = Buffer | Uint8Array | Readable;
declare class BillionVerify {
    private readonly apiKey;
    /** The API root without a trailing `/v1`. */
    private readonly root;
    private readonly timeout;
    private readonly retries;
    private readonly sleepFn;
    constructor(config: BillionVerifyConfig);
    private buildUrl;
    private headers;
    /** One fetch with a timeout. Network failures become BillionVerifyError, never carrying the URL. */
    private fetchOnce;
    /** Sends a request, retrying 429, 500, 502 and 503 up to `retries` attempts in total. */
    private send;
    private retryAfter;
    private throwError;
    /** Raises for an error status; otherwise returns the envelope's `data` (or the body when there is none). */
    private unwrap;
    private call;
    /**
     * GET that follows redirects itself. The API key goes only to the API's own origin: result
     * files are served from a pre-signed storage URL on another host.
     */
    private download;
    private sleep;
    private static pathId;
    private static compact;
    private static toBlob;
    private static contentType;
    /**
     * Verify a single email address. Options you leave out are not sent, so the server default
     * applies.
     */
    verify(email: string, options?: VerifyOptions): Promise<VerifyResponse>;
    /**
     * Verify up to 50 emails in one synchronous request. Use uploadFile() for larger lists.
     */
    verifyBatch(emails: string[], options?: BatchVerifyOptions): Promise<BatchVerifyResponse>;
    /** Free lookup against the disposable-domain table (POST). */
    checkDisposable(email: string): Promise<DisposableCheckResponse>;
    /** Same as checkDisposable() with the address in the query string (GET). */
    checkDisposableViaQuery(email: string): Promise<DisposableCheckResponse>;
    /**
     * Upload a CSV, XLSX or TXT file of addresses for asynchronous verification.
     */
    uploadFile(file: UploadSource, fileName: string, options?: FileUploadOptions): Promise<FileUploadResponse>;
    /**
     * Get the status of a file verification job.
     * Supports long-polling with the timeout option (0-300 seconds).
     */
    getFileJobStatus(jobId: string, options?: FileJobStatusOptions): Promise<FileJobStatusResponse>;
    /**
     * Download the result CSV of a completed job. Returns the final response (read it with
     * `.text()` or `.arrayBuffer()`). Filters combine with OR. The redirect to the pre-signed
     * storage URL is followed here and the API key is not sent to the storage host.
     */
    getFileJobResults(jobId: string, options?: FileJobResultsOptions): Promise<Response>;
    /**
     * Poll until the job ends (completed, completed_with_warning, failed, cancelled) or pauses.
     * Intervals are in milliseconds.
     */
    waitForFileJobCompletion(jobId: string, pollInterval?: number, maxWait?: number): Promise<FileJobStatusResponse>;
    /** Resume a paused file job. Returns its status. */
    resumeJob(jobId: string): Promise<FileJobStatusResponse>;
    /**
     * Get current credit balance
     */
    getCredits(): Promise<CreditsResponse>;
    /**
     * Create a new webhook. The returned object carries the signing secret once; store it.
     */
    createWebhook(config: WebhookConfig): Promise<Webhook>;
    /**
     * List all webhooks
     */
    listWebhooks(): Promise<{
        webhooks: Webhook[];
        total: number;
    }>;
    /**
     * Delete a webhook
     */
    deleteWebhook(webhookId: string): Promise<void>;
    /**
     * Verify a webhook delivery: HMAC-SHA256 over `"<X-Webhook-Timestamp>.<raw body>"` and the age
     * of the delivery (300 seconds by default). Recommended.
     */
    verifyWebhookDelivery(check: WebhookDeliveryCheck): boolean;
    /**
     * Verify a webhook signature computed over the body alone.
     *
     * @deprecated The server signs `"<timestamp>.<body>"`, so this never matches a real delivery.
     * Use verifyWebhookDelivery().
     */
    verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
    /**
     * Start a domain search: the emails published on a company's site, each verified. Costs
     * 5 credits per returned email; `maxEmails` (1-200) caps the bill.
     */
    createDomainSearch(params: DomainSearchParams): Promise<DomainSearchCreated>;
    getDomainSearch(searchId: string): Promise<DomainSearchStatus>;
    /** Poll until the search is completed, completed_with_warning or failed. Intervals are in milliseconds. */
    waitForDomainSearch(searchId: string, pollInterval?: number, maxWait?: number): Promise<DomainSearchStatus>;
    /** Upload a CSV of domains. The results CSV has one row per returned email. */
    createDomainSearchBatch(file: UploadSource, fileName: string, options?: DomainSearchBatchOptions): Promise<DomainSearchBatchCreated>;
    /** One page of batches: `items`, `has_more` and `next_cursor`. */
    listDomainSearchBatches(options?: DomainSearchBatchListOptions): Promise<DomainSearchBatchPage>;
    getDomainSearchBatch(batchId: string): Promise<DomainSearchBatchStatus>;
    /** The results CSV of a finished batch as a Response. Before the batch ends the API answers 409. */
    downloadDomainSearchBatchResults(batchId: string): Promise<Response>;
    private static checkMaxEmails;
    /**
     * Health check endpoint (no authentication required)
     */
    healthCheck(): Promise<HealthCheckResponse>;
}

/**
 * Verifies a webhook delivery: `X-Webhook-Signature` is `sha256=<hex>`, an HMAC-SHA256 keyed
 * with the webhook secret over `"<X-Webhook-Timestamp>.<raw body>"`. Deliveries older (or
 * newer) than the tolerance are rejected.
 */
declare function verifyWebhookDelivery(check: WebhookDeliveryCheck): boolean;

declare class BillionVerifyError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly details?: string;
    constructor(message: string, code: string, statusCode: number, details?: string);
}
declare class AuthenticationError extends BillionVerifyError {
    constructor(message?: string);
}
declare class RateLimitError extends BillionVerifyError {
    readonly retryAfter: number;
    constructor(message?: string, retryAfter?: number);
}
declare class ValidationError extends BillionVerifyError {
    constructor(message: string, details?: string);
}
declare class InsufficientCreditsError extends BillionVerifyError {
    constructor(message?: string);
}
declare class NotFoundError extends BillionVerifyError {
    constructor(message?: string);
}
declare class TimeoutError extends BillionVerifyError {
    constructor(message?: string);
}

export { type ApiError, type ApiResponse, AuthenticationError, type BatchVerifyOptions, type BatchVerifyResponse, type BatchVerifyResultItem, BillionVerify, type BillionVerifyConfig, BillionVerifyError, type CreditsResponse, type DeliverabilityBuckets, type DisposableCheckResponse, type DomainReputation, type DomainSearchBatchCreated, type DomainSearchBatchListOptions, type DomainSearchBatchOptions, type DomainSearchBatchPage, type DomainSearchBatchState, type DomainSearchBatchStatus, type DomainSearchCreated, type DomainSearchParams, type DomainSearchStatus, type FileJobResultsOptions, type FileJobRuntimeHints, type FileJobStatus, type FileJobStatusOptions, type FileJobStatusResponse, type FileUploadOptions, type FileUploadResponse, type HealthCheckResponse, InsufficientCreditsError, NotFoundError, RateLimitError, TimeoutError, ValidationError, type VerificationStatus, type VerifyOptions, type VerifyResponse, type Webhook, type WebhookConfig, type WebhookDeliveryCheck, type WebhookEvent, type WebhookPayload, verifyWebhookDelivery };
