import { describe, it, expect } from 'vitest';
import { classifyMetaError } from '../sendProviderResponse';

/**
 * Regression guard for the five-week silent outage.
 *
 * On 2026-08-12 the Instagram access token expired. sendProviderResponse logged the error
 * body and returned normally, so nothing marked the integration broken and the dashboard
 * kept showing a green "Connected" badge while every reply was dropped.
 *
 * The distinction that matters is permanent vs transient: a dead token needs a human to
 * re-issue it, while a rate limit or a 5xx fixes itself. Only the former may flag the
 * integration — otherwise a brief Meta outage would send people chasing a reconnect.
 */

/** Verbatim from the Vercel log that exposed the outage. */
const EXPIRED_TOKEN_BODY = JSON.stringify({
  error: {
    message: 'Error validating access token: Session has expired on Wednesday, 12-Aug-26 11:13:40 PDT. The current time is Friday, 18-Sep-26 22:49:16 PDT.',
    type: 'OAuthException',
    code: 190,
    error_subcode: 0,
    fbtrace_id: 'AnL2Jfw6xu1fAVYRwIwNMzz',
  },
});

describe('permanent failures — a human must re-issue the token', () => {
  it('the real expired-session payload is permanent', () => {
    const result = classifyMetaError(400, EXPIRED_TOKEN_BODY);
    expect(result.permanent).toBe(true);
    expect(result.error).toContain('190');
    expect(result.error).toContain('Session has expired');
  });

  const authCodes = [
    [190, 'access token expired or revoked'],
    [102, 'session key invalid'],
    [200, 'permission denied'],
    [10, 'app lacks permission'],
  ] as const;

  for (const [code, label] of authCodes) {
    it(`code ${code} (${label}) is permanent`, () => {
      const body = JSON.stringify({ error: { message: label, type: 'OAuthException', code } });
      expect(classifyMetaError(400, body).permanent).toBe(true);
    });
  }

  it('any OAuthException is permanent even with an unfamiliar code', () => {
    const body = JSON.stringify({ error: { message: 'weird auth failure', type: 'OAuthException', code: 4173 } });
    expect(classifyMetaError(400, body).permanent).toBe(true);
  });
});

describe('transient failures — never flag the integration', () => {
  it('a rate limit is transient', () => {
    const body = JSON.stringify({ error: { message: 'Application request limit reached', type: 'GraphMethodException', code: 4 } });
    expect(classifyMetaError(429, body).permanent).toBe(false);
  });

  it('a server error is transient', () => {
    expect(classifyMetaError(500, '{"error":{"message":"Internal error","type":"GraphMethodException","code":2}}').permanent).toBe(false);
  });

  it('a non-JSON body (proxy HTML, empty response) is transient, not a false reconnect alarm', () => {
    expect(classifyMetaError(502, '<html>Bad Gateway</html>').permanent).toBe(false);
    expect(classifyMetaError(500, '').permanent).toBe(false);
  });

  it('a malformed-request 400 with no auth error is transient', () => {
    const body = JSON.stringify({ error: { message: 'Invalid recipient', type: 'GraphMethodException', code: 100 } });
    expect(classifyMetaError(400, body).permanent).toBe(false);
  });
});

describe('the error message is preserved for whoever reconnects', () => {
  it('carries the provider wording, not a generic string', () => {
    expect(classifyMetaError(400, EXPIRED_TOKEN_BODY).error).toMatch(/OAuthException 190/);
  });

  it('a non-JSON body still yields something readable and bounded', () => {
    const result = classifyMetaError(502, 'x'.repeat(1000));
    expect(result.error).toContain('HTTP 502');
    expect(result.error.length).toBeLessThan(400);
  });
});
