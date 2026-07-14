import { describe, expect, it } from 'vitest';
import { AA, isSahajError } from '../src/index';

function sandbox() {
  return new AA({ mode: 'sandbox' });
}

const validInput = {
  mobile: '9999999999',
  fiTypes: ['DEPOSIT'] as const,
  purpose: 'loan-underwriting',
  duration: 'P90D',
};

describe('consent input validation', () => {
  it('rejects a malformed mobile number', async () => {
    await expect(
      sandbox().consents.create({ ...validInput, fiTypes: ['DEPOSIT'], mobile: '12345' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', field: 'mobile' });
  });

  it('rejects an empty fiTypes list', async () => {
    await expect(sandbox().consents.create({ ...validInput, fiTypes: [] })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      field: 'fiTypes',
    });
  });

  it('rejects an unknown FI type', async () => {
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: exercising a bad runtime value on purpose
      sandbox().consents.create({ ...validInput, fiTypes: ['NOT_A_TYPE' as any] }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', field: 'fiTypes' });
  });

  it('rejects a blank purpose', async () => {
    await expect(
      sandbox().consents.create({ ...validInput, fiTypes: ['DEPOSIT'], purpose: '  ' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', field: 'purpose' });
  });

  it('rejects a non ISO-8601 duration', async () => {
    await expect(
      sandbox().consents.create({ ...validInput, fiTypes: ['DEPOSIT'], duration: '90 days' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', field: 'duration' });
  });

  it('accepts a valid ISO-8601 period', async () => {
    const consent = await sandbox().consents.create({ ...validInput, fiTypes: ['DEPOSIT'], duration: 'P1Y' });
    expect(consent.id).toBeTruthy();
  });
});

describe('production mode', () => {
  it('refuses to start without an adapter in v0.1', () => {
    try {
      new AA({ mode: 'production' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isSahajError(error)).toBe(true);
      if (isSahajError(error)) {
        expect(error.code).toBe('PRODUCTION_NOT_CONFIGURED');
      }
    }
  });
});
