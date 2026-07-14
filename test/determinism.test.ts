import { describe, expect, it } from 'vitest';
import { AA } from '../src/index';

async function fetchOnce(seed: number) {
  const aa = new AA({ mode: 'sandbox', sandbox: { seed } });
  const consent = await aa.consents.create({
    mobile: '9999999999',
    fiTypes: ['DEPOSIT'],
    purpose: 'loan-underwriting',
    duration: 'P90D',
  });
  return aa.data.fetch(consent.id);
}

describe('sandbox determinism', () => {
  it('produces identical data for the same seed', async () => {
    const first = await fetchOnce(42);
    const second = await fetchOnce(42);
    expect(first.deposits).toEqual(second.deposits);
  });

  it('produces different data for a different seed', async () => {
    const withSeedOne = await fetchOnce(1);
    const withSeedTwo = await fetchOnce(2);
    expect(withSeedOne.deposits[0]?.summary.currentBalancePaise).not.toBe(
      withSeedTwo.deposits[0]?.summary.currentBalancePaise,
    );
  });

  it('uses no wall-clock timestamps, so generatedAt is stable', async () => {
    const first = await fetchOnce(7);
    const second = await fetchOnce(7);
    expect(first.generatedAt).toBe(second.generatedAt);
  });

  it('returns the same consent for a repeated idempotency key', async () => {
    const aa = new AA({ mode: 'sandbox' });
    const input = {
      mobile: '9999999999',
      fiTypes: ['DEPOSIT'] as const,
      purpose: 'loan-underwriting',
      duration: 'P90D',
      idempotencyKey: 'key-abc',
    };
    const first = await aa.consents.create({ ...input, fiTypes: [...input.fiTypes] });
    const second = await aa.consents.create({ ...input, fiTypes: [...input.fiTypes] });
    expect(second.id).toBe(first.id);
  });
});
