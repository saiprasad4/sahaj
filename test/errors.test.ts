import { describe, expect, it } from 'vitest';
import { ERROR_DOC_BASE, SahajError, allErrorCodes, describeError, isSahajError } from '../src/index';

describe('the error catalog', () => {
  it('describes every code with a message, action and doc link', () => {
    for (const code of allErrorCodes()) {
      const described = describeError(code);
      expect(described.message.length).toBeGreaterThan(0);
      expect(described.displayMessage.length).toBeGreaterThan(0);
      expect(described.suggestedAction.length).toBeGreaterThan(0);
      expect(described.docUrl).toBe(`${ERROR_DOC_BASE}/${code}.md`);
    }
  });

  it('builds a SahajError carrying its catalog metadata', () => {
    const error = new SahajError('CONSENT_REJECTED', { fipId: 'SBIN' });
    expect(error).toBeInstanceOf(Error);
    expect(isSahajError(error)).toBe(true);
    expect(error.type).toBe('CONSENT_ERROR');
    expect(error.fipId).toBe('SBIN');
    expect(error.sandboxVua).toBe('9999999001');
  });

  it('preserves an underlying cause', () => {
    const root = new Error('boom');
    const error = new SahajError('DECRYPTION_FAILED', { cause: root });
    expect(error.cause).toBe(root);
  });

  it('guards non-errors', () => {
    expect(isSahajError(new Error('plain'))).toBe(false);
    expect(isSahajError('CONSENT_REJECTED')).toBe(false);
    expect(isSahajError(null)).toBe(false);
  });
});
