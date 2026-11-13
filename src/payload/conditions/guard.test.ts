import { describe, expect, it } from 'vitest';
import {
  clientAddress,
  hashReporter,
  HONEYPOT_FIELD,
  isCrossSiteRequest,
  isHoneypotTripped,
  isJsonContentType,
  parseIdentifier,
  reporterSalt,
} from './guard';

/** A fixed "now" so the date-window tests don't drift with the clock. */
describe('isHoneypotTripped', () => {
  it('is not tripped by an absent or empty field', () => {
    expect(isHoneypotTripped({})).toBe(false);
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: '' })).toBe(false);
    // Whitespace only is still a human who tabbed through it somehow.
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: '   ' })).toBe(false);
  });

  it('is tripped by anything typed into it', () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: 'http://spam.example' })).toBe(
      true,
    );
  });

  it('ignores non-string values rather than throwing', () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: 42 })).toBe(false);
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: null })).toBe(false);
  });
});

describe('clientAddress', () => {
  it('takes the first entry of x-forwarded-for', () => {
    const headers = new Headers({
      'x-forwarded-for': '203.0.113.5, 70.41.3.18, 150.172.238.178',
    });
    expect(clientAddress(headers)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip, then to a constant', () => {
    expect(clientAddress(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe(
      '203.0.113.9',
    );
    expect(clientAddress(new Headers())).toBe('unknown');
  });

  it('does not return an empty string from a malformed header', () => {
    expect(clientAddress(new Headers({ 'x-forwarded-for': ' , ' }))).toBe(
      'unknown',
    );
  });
});

describe('isCrossSiteRequest', () => {
  const URL_HERE = 'https://bikechatt.com/api/map/conditions?city=chattanooga';

  it('allows same-origin and user-initiated requests', () => {
    expect(
      isCrossSiteRequest(
        new Headers({ 'sec-fetch-site': 'same-origin' }),
        URL_HERE,
      ),
    ).toBe(false);
    expect(
      isCrossSiteRequest(new Headers({ 'sec-fetch-site': 'none' }), URL_HERE),
    ).toBe(false);
  });

  it('allows a request with neither header, which no browser makes', () => {
    expect(isCrossSiteRequest(new Headers(), URL_HERE)).toBe(false);
  });

  it('rejects any other Sec-Fetch-Site', () => {
    for (const site of ['cross-site', 'same-site']) {
      expect(
        isCrossSiteRequest(new Headers({ 'sec-fetch-site': site }), URL_HERE),
      ).toBe(true);
    }
  });

  it('compares Origin with the host the proxy forwarded', () => {
    const fromSite = new Headers({
      'x-forwarded-host': 'bikechatt.com',
      host: 'internal:3000',
      origin: 'https://bikechatt.com',
    });
    expect(isCrossSiteRequest(fromSite, 'http://internal:3000/api')).toBe(
      false,
    );
    expect(
      isCrossSiteRequest(
        new Headers({ host: 'bikechatt.com', origin: 'https://evil.example' }),
        URL_HERE,
      ),
    ).toBe(true);
  });

  it('falls back to the request URL and rejects an opaque origin', () => {
    expect(
      isCrossSiteRequest(
        new Headers({ origin: 'https://bikechatt.com' }),
        URL_HERE,
      ),
    ).toBe(false);
    expect(isCrossSiteRequest(new Headers({ origin: 'null' }), URL_HERE)).toBe(
      true,
    );
  });
});

describe('isJsonContentType', () => {
  it('accepts JSON with or without parameters', () => {
    expect(
      isJsonContentType(new Headers({ 'content-type': 'application/json' })),
    ).toBe(true);
    expect(
      isJsonContentType(
        new Headers({ 'content-type': 'Application/JSON; charset=utf-8' }),
      ),
    ).toBe(true);
  });

  it('rejects the types a form or no-cors fetch can send without a preflight', () => {
    for (const type of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
    ]) {
      expect(isJsonContentType(new Headers({ 'content-type': type }))).toBe(
        false,
      );
    }
    expect(isJsonContentType(new Headers())).toBe(false);
  });
});

describe('hashReporter', () => {
  it('is stable for the same address and salt', () => {
    expect(hashReporter('203.0.113.5', 'pepper')).toBe(
      hashReporter('203.0.113.5', 'pepper'),
    );
  });

  it('separates different addresses, and different salts', () => {
    expect(hashReporter('203.0.113.5', 'pepper')).not.toBe(
      hashReporter('203.0.113.6', 'pepper'),
    );
    // Rotating the salt must invalidate the old buckets, or rotation is a no-op.
    expect(hashReporter('203.0.113.5', 'pepper')).not.toBe(
      hashReporter('203.0.113.5', 'salt'),
    );
  });

  it('does not contain the address it was made from', () => {
    const hash = hashReporter('203.0.113.5', 'pepper');
    expect(hash).not.toContain('203.0.113.5');
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('reporterSalt', () => {
  it('prefers its own variable, falls back to the Payload secret', () => {
    expect(
      reporterSalt({
        CONDITION_REPORT_SALT: 'own',
        PAYLOAD_SECRET: 'payload',
      }),
    ).toBe('own');
    expect(reporterSalt({ PAYLOAD_SECRET: 'payload' })).toBe('payload');
  });

  it('still returns something when neither is set', () => {
    // A weak salt is bad; an empty one that makes every hash identical, and so
    // rate-limits the whole internet as one person, is worse.
    expect(reporterSalt({})).toBeTruthy();
  });
});

describe('parseIdentifier', () => {
  it('trims and returns a plausible slug', () => {
    expect(parseIdentifier('  pointe-break ')).toBe('pointe-break');
  });

  it('rejects blanks, non-strings and anything oversized', () => {
    expect(parseIdentifier('')).toBeNull();
    expect(parseIdentifier('   ')).toBeNull();
    expect(parseIdentifier(null)).toBeNull();
    expect(parseIdentifier(['pointe-break'])).toBeNull();
    expect(parseIdentifier('x'.repeat(201))).toBeNull();
  });
});
