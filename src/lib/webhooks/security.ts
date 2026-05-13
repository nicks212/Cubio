import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies the X-Hub-Signature-256 header sent by Meta platforms
 * (Facebook Messenger, Instagram, WhatsApp Business API).
 *
 * Meta signs the raw request body with HMAC-SHA256 using the app secret.
 * Uses timing-safe comparison to prevent timing-based side-channel attacks.
 *
 * @param rawBody - The raw (unparsed) request body string
 * @param signatureHeader - Value of the X-Hub-Signature-256 header (e.g. "sha256=abc123...")
 * @param appSecret - The Meta App Secret (META_APP_SECRET env var)
 * @returns true if the signature is valid, false otherwise
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const receivedHex = signatureHeader.slice(7); // strip "sha256=" prefix
  const expectedHex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');

  // Both buffers must be the same length for timingSafeEqual
  if (receivedHex.length !== expectedHex.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(receivedHex, 'hex'),
      Buffer.from(expectedHex, 'hex'),
    );
  } catch {
    return false;
  }
}
