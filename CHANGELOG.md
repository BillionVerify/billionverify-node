# Changelog

## 1.1.0

- Requests authenticate with the `BV-API-KEY` header (was `EV-API-KEY`).
- New operations: `checkDisposable`, `checkDisposableViaQuery`, `resumeJob`, `createDomainSearch`, `getDomainSearch`, `waitForDomainSearch`, `createDomainSearchBatch`, `listDomainSearchBatches`, `getDomainSearchBatch`, `downloadDomainSearchBatchResults`.
- `verify` and `verifyBatch` take `forceRefresh` and `includeDomainReputation`. `checkSmtp` is no longer sent unless you set it, so the server default applies.
- File job status follows the current API: `task_id`, `progress`, `deliverability_buckets`, `runtime_hints` and the rest; all ten statuses are typed. The old `job_id` and `progress_percent` stay in the type, deprecated, because the server never sends them.
- `waitForFileJobCompletion` returns on `completed`, `completed_with_warning`, `failed`, `cancelled` and `paused` (it used to wait until timeout on the last three).
- `verifyWebhookDelivery` verifies the `X-Webhook-Signature` the way the server signs it (`HMAC-SHA256` over `timestamp.body`) and rejects old deliveries (300 seconds). `verifyWebhookSignature` (body only) is deprecated.
- `getFileJobResults` follows the redirect to the storage host itself and no longer sends the API key there.
- Batch results are typed with optional fields and carry `deliverability_buckets`, `retryable_emails`, `deferred_emails` and `retry_after_seconds`.
- `baseUrl` works with or without a trailing `/v1`.
- Error messages never include request URLs.
