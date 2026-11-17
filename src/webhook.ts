import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookDeliveryCheck } from './types.js';

const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Verifies a webhook delivery: `X-Webhook-Signature` is `sha256=<hex>`, an HMAC-SHA256 keyed
 * with the webhook secret over `"<X-Webhook-Timestamp>.<raw body>"`. Deliveries older (or
 * newer) than the tolerance are rejected.
 */
export function verifyWebhookDelivery(check: WebhookDeliveryCheck): boolean {
  const { payload, signature, secret } = check;
  if (
    typeof payload !== 'string' ||
    typeof signature !== 'string' ||
    typeof secret !== 'string' ||
    secret.trim() === '' ||
    check.timestamp === undefined ||
    check.timestamp === null
  ) {
    return false;
  }
  const timestamp = String(check.timestamp).trim();
  if (!/^\d{1,15}$/.test(timestamp)) {
    return false;
  }
  const tolerance = check.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (tolerance > 0) {
    const nowSeconds = Math.floor((check.now ?? Date.now()) / 1000);
    if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) {
      return false;
    }
  }
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
  let given = signature.trim();
  if (!given.startsWith('sha256=')) {
    given = `sha256=${given}`;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
