export interface BillionVerifyConfig {
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

export interface VerifyOptions {
  /** Force SMTP checking on or off. Not sent when omitted, so the server default applies. */
  checkSmtp?: boolean;
  /** Skip every cache and verify live. A credit is always used. */
  forceRefresh?: boolean;
  /** Also fetch the MX IP reputation when a cached result is returned. */
  includeDomainReputation?: boolean;
}

export type VerificationStatus =
  | 'valid'
  | 'invalid'
  | 'unknown'
  | 'risky'
  | 'disposable'
  | 'catchall'
  | 'role';

export interface DomainReputation {
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
export interface VerifyResponse {
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

export interface BatchVerifyOptions extends VerifyOptions {}

export type BatchVerifyResultItem = VerifyResponse;

export interface DeliverabilityBuckets {
  strict_deliverable: number;
  usable_with_catchall: number;
  not_deliverable: number;
  unknown: number;
  anti_verified: number;
  transient_failure: number;
}

export interface BatchVerifyResponse {
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

export interface DisposableCheckResponse {
  email: string;
  domain: string;
  is_disposable: boolean;
  checked_at?: string;
}

export interface FileUploadOptions {
  checkSmtp?: boolean;
  emailColumn?: string;
  /** Keep the original columns in the result file. Not sent when omitted (the server default is true). */
  preserveOriginal?: boolean;
}

export interface FileUploadResponse {
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

export interface FileJobStatusOptions {
  /** Long-polling seconds (0-300). */
  timeout?: number;
}

export type FileJobStatus =
  | 'preparing'
  | 'pending'
  | 'running'
  | 'processing'
  | 'merging'
  | 'paused'
  | 'completed'
  | 'completed_with_warning'
  | 'failed'
  | 'cancelled';

export interface FileJobRuntimeHints {
  has_live_execution?: boolean | null;
  inflight_batches?: number | null;
  last_execution_fact_at?: string | null;
}

export interface FileJobStatusResponse {
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

export interface FileJobResultsOptions {
  valid?: boolean;
  invalid?: boolean;
  catchall?: boolean;
  role?: boolean;
  unknown?: boolean;
  disposable?: boolean;
  risky?: boolean;
}

export interface CreditsResponse {
  account_id: string;
  api_key_id: string;
  api_key_name: string;
  credits_balance: number;
  credits_consumed: number;
  credits_added: number;
  last_updated: string;
}

export type WebhookEvent = 'file.completed' | 'file.failed';

export interface WebhookConfig {
  url: string;
  events: WebhookEvent[];
}

export interface Webhook {
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

export interface WebhookPayload {
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

export interface WebhookDeliveryCheck {
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

export interface HealthCheckResponse {
  status: string;
  time: number;
}

export interface DomainSearchParams {
  domain: string;
  /** 1-200. Caps the bill: 5 credits per returned email. */
  maxEmails: number;
  includeRoleBased?: boolean;
  /** Crawl the sitemap up to this many pages instead of the default two passes. */
  maxPages?: number;
}

export interface DomainSearchCreated {
  search_id: string;
  status: string;
  domain: string;
  credits_reserved: number;
  status_url?: string;
}

export interface DomainSearchStatus {
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

export interface DomainSearchBatchOptions {
  /** 1-200 per domain (server default 200). */
  maxEmails?: number;
  includeRoleBased?: boolean;
  maxPages?: number;
  /** Which CSV column holds the domain, e.g. `{ domain: 'Company Website' }`. */
  columnMap?: Record<string, string> | string;
}

export interface DomainSearchBatchCreated {
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

export type DomainSearchBatchState =
  | 'queued'
  | 'running'
  | 'completed'
  | 'completed_with_warning'
  | 'failed'
  | 'cancelled';

export interface DomainSearchBatchStatus {
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

export interface DomainSearchBatchListOptions {
  limit?: number;
  status?: DomainSearchBatchState;
  cursor?: string;
}

export interface DomainSearchBatchPage {
  items: DomainSearchBatchStatus[];
  has_more: boolean;
  next_cursor?: string;
}

export interface ApiError {
  code: string;
  message: string;
  description?: string;
  details?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
}
