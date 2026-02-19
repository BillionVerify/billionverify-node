/**
 * Webhook Examples
 *
 * This example demonstrates:
 * - Creating webhooks (events: file.completed, file.failed)
 * - Listing webhooks
 * - Deleting webhooks
 * - Verifying webhook signatures
 *
 * Run with: npx ts-node examples/webhooks.ts
 */

import {
  BillionVerify,
  AuthenticationError,
  ValidationError,
  NotFoundError,
} from '../src/index.js';
import type { Webhook, WebhookPayload, WebhookEvent } from '../src/index.js';

// Initialize the client
const client = new BillionVerify({
  apiKey: process.env.BILLIONVERIFY_API_KEY!,
});

async function createWebhookExample() {
  console.log('=== Create Webhook Example ===\n');

  try {
    // Create a webhook for file verification events
    const webhook = await client.createWebhook({
      url: 'https://your-app.com/webhooks/billionverify',
      events: ['file.completed', 'file.failed'],
    });

    console.log('Webhook created successfully!');
    console.log('ID:', webhook.id);
    console.log('URL:', webhook.url);
    console.log('Events:', webhook.events.join(', '));
    console.log('Secret:', webhook.secret || '(not returned)');
    console.log('Is Active:', webhook.is_active);
    console.log('Created At:', webhook.created_at);
    console.log('Updated At:', webhook.updated_at);
    console.log('\n');

    // IMPORTANT: Store the webhook secret securely!
    // It's only returned during webhook creation.
    if (webhook.secret) {
      console.log('*** IMPORTANT: Save this webhook secret securely! ***');
      console.log('*** It will not be shown again after creation. ***');
      console.log('\n');
    }

    return webhook;
  } catch (error) {
    handleError(error);
    return null;
  }
}

async function createWebhookWithSpecificEventsExample() {
  console.log('=== Create Webhook with Specific Events ===\n');

  try {
    // Create a webhook only for completed events
    const completedWebhook = await client.createWebhook({
      url: 'https://your-app.com/webhooks/completed',
      events: ['file.completed'],
    });

    console.log('Completed-only webhook created:');
    console.log('ID:', completedWebhook.id);
    console.log('Events:', completedWebhook.events.join(', '));
    console.log('\n');

    // Create a webhook only for failed events
    const failedWebhook = await client.createWebhook({
      url: 'https://your-app.com/webhooks/failed',
      events: ['file.failed'],
    });

    console.log('Failed-only webhook created:');
    console.log('ID:', failedWebhook.id);
    console.log('Events:', failedWebhook.events.join(', '));
    console.log('\n');

    return [completedWebhook, failedWebhook];
  } catch (error) {
    handleError(error);
    return null;
  }
}

async function listWebhooksExample() {
  console.log('=== List Webhooks Example ===\n');

  try {
    const { webhooks, total } = await client.listWebhooks();

    console.log('Total webhooks:', total);
    console.log('\n');

    if (webhooks.length === 0) {
      console.log('No webhooks configured.');
    } else {
      console.log('Webhooks:');
      for (const webhook of webhooks) {
        console.log(`  - ID: ${webhook.id}`);
        console.log(`    URL: ${webhook.url}`);
        console.log(`    Events: ${webhook.events.join(', ')}`);
        console.log(`    Active: ${webhook.is_active}`);
        console.log(`    Created: ${webhook.created_at}`);
        console.log('');
      }
    }
    console.log('\n');

    return webhooks;
  } catch (error) {
    handleError(error);
    return [];
  }
}

async function deleteWebhookExample(webhookId: string) {
  console.log('=== Delete Webhook Example ===\n');

  try {
    await client.deleteWebhook(webhookId);
    console.log('Webhook deleted successfully!');
    console.log('Deleted webhook ID:', webhookId);
    console.log('\n');
    return true;
  } catch (error) {
    handleError(error);
    return false;
  }
}

function verifyWebhookSignatureExample() {
  console.log('=== Verify Webhook Signature Example ===\n');

  // Example webhook payload (as received in your webhook endpoint)
  const webhookPayload: WebhookPayload = {
    event: 'file.completed',
    timestamp: '2025-01-15T10:30:00Z',
    data: {
      job_id: 'task_abc123',
      file_name: 'emails.csv',
      total_emails: 1000,
      valid_emails: 850,
      invalid_emails: 100,
      role_emails: 20,
      catchall_emails: 15,
      unknown_emails: 10,
      disposable_emails: 5,
      credits_used: 1000,
      process_time_seconds: 120,
      result_file_path: '/results/task_abc123.csv',
      download_url: 'https://api.billionverify.com/v1/verify/file/task_abc123/results',
    },
  };

  // Raw body string (exactly as received)
  const rawBody = JSON.stringify(webhookPayload);

  // Webhook secret (stored from webhook creation)
  const webhookSecret = 'whsec_example_secret_12345';

  // Signature from the X-EV-Signature header
  // In production, this would come from the incoming request headers
  const crypto = require('crypto');
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')}`;

  console.log('Raw Body:', rawBody.substring(0, 100) + '...');
  console.log('Webhook Secret:', webhookSecret);
  console.log('Expected Signature:', expectedSignature);
  console.log('\n');

  // Verify the signature
  const isValid = client.verifyWebhookSignature(
    rawBody,
    expectedSignature,
    webhookSecret
  );

  console.log('Signature Valid:', isValid);

  // Test with invalid signature
  const isInvalid = client.verifyWebhookSignature(
    rawBody,
    'sha256=invalid_signature',
    webhookSecret
  );

  console.log('Invalid Signature Test:', !isInvalid ? 'Correctly rejected' : 'Error: should have been rejected');
  console.log('\n');

  return isValid;
}

function webhookHandlerExample() {
  console.log('=== Webhook Handler Example (Express.js) ===\n');

  const exampleCode = `
// Example Express.js webhook handler

import express from 'express';
import { BillionVerify } from '@billionverify/node';
import type { WebhookPayload } from '@billionverify/node';

const app = express();

// IMPORTANT: Use raw body parser for webhook verification
app.use('/webhooks/billionverify', express.raw({ type: 'application/json' }));

const client = new BillionVerify({
  apiKey: process.env.BILLIONVERIFY_API_KEY!,
});

// Store your webhook secret securely (e.g., environment variable)
const WEBHOOK_SECRET = process.env.BILLIONVERIFY_WEBHOOK_SECRET!;

app.post('/webhooks/billionverify', (req, res) => {
  // Get the raw body as string
  const rawBody = req.body.toString();

  // Get the signature from headers
  const signature = req.headers['x-ev-signature'] as string;

  if (!signature) {
    console.error('Missing X-EV-Signature header');
    return res.status(401).json({ error: 'Missing signature' });
  }

  // Verify the signature
  const isValid = client.verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET);

  if (!isValid) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Parse the payload
  const payload: WebhookPayload = JSON.parse(rawBody);

  // Handle the event
  switch (payload.event) {
    case 'file.completed':
      console.log('File verification completed!');
      console.log('Job ID:', payload.data.job_id);
      console.log('Total emails:', payload.data.total_emails);
      console.log('Valid emails:', payload.data.valid_emails);
      console.log('Download URL:', payload.data.download_url);

      // Download results, update database, notify users, etc.
      // await processCompletedJob(payload.data);
      break;

    case 'file.failed':
      console.error('File verification failed!');
      console.error('Job ID:', payload.data.job_id);

      // Handle failure, notify users, retry, etc.
      // await handleFailedJob(payload.data);
      break;

    default:
      console.log('Unknown event:', payload.event);
  }

  // Return 200 OK to acknowledge receipt
  res.status(200).json({ received: true });
});

app.listen(3000, () => {
  console.log('Webhook server listening on port 3000');
});
`;

  console.log('Example Express.js webhook handler:');
  console.log(exampleCode);
  console.log('\n');
}

function handleError(error: unknown) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed: Invalid or missing API key');
  } else if (error instanceof ValidationError) {
    console.error(`Validation error: ${error.message}`);
    if (error.details) {
      console.error(`Details: ${error.details}`);
    }
  } else if (error instanceof NotFoundError) {
    console.error('Webhook not found. The webhook ID may be invalid.');
  } else {
    console.error('Unexpected error:', error);
  }
  console.log('\n');
}

// Main execution
async function main() {
  console.log('BillionVerify Node.js SDK - Webhook Examples\n');
  console.log('=============================================\n');

  // Check API key
  if (!process.env.BILLIONVERIFY_API_KEY) {
    console.error('Error: BILLIONVERIFY_API_KEY environment variable is not set');
    console.error('Please set it with: export BILLIONVERIFY_API_KEY=your_api_key');
    process.exit(1);
  }

  // List existing webhooks
  console.log('--- Current Webhooks ---\n');
  await listWebhooksExample();

  // Create a new webhook
  console.log('--- Creating New Webhook ---\n');
  const webhook = await createWebhookExample();

  if (webhook) {
    // List webhooks again to see the new one
    console.log('--- Updated Webhook List ---\n');
    await listWebhooksExample();

    // Delete the webhook we just created
    console.log('--- Deleting Test Webhook ---\n');
    await deleteWebhookExample(webhook.id);

    // Verify it was deleted
    console.log('--- Final Webhook List ---\n');
    await listWebhooksExample();
  }

  // Demonstrate signature verification
  console.log('--- Webhook Signature Verification ---\n');
  verifyWebhookSignatureExample();

  // Show webhook handler example
  console.log('--- Webhook Handler Code Example ---\n');
  webhookHandlerExample();

  console.log('=============================================');
  console.log('Webhook examples completed!');
}

main().catch(console.error);
