# @billionverify/node

Official BillionVerify Node.js SDK for email verification.

**Documentation:** https://billionverify.com/docs

## Installation

```bash
npm install @billionverify/node
```

## Quick Start

```typescript
import { BillionVerify } from '@billionverify/node';

const client = new BillionVerify({
  apiKey: process.env.BILLIONVERIFY_API_KEY!,
});

// Verify a single email
const result = await client.verify('user@example.com');
console.log(result.status); // 'valid', 'invalid', 'unknown', 'risky', 'disposable', 'catchall', or 'role'
console.log(result.is_deliverable); // true or false
```

## Configuration

```typescript
const client = new BillionVerify({
  apiKey: 'your-api-key',    // Required
  baseUrl: 'https://api.billionverify.com/v1', // Optional
  retries: 3,                // Optional: Number of retries (default: 3)
});
```

## Single Email Verification

```typescript
const result = await client.verify('user@example.com', {
  checkSmtp: true,  // Optional: Perform SMTP verification (default: true)
});

console.log(result);
// {
//   email: 'user@example.com',
//   status: 'valid',
//   score: 0.95,
//   is_deliverable: true,
//   is_disposable: false,
//   is_catchall: false,
//   is_role: false,
//   is_free: false,
//   domain: 'example.com',
//   domain_age: 9500,
//   mx_records: ['mx1.example.com', 'mx2.example.com'],
//   domain_reputation: {
//     mx_ip: '93.184.216.34',
//     is_listed: false,
//     blacklists: [],
//     checked: true
//   },
//   smtp_check: true,
//   reason: null,
//   suggestion: null,
//   response_time: 1234,
//   credits_used: 1
// }
```

### Verification Status Values

- `valid` - Email address is valid and deliverable
- `invalid` - Email address is invalid or does not exist
- `unknown` - Verification result is uncertain
- `risky` - Email address may be risky to send to
- `disposable` - Email address is from a disposable email service
- `catchall` - Domain accepts all emails (catch-all)
- `role` - Email address is a role-based address (e.g., info@, support@)

## Batch Email Verification

For synchronous verification of up to 50 emails:

```typescript
const result = await client.verifyBatch(
  ['user1@example.com', 'user2@example.com', 'user3@example.com'],
  {
    checkSmtp: true,  // Optional
  }
);

console.log(result);
// {
//   results: [
//     { email: 'user1@example.com', status: 'valid', score: 0.95, is_deliverable: true, ... },
//     { email: 'user2@example.com', status: 'invalid', score: 0.1, is_deliverable: false, ... },
//     ...
//   ],
//   total_emails: 3,
//   valid_emails: 2,
//   invalid_emails: 1,
//   credits_used: 3,
//   process_time: 2500
// }
```

**Note:** Maximum 50 emails per batch request. For larger lists, use `uploadFile()` for asynchronous processing.

## File Upload (Async Verification)

For large email lists, upload a CSV file for asynchronous processing:

```typescript
import { createReadStream } from 'fs';

// Upload a file
const upload = await client.uploadFile(
  createReadStream('/path/to/emails.csv'),
  'emails.csv',
  {
    checkSmtp: true,           // Optional
    emailColumn: 'email',      // Optional: Column name containing emails
    preserveOriginal: true,    // Optional: Keep original columns in results
  }
);

console.log(upload.task_id); // 'task_abc123xyz'

// Check job status (with optional long-polling)
const status = await client.getFileJobStatus(upload.task_id, {
  timeout: 30,  // Optional: Long-poll for up to 30 seconds (0-300)
});
console.log(status.progress_percent); // 45
console.log(status.status); // 'pending', 'processing', 'completed', or 'failed'

// Wait for completion (polling)
const completed = await client.waitForFileJobCompletion(
  upload.task_id,
  5000,    // Poll interval in ms
  600000   // Max wait time in ms
);

// Download results with optional filters
const response = await client.getFileJobResults(upload.task_id, {
  valid: true,       // Include valid emails
  invalid: true,     // Include invalid emails
  catchall: true,    // Include catch-all emails
  role: true,        // Include role-based emails
  unknown: true,     // Include unknown emails
  disposable: true,  // Include disposable emails
  risky: true,       // Include risky emails
});

// Stream results to file
const fileStream = createWriteStream('/path/to/results.csv');
const reader = response.body?.getReader();
// ... handle streaming
```

## Credits

```typescript
const credits = await client.getCredits();
console.log(credits);
// {
//   account_id: 'acc_123',
//   api_key_id: 'key_456',
//   api_key_name: 'Production Key',
//   credits_balance: 9500,
//   credits_consumed: 500,
//   credits_added: 10000,
//   last_updated: '2025-01-15T10:30:00Z'
// }
```

## Health Check

```typescript
const health = await client.healthCheck();
console.log(health);
// {
//   status: 'OK',
//   time: 1705312200000
// }
```

## Webhooks

```typescript
// Create a webhook
const webhook = await client.createWebhook({
  url: 'https://your-app.com/webhooks/billionverify',
  events: ['file.completed', 'file.failed'],
});
console.log(webhook.id);     // 'wh_abc123'
console.log(webhook.secret); // 'whsec_xyz789' (only returned on creation)

// List webhooks
const { webhooks, total } = await client.listWebhooks();

// Delete a webhook
await client.deleteWebhook(webhook.id);

// Verify webhook signature
const isValid = client.verifyWebhookSignature(
  rawBody,              // Raw request body as string
  signature,            // Value of 'X-EV-Signature' header
  webhook.secret        // Webhook secret from creation
);
```

### Webhook Events

- `file.completed` - Fired when a file verification job completes successfully
- `file.failed` - Fired when a file verification job fails

### Webhook Payload Example

```json
{
  "event": "file.completed",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "job_id": "task_abc123",
    "file_name": "emails.csv",
    "total_emails": 1000,
    "valid_emails": 850,
    "invalid_emails": 100,
    "role_emails": 20,
    "catchall_emails": 15,
    "unknown_emails": 10,
    "disposable_emails": 5,
    "credits_used": 1000,
    "process_time_seconds": 120,
    "result_file_path": "/results/task_abc123.csv",
    "download_url": "https://api.billionverify.com/v1/verify/file/task_abc123/results"
  }
}
```

## Error Handling

```typescript
import {
  BillionVerify,
  BillionVerifyError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  InsufficientCreditsError,
  NotFoundError,
  TimeoutError,
} from '@billionverify/node';

try {
  const result = await client.verify('user@example.com');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof ValidationError) {
    console.error(`Invalid input: ${error.message}`);
  } else if (error instanceof InsufficientCreditsError) {
    console.error('Not enough credits');
  } else if (error instanceof NotFoundError) {
    console.error('Resource not found');
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out');
  }
}
```

## TypeScript Support

This SDK is written in TypeScript and includes full type definitions.

```typescript
import type {
  BillionVerifyConfig,
  VerifyResponse,
  VerificationStatus,
  BatchVerifyResponse,
  FileUploadResponse,
  FileJobStatusResponse,
  CreditsResponse,
  Webhook,
  WebhookEvent,
  WebhookPayload,
  HealthCheckResponse,
} from '@billionverify/node';
```

## License

MIT
