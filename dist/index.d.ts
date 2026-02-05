import { Readable } from 'stream';

interface EmailVerifyConfig {
    apiKey: string;
    baseUrl?: string;
    timeout?: number;
    retries?: number;
}
interface VerifyOptions {
    checkSmtp?: boolean;
}
type VerificationStatus = 'valid' | 'invalid' | 'unknown' | 'risky' | 'disposable' | 'catchall' | 'role';
interface DomainReputation {
    mx_ip?: string;
    is_listed?: boolean;
    blacklists?: string[];
    checked?: boolean;
}
interface VerifyResponse {
    email: string;
    status: VerificationStatus;
    score: number;
    is_deliverable: boolean;
    is_disposable: boolean;
    is_catchall: boolean;
    is_role: boolean;
    is_free: boolean;
    domain: string;
    domain_age?: number;
    mx_records?: string[];
    domain_reputation?: DomainReputation;
    smtp_check: boolean;
    reason?: string;
    suggestion?: string;
    response_time: number;
    credits_used: number;
}
interface BatchVerifyOptions {
    checkSmtp?: boolean;
}
interface BatchVerifyResultItem {
    email: string;
    status: VerificationStatus;
    score: number;
    is_deliverable: boolean;
    is_disposable?: boolean;
    is_catchall?: boolean;
    is_role?: boolean;
    is_free?: boolean;
    credits_used: number;
}
interface BatchVerifyResponse {
    results: BatchVerifyResultItem[];
    total_emails: number;
    valid_emails: number;
    invalid_emails: number;
    credits_used: number;
    process_time: number;
}
interface FileUploadOptions {
    checkSmtp?: boolean;
    emailColumn?: string;
    preserveOriginal?: boolean;
}
interface FileUploadResponse {
    task_id: string;
    status: string;
    message: string;
    file_name: string;
    file_size: number;
    estimated_count: number;
    unique_emails: number;
    total_rows: number;
    email_column: string;
    status_url: string;
    created_at: string;
}
interface FileJobStatusOptions {
    timeout?: number;
}
interface FileJobStatusResponse {
    job_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    file_name: string;
    total_emails: number;
    processed_emails: number;
    progress_percent: number;
    valid_emails: number;
    invalid_emails: number;
    unknown_emails: number;
    role_emails: number;
    catchall_emails: number;
    disposable_emails: number;
    credits_used: number;
    process_time_seconds?: number;
    result_file_path?: string;
    download_url?: string;
    created_at: string;
    completed_at?: string;
    error_message?: string;
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
interface WebhookConfig {
    url: string;
    events: WebhookEvent[];
}
type WebhookEvent = 'file.completed' | 'file.failed';
interface Webhook {
    id: string;
    url: string;
    events: WebhookEvent[];
    secret?: string;
    is_active: boolean;
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
        result_file_path: string;
        download_url: string;
    };
}
interface HealthCheckResponse {
    status: string;
    time: number;
}
interface ApiError {
    code: string;
    message: string;
    details?: string;
}
interface ApiResponse<T> {
    success: boolean;
    code: string;
    message: string;
    data: T;
}

declare class EmailVerify {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeout;
    private readonly retries;
    constructor(config: EmailVerifyConfig);
    private request;
    private requestMultipart;
    private handleErrorResponse;
    private sleep;
    /**
     * Verify a single email address
     */
    verify(email: string, options?: VerifyOptions): Promise<VerifyResponse>;
    /**
     * Verify multiple emails synchronously (max 50 emails)
     */
    verifyBatch(emails: string[], options?: BatchVerifyOptions): Promise<BatchVerifyResponse>;
    /**
     * Upload a file for asynchronous verification
     */
    uploadFile(file: Buffer | Readable, fileName: string, options?: FileUploadOptions): Promise<FileUploadResponse>;
    /**
     * Get the status of a file verification job
     * Supports long-polling with timeout parameter (0-300 seconds)
     */
    getFileJobStatus(jobId: string, options?: FileJobStatusOptions): Promise<FileJobStatusResponse>;
    /**
     * Get the results of a completed file verification job
     * Can filter by status types (valid, invalid, catchall, role, unknown, disposable, risky)
     */
    getFileJobResults(jobId: string, options?: FileJobResultsOptions): Promise<Response>;
    /**
     * Poll for file job completion
     */
    waitForFileJobCompletion(jobId: string, pollInterval?: number, maxWait?: number): Promise<FileJobStatusResponse>;
    /**
     * Get current credit balance
     */
    getCredits(): Promise<CreditsResponse>;
    /**
     * Create a new webhook
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
     * Verify a webhook signature
     */
    verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
    /**
     * Health check endpoint (no authentication required)
     */
    healthCheck(): Promise<HealthCheckResponse>;
}

declare class EmailVerifyError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly details?: string;
    constructor(message: string, code: string, statusCode: number, details?: string);
}
declare class AuthenticationError extends EmailVerifyError {
    constructor(message?: string);
}
declare class RateLimitError extends EmailVerifyError {
    readonly retryAfter: number;
    constructor(message?: string, retryAfter?: number);
}
declare class ValidationError extends EmailVerifyError {
    constructor(message: string, details?: string);
}
declare class InsufficientCreditsError extends EmailVerifyError {
    constructor(message?: string);
}
declare class NotFoundError extends EmailVerifyError {
    constructor(message?: string);
}
declare class TimeoutError extends EmailVerifyError {
    constructor(message?: string);
}

export { type ApiError, type ApiResponse, AuthenticationError, type BatchVerifyOptions, type BatchVerifyResponse, type BatchVerifyResultItem, type CreditsResponse, type DomainReputation, EmailVerify, type EmailVerifyConfig, EmailVerifyError, type FileJobResultsOptions, type FileJobStatusOptions, type FileJobStatusResponse, type FileUploadOptions, type FileUploadResponse, type HealthCheckResponse, InsufficientCreditsError, NotFoundError, RateLimitError, TimeoutError, ValidationError, type VerificationStatus, type VerifyOptions, type VerifyResponse, type Webhook, type WebhookConfig, type WebhookEvent, type WebhookPayload };
