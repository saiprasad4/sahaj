import type { RawDepositFi } from '../models/deposit';
import { type Rng, createRng, hashSeed } from './rng';
import type { SandboxScenario } from './vua';

/**
 * Deterministic sandbox data. Given a VUA and a run seed, the same accounts and
 * transactions come out every time, so tests and demos are reproducible. Dates are
 * derived from a fixed epoch rather than the wall clock for the same reason.
 */

const SANDBOX_EPOCH_MILLIS = Date.UTC(2026, 5, 1, 9, 30, 0); // 2026-06-01T09:30:00Z
const ONE_DAY_MILLIS = 24 * 60 * 60 * 1000;

interface SandboxFip {
  readonly id: string;
  readonly name: string;
}

const FIPS: readonly SandboxFip[] = [
  { id: 'SBIN', name: 'State Bank of India' },
  { id: 'HDFC', name: 'HDFC Bank' },
];

const CREDIT_NARRATIONS = [
  'Salary credit',
  'UPI/refund',
  'NEFT inward',
  'Interest paid',
  'IMPS from savings',
];
const DEBIT_NARRATIONS = ['UPI/merchant', 'Card purchase', 'Rent payment', 'Electricity bill', 'SIP debit'];
const MODES = ['UPI', 'NEFT', 'IMPS', 'CARD', 'OTHERS'];

/** The result of preparing one FIP's data in the sandbox session. */
export interface FixtureFipData {
  readonly fipId: string;
  readonly fipName: string;
  readonly status: 'DELIVERED' | 'FAILED';
  readonly payload?: RawDepositFi;
}

function paiseToRupeeString(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const absolute = Math.abs(paise);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${sign}${whole}.${String(fraction).padStart(2, '0')}`;
}

function isoAt(dayOffset: number): string {
  return new Date(SANDBOX_EPOCH_MILLIS - dayOffset * ONE_DAY_MILLIS).toISOString();
}

function buildDepositPayload(fip: SandboxFip, rng: Rng): RawDepositFi {
  const transactionCount = rng.int(8, 14);
  let balancePaise = rng.int(50_000, 400_000) * 100; // opening balance, whole rupees in paise

  const transactions: RawDepositFi['Account']['Transactions']['Transaction'] = [];
  for (let index = transactionCount - 1; index >= 0; index--) {
    const isCredit = rng.next() > 0.45;
    const amountPaise = rng.int(200, 60_000) * 100;
    balancePaise += isCredit ? amountPaise : -amountPaise;
    transactions.push({
      txnId: `${fip.id}-TXN-${String(transactionCount - index).padStart(4, '0')}`,
      type: isCredit ? 'CREDIT' : 'DEBIT',
      amount: paiseToRupeeString(amountPaise),
      currentBalance: paiseToRupeeString(balancePaise),
      valueDate: isoAt(index).slice(0, 10),
      transactionTimestamp: isoAt(index),
      narration: rng.pick(isCredit ? CREDIT_NARRATIONS : DEBIT_NARRATIONS),
      mode: rng.pick(MODES),
      reference: `${fip.id}${rng.int(100000, 999999)}`,
    });
  }

  return {
    Account: {
      maskedAccNumber: `XXXXXX${rng.int(1000, 9999)}`,
      linkedAccRef: `${fip.id}-${rng.int(10000000, 99999999)}`,
      Profile: {
        Holders: {
          Holder: [
            {
              name: rng.pick(['Aarav Sharma', 'Diya Nair', 'Vivaan Rao', 'Ananya Iyer']),
              mobile: '9999999999',
              pan: 'ABCDE1234F',
            },
          ],
        },
      },
      Summary: {
        currentBalance: paiseToRupeeString(balancePaise),
        currency: 'INR',
        balanceDateTime: isoAt(0),
        type: rng.pick(['SAVINGS', 'CURRENT']),
        status: 'ACTIVE',
        branch: rng.pick(['Koramangala', 'Andheri East', 'Salt Lake', 'T Nagar']),
        ifscCode: `${fip.id}0001234`,
      },
      Transactions: { Transaction: transactions },
    },
  };
}

/**
 * Build the per-FIP deposit data for a scenario. Only `healthy` and `partial`
 * produce delivered data here. The earlier failure scenarios (reject, expire,
 * no_accounts, fip_down) are decided by the consent and session state machine
 * before fetch ever reaches fixtures.
 */
export function buildDepositFixtures(
  mobile: string,
  scenario: SandboxScenario,
  seed: number,
): FixtureFipData[] {
  const rng = createRng(hashSeed(`${mobile}:${seed}`));
  const [primaryFip, secondaryFip] = FIPS;
  if (!primaryFip || !secondaryFip) {
    throw new Error('sandbox FIP roster is misconfigured');
  }

  if (scenario === 'partial') {
    return [
      {
        fipId: primaryFip.id,
        fipName: primaryFip.name,
        status: 'DELIVERED',
        payload: buildDepositPayload(primaryFip, rng),
      },
      { fipId: secondaryFip.id, fipName: secondaryFip.name, status: 'FAILED' },
    ];
  }

  return FIPS.map((fip) => ({
    fipId: fip.id,
    fipName: fip.name,
    status: 'DELIVERED' as const,
    payload: buildDepositPayload(fip, rng),
  }));
}
