import { describe, expect, it } from 'vitest';
import { AA, totalDepositBalancePaise } from '../src/index';

describe('the one-await quickstart', () => {
  it('runs consent to typed data with no credentials', async () => {
    const aa = new AA({ mode: 'sandbox' });

    const consent = await aa.consents.create({
      mobile: '9999999999',
      fiTypes: ['DEPOSIT'],
      purpose: 'loan-underwriting',
      duration: 'P90D',
    });

    expect(consent.id).toMatch(/^csnt_sandbox_/);
    expect(consent.redirectUrl).toContain('/approve');

    const data = await aa.data.fetch(consent.id);

    expect(data.deposits.length).toBeGreaterThan(0);
    expect(data.consentId).toBe(consent.id);
    expect(data.schemaVersion).toBe('1.1.2');
  });

  it('returns a fully typed, money-safe deposit balance', async () => {
    const aa = new AA({ mode: 'sandbox' });
    const consent = await aa.consents.create({
      mobile: '9999999999',
      fiTypes: ['DEPOSIT'],
      purpose: 'loan-underwriting',
      duration: 'P90D',
    });

    const data = await aa.data.fetch(consent.id);
    const account = data.deposits[0];

    expect(account).toBeDefined();
    expect(account?.summary.currency).toBe('INR');
    expect(Number.isInteger(account?.summary.currentBalancePaise)).toBe(true);
    expect(account?.transactions.length).toBeGreaterThan(0);
    for (const txn of account?.transactions ?? []) {
      expect(Number.isInteger(txn.amountPaise)).toBe(true);
      expect(['CREDIT', 'DEBIT']).toContain(txn.type);
    }
  });

  it('totals balances across every delivered account', async () => {
    const aa = new AA({ mode: 'sandbox' });
    const consent = await aa.consents.create({
      mobile: '9999999999',
      fiTypes: ['DEPOSIT'],
      purpose: 'loan-underwriting',
      duration: 'P90D',
    });
    const data = await aa.data.fetch(consent.id);

    const expected = data.deposits.reduce((sum, account) => sum + account.summary.currentBalancePaise, 0);
    expect(totalDepositBalancePaise(data)).toBe(expected);
  });
});
