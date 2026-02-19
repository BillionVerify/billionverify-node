/**
 * File Upload Examples
 *
 * This example demonstrates:
 * - File upload for async verification
 * - Getting job status with long-polling
 * - Downloading results with filters
 * - Waiting for job completion
 *
 * Run with: npx ts-node examples/file-upload.ts
 */

import { createReadStream, createWriteStream, writeFileSync } from 'fs';
import { Readable } from 'stream';
import {
  BillionVerify,
  AuthenticationError,
  ValidationError,
  InsufficientCreditsError,
  NotFoundError,
  TimeoutError,
} from '../src/index.js';
import type { FileJobStatusResponse } from '../src/index.js';

// Initialize the client
const client = new BillionVerify({
  apiKey: process.env.BILLIONVERIFY_API_KEY!,
});

async function uploadFileExample() {
  console.log('=== File Upload Example ===\n');

  // Create a sample CSV file for demonstration
  const sampleCsvContent = `email,name,company
john@example.com,John Doe,Acme Inc
jane@example.org,Jane Smith,Tech Corp
invalid@nonexistent-domain-xyz.com,Invalid User,None
support@example.com,Support Team,Example Co
test@tempmail.com,Temp User,Disposable Inc`;

  const sampleFilePath = '/tmp/sample-emails.csv';
  writeFileSync(sampleFilePath, sampleCsvContent);
  console.log('Created sample CSV file at:', sampleFilePath);
  console.log('Content:');
  console.log(sampleCsvContent);
  console.log('\n');

  try {
    // Method 1: Upload using a ReadStream
    console.log('Uploading file...');
    const upload = await client.uploadFile(
      createReadStream(sampleFilePath),
      'sample-emails.csv',
      {
        checkSmtp: true,           // Perform SMTP verification
        emailColumn: 'email',      // Column containing email addresses
        preserveOriginal: true,    // Keep original columns in results
      }
    );

    console.log('Upload successful!');
    console.log('Task ID:', upload.task_id);
    console.log('Status:', upload.status);
    console.log('Message:', upload.message);
    console.log('File Name:', upload.file_name);
    console.log('File Size:', upload.file_size, 'bytes');
    console.log('Estimated Count:', upload.estimated_count);
    console.log('Unique Emails:', upload.unique_emails);
    console.log('Total Rows:', upload.total_rows);
    console.log('Email Column:', upload.email_column);
    console.log('Status URL:', upload.status_url);
    console.log('Created At:', upload.created_at);
    console.log('\n');

    return upload.task_id;
  } catch (error) {
    handleError(error);
    return null;
  }
}

async function uploadBufferExample() {
  console.log('=== Upload from Buffer Example ===\n');

  // Create a Buffer with CSV content
  const csvContent = `email
user1@example.com
user2@example.org`;

  const buffer = Buffer.from(csvContent, 'utf-8');

  try {
    const upload = await client.uploadFile(
      buffer,
      'buffer-emails.csv',
      {
        checkSmtp: true,
      }
    );

    console.log('Upload from buffer successful!');
    console.log('Task ID:', upload.task_id);
    console.log('\n');

    return upload.task_id;
  } catch (error) {
    handleError(error);
    return null;
  }
}

async function getJobStatusExample(taskId: string) {
  console.log('=== Get Job Status Example ===\n');

  try {
    // Simple status check (returns immediately)
    console.log('Checking status (immediate)...');
    const status = await client.getFileJobStatus(taskId);
    printJobStatus(status);

    // Long-polling status check (waits up to 30 seconds for status change)
    console.log('Checking status with long-polling (30s timeout)...');
    const statusWithPolling = await client.getFileJobStatus(taskId, {
      timeout: 30, // Wait up to 30 seconds for status change (0-300)
    });
    printJobStatus(statusWithPolling);

    return statusWithPolling;
  } catch (error) {
    handleError(error);
    return null;
  }
}

function printJobStatus(status: FileJobStatusResponse) {
  console.log('Job ID:', status.job_id);
  console.log('Status:', status.status);
  console.log('File Name:', status.file_name);
  console.log('Total Emails:', status.total_emails);
  console.log('Processed Emails:', status.processed_emails);
  console.log('Progress:', status.progress_percent + '%');
  console.log('Valid Emails:', status.valid_emails);
  console.log('Invalid Emails:', status.invalid_emails);
  console.log('Unknown Emails:', status.unknown_emails);
  console.log('Role Emails:', status.role_emails);
  console.log('Catchall Emails:', status.catchall_emails);
  console.log('Disposable Emails:', status.disposable_emails);
  console.log('Credits Used:', status.credits_used);

  if (status.process_time_seconds) {
    console.log('Process Time:', status.process_time_seconds, 'seconds');
  }
  if (status.download_url) {
    console.log('Download URL:', status.download_url);
  }
  if (status.error_message) {
    console.log('Error Message:', status.error_message);
  }

  console.log('Created At:', status.created_at);
  if (status.completed_at) {
    console.log('Completed At:', status.completed_at);
  }
  console.log('\n');
}

async function waitForCompletionExample(taskId: string) {
  console.log('=== Wait for Job Completion Example ===\n');

  try {
    console.log('Waiting for job to complete...');
    console.log('(Polling every 5 seconds, max wait 10 minutes)\n');

    const completed = await client.waitForFileJobCompletion(
      taskId,
      5000,    // Poll interval: 5 seconds
      600000   // Max wait: 10 minutes
    );

    console.log('Job completed!');
    printJobStatus(completed);

    return completed;
  } catch (error) {
    handleError(error);
    return null;
  }
}

async function downloadResultsExample(taskId: string) {
  console.log('=== Download Results Example ===\n');

  try {
    // Download all results
    console.log('Downloading all results...');
    const allResponse = await client.getFileJobResults(taskId);
    const allResults = await allResponse.text();
    console.log('All Results:');
    console.log(allResults);
    console.log('\n');

    // Download only valid emails
    console.log('Downloading only valid emails...');
    const validResponse = await client.getFileJobResults(taskId, {
      valid: true,
    });
    const validResults = await validResponse.text();
    console.log('Valid Results:');
    console.log(validResults);
    console.log('\n');

    // Download invalid and risky emails
    console.log('Downloading invalid and risky emails...');
    const invalidRiskyResponse = await client.getFileJobResults(taskId, {
      invalid: true,
      risky: true,
    });
    const invalidRiskyResults = await invalidRiskyResponse.text();
    console.log('Invalid/Risky Results:');
    console.log(invalidRiskyResults);
    console.log('\n');

    // Download with multiple filters
    console.log('Downloading with multiple filters...');
    const filteredResponse = await client.getFileJobResults(taskId, {
      valid: true,
      catchall: true,
      role: true,
      unknown: true,
      // Excluded: invalid, disposable, risky
    });
    const filteredResults = await filteredResponse.text();
    console.log('Filtered Results (valid, catchall, role, unknown):');
    console.log(filteredResults);
    console.log('\n');
  } catch (error) {
    handleError(error);
  }
}

async function streamResultsToFileExample(taskId: string) {
  console.log('=== Stream Results to File Example ===\n');

  try {
    const outputPath = '/tmp/verification-results.csv';
    console.log('Streaming results to:', outputPath);

    const response = await client.getFileJobResults(taskId, {
      valid: true,
      invalid: true,
      catchall: true,
      role: true,
      unknown: true,
      disposable: true,
      risky: true,
    });

    // Stream the response body to a file
    if (response.body) {
      const fileStream = createWriteStream(outputPath);
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fileStream.write(Buffer.from(value));
      }

      fileStream.end();
      console.log('Results saved to:', outputPath);
    } else {
      console.log('No response body to stream');
    }
    console.log('\n');
  } catch (error) {
    handleError(error);
  }
}

function handleError(error: unknown) {
  if (error instanceof AuthenticationError) {
    console.error('Authentication failed: Invalid or missing API key');
  } else if (error instanceof ValidationError) {
    console.error(`Validation error: ${error.message}`);
    if (error.details) {
      console.error(`Details: ${error.details}`);
    }
  } else if (error instanceof InsufficientCreditsError) {
    console.error('Insufficient credits. Please top up your account.');
  } else if (error instanceof NotFoundError) {
    console.error('Job not found. The job ID may be invalid or expired.');
  } else if (error instanceof TimeoutError) {
    console.error('Request or job timed out.');
  } else {
    console.error('Unexpected error:', error);
  }
  console.log('\n');
}

// Main execution
async function main() {
  console.log('BillionVerify Node.js SDK - File Upload Examples\n');
  console.log('=================================================\n');

  // Check API key
  if (!process.env.BILLIONVERIFY_API_KEY) {
    console.error('Error: BILLIONVERIFY_API_KEY environment variable is not set');
    console.error('Please set it with: export BILLIONVERIFY_API_KEY=your_api_key');
    process.exit(1);
  }

  // Upload a file
  const taskId = await uploadFileExample();
  if (!taskId) {
    console.error('Failed to upload file. Exiting.');
    process.exit(1);
  }

  // Check job status
  await getJobStatusExample(taskId);

  // Wait for completion
  const completed = await waitForCompletionExample(taskId);
  if (!completed || completed.status !== 'completed') {
    console.error('Job did not complete successfully. Exiting.');
    process.exit(1);
  }

  // Download results
  await downloadResultsExample(taskId);

  // Stream results to file
  await streamResultsToFileExample(taskId);

  console.log('=================================================');
  console.log('File upload examples completed!');
}

main().catch(console.error);
