export interface EmailVerifyConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

export interface VerifyOptions {
  checkSmtp?: boolean;
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
  mx_ip?: string;
  is_listed?: boolean;
  blacklists?: string[];
  checked?: boolean;
}

export interface VerifyResponse {
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

export interface BatchVerifyOptions {
  checkSmtp?: boolean;
}

export interface BatchVerifyResultItem {
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

export interface BatchVerifyResponse {
  results: BatchVerifyResultItem[];
  total_emails: number;
  valid_emails: number;
  invalid_emails: number;
  credits_used: number;
  process_time: number;
}

export interface FileUploadOptions {
  checkSmtp?: boolean;
  emailColumn?: string;
  preserveOriginal?: boolean;
}

export interface FileUploadResponse {
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

export interface FileJobStatusOptions {
  timeout?: number;
}

export interface FileJobStatusResponse {
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

export interface WebhookConfig {
  url: string;
  events: WebhookEvent[];
}

export type WebhookEvent = 'file.completed' | 'file.failed';

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  is_active: boolean;
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
    result_file_path: string;
    download_url: string;
  };
}

export interface HealthCheckResponse {
  status: string;
  time: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
}
