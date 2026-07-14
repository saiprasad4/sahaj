import { describe, expect, it } from 'vitest';
import { AA, isSahajError } from '../src/index';

/**
 * Every magic VUA drives a distinct, reproducible outcome. These are the failure
 * modes a developer would otherwise only hit in production, replayable offline.
 */

async function fetchWith(mobile: string) {
  const aa = new AA({ mode: 'sandbox' });
  const consent = await aa.consents.create({
    mobile,
    fiTypes: ['DEPOSIT'],
    purpose: 'loan-underwriting',
    duration: 'P90D',
  });
  return aa.data.fetch(consent.id);
}

describe('magic VUA scenarios', () => {
  it('9999999999 delivers a healthy multi-account user', async () => {
    const data = await fetchWith('9999999999');
    expect(data.deposits.length).toBe(2);
    expect(data.fips.every((fip) => fip.status === 'DELIVERED')).toBe(true);
  });

  it('9999999001 rejects the consent', async () => {
    await expect(fetchWith('9999999001')).rejects.toMatchObject({
      code: 'CONSENT_REJECTED',
      type: 'CONSENT_ERROR',
    });
  });

  it('9999999002 finds no accounts', async () => {
    await expect(fetchWith('9999999002')).rejects.toMatchObject({
      code: 'NO_ACCOUNTS_FOUND',
      type: 'DISCOVERY_ERROR',
    });
  });

  it('9999999003 expires the consent', async () => {
    await expect(fetchWith('9999999003')).rejects.toMatchObject({ code: 'CONSENT_EXPIRED' });
  });

  it('9999999004 reports the FIP as unavailable', async () => {
    await expect(fetchWith('9999999004')).rejects.toMatchObject({
      code: 'FIP_UNAVAILABLE',
      fipId: 'SBIN',
    });
  });

  it('9999999005 returns partial data, one FIP down without throwing', async () => {
    const data = await fetchWith('9999999005');
    expect(data.deposits.length).toBe(1);
    const delivered = data.fips.filter((fip) => fip.status === 'DELIVERED');
    const failed = data.fips.filter((fip) => fip.status === 'FAILED');
    expect(delivered.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(isSahajError(failed[0]?.error)).toBe(true);
  });

  it('carries the reproducing VUA on the thrown error', async () => {
    try {
      await fetchWith('9999999001');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isSahajError(error)).toBe(true);
      if (isSahajError(error)) {
        expect(error.sandboxVua).toBe('9999999001');
        expect(error.docUrl).toContain('CONSENT_REJECTED');
      }
    }
  });
});
