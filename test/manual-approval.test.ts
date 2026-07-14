import { describe, expect, it } from 'vitest';
import { AA } from '../src/index';

/**
 * With autoApprove off, the consent stays PENDING until the human step is driven
 * explicitly, the same shape as the real redirect-and-poll flow.
 */

function pendingClient() {
  return new AA({ mode: 'sandbox', sandbox: { autoApprove: false }, maxPollAttempts: 3 });
}

describe('manual sandbox approval', () => {
  it('leaves a freshly created consent pending', async () => {
    const aa = pendingClient();
    const consent = await aa.consents.create({
      mobile: '9999999999',
      fiTypes: ['DEPOSIT'],
      purpose: 'loan-underwriting',
      duration: 'P90D',
    });
    expect(consent.status).toBe('PENDING');
    expect(await aa.consents.status(consent.id)).toBe('PENDING');
  });

  it('fails a fetch that runs before approval', async () => {
    const aa = pendingClient();
    const consent = await aa.consents.create({
      mobile: '9999999999',
      fiTypes: ['DEPOSIT'],
      purpose: 'loan-underwriting',
      duration: 'P90D',
    });
    await expect(aa.data.fetch(consent.id)).rejects.toMatchObject({ code: 'CONSENT_NOT_ACTIVE' });
  });

  it('delivers data once the consent is approved', async () => {
    const aa = pendingClient();
    const consent = await aa.consents.create({
      mobile: '9999999999',
      fiTypes: ['DEPOSIT'],
      purpose: 'loan-underwriting',
      duration: 'P90D',
    });
    aa.sandbox.approve(consent.id);
    const data = await aa.data.fetch(consent.id);
    expect(data.deposits.length).toBeGreaterThan(0);
  });

  it('maps a manual rejection to CONSENT_REJECTED', async () => {
    const aa = pendingClient();
    const consent = await aa.consents.create({
      mobile: '9999999999',
      fiTypes: ['DEPOSIT'],
      purpose: 'loan-underwriting',
      duration: 'P90D',
    });
    aa.sandbox.reject(consent.id);
    await expect(aa.data.fetch(consent.id)).rejects.toMatchObject({ code: 'CONSENT_REJECTED' });
  });

  it('refuses sandbox controls in production', () => {
    const noop = {
      name: 'noop',
      createConsent: async () => ({
        id: 'x',
        status: 'ACTIVE' as const,
        redirectUrl: '',
        createdAt: '',
        expiresAt: '',
      }),
      getConsentStatus: async () => 'ACTIVE' as const,
      createSession: async () => ({ id: 's', status: 'COMPLETED' as const }),
      fetchData: async () => [],
    };
    const aa = new AA({ mode: 'production', adapter: noop });
    expect(() => aa.sandbox.approve('x')).toThrowError();
  });
});
