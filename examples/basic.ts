/**
 * Basic Email Verification Examples
 *
 * This example demonstrates:
 * - Single email verification
 * - Batch verification (sync, max 50 emails)
 * - Getting credits
 * - Health check
 *
 * Run with: npx ts-node examples/basic.ts
 */

import {
  EmailVerify,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  InsufficientCreditsError,
  TimeoutError,
} from '../src/index.js';

// Initialize the client
const client = new EmailVerify({
  apiKey: process.env.EMAILVERIFY_API_KEY!,
  // Optional configuration:
  // baseUrl: 'https://api.emailverify.ai/v1',
  // retries: 3,
});

async function healthCheckExample() {
  console.log('=== Health Check ===\n');

  try {
    const health = await client.healthCheck();
    console.log('API Status:', health.status);
    console.log('Server Time:', health.time);
    console.log('\n');
  } catch (error) {
    console.error('Health check failed:', error);
  }
}

async function singleVerificationExample() {
  console.log('=== Single Email Verification ===\n');

  try {
    // Verify a single email with SMTP check enabled (default)
    const result = await client.verify('test@example.com', {
      checkSmtp: true,
    });

    console.log('Email:', result.email);
    console.log('Status:', result.status);
    console.log('Score:', result.score);
    console.log('Is Deliverable:', result.is_deliverable);
    console.log('Is Disposable:', result.is_disposable);
    console.log('Is Catchall:', result.is_catchall);
    console.log('Is Role:', result.is_role);
    console.log('Is Free:', result.is_free);
    console.log('Domain:', result.domain);
    console.log('MX Records:', result.mx_records?.join(', ') || 'N/A');
    console.log('SMTP Check Performed:', result.smtp_check);
    console.log('Reason:', result.reason || 'N/A');
    console.log('Suggestion:', result.suggestion || 'N/A');
    console.log('Response Time:', result.response_time, 'ms');
    console.log('Credits Used:', result.credits_used);

    if (result.domain_reputation) {
      console.log('Domain Reputation:');
      console.log('  - MX IP:', result.domain_reputation.mx_ip || 'N/A');
      console.log('  - Is Listed:', result.domain_reputation.is_listed);
      console.log('  - Blacklists:', result.domain_reputation.blacklists?.join(', ') || 'None');
    }

    console.log('\n');
  } catch (error) {
    handleError(error);
  }
}

async function batchVerificationExample() {
  console.log('=== Batch Email Verification ===\n');

  // Maximum 50 emails per batch request
  const emails = [
    'valid@example.com',
    'invalid@nonexistent-domain-xyz.com',
    'disposable@tempmail.com',
    'support@example.com', // role-based
    'user@gmail.com', // free provider
  ];

  try {
    const result = await client.verifyBatch(emails, {
      checkSmtp: true,
    });

    console.log('Total Emails:', result.total_emails);
    console.log('Valid Emails:', result.valid_emails);
    console.log('Invalid Emails:', result.invalid_emails);
    console.log('Credits Used:', result.credits_used);
    console.log('Process Time:', result.process_time, 'ms');
    console.log('\nResults:');

    for (const item of result.results) {
      console.log(`  - ${item.email}: ${item.status} (score: ${item.score}, deliverable: ${item.is_deliverable})`);
    }

    console.log('\n');
  } catch (error) {
    handleError(error);
  }
}

async function getCreditsExample() {
  console.log('=== Credits Information ===\n');

  try {
    const credits = await client.getCredits();

    console.log('Account ID:', credits.account_id);
    console.log('API Key ID:', credits.api_key_id);
    console.log('API Key Name:', credits.api_key_name);
    console.log('Credits Balance:', credits.credits_balance);
    console.log('Credits Consumed:', credits.credits_consumed);
    console.log('Credits Added:', credits.credits_added);
    console.log('Last Updated:', credits.last_updated);
    console.log('\n');
  } catch (error) {
    handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed: Invalid or missing API key');
  } else if (error instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof ValidationError) {
    console.error(`Validation error: ${error.message}`);
    if (error.details) {
      console.error(`Details: ${error.details}`);
    }
  } else if (error instanceof InsufficientCreditsError) {
    console.error('Insufficient credits. Please top up your account.');
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out. Please try again.');
  } else {
    console.error('Unexpected error:', error);
  }
  console.log('\n');
}

// Main execution
async function main() {
  console.log('EmailVerify Node.js SDK - Basic Examples\n');
  console.log('========================================\n');

  // Check API key
  if (!process.env.EMAILVERIFY_API_KEY) {
    console.error('Error: EMAILVERIFY_API_KEY environment variable is not set');
    console.error('Please set it with: export EMAILVERIFY_API_KEY=your_api_key');
    process.exit(1);
  }

  // Run examples
  await healthCheckExample();
  await getCreditsExample();
  await singleVerificationExample();
  await batchVerificationExample();

  console.log('========================================');
  console.log('Examples completed!');
}

main().catch(console.error);
