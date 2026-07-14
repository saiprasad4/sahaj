import type { SahajError } from '../errors';
import type { FiType } from '../fi-types';
import type { DepositAccount } from './deposit';

export type {
  AccountStatus,
  AccountType,
  DepositAccount,
  DepositHolder,
  DepositSummary,
  DepositTransaction,
  RawDepositFi,
  TransactionType,
} from './deposit';
export { parseDepositAccount } from './deposit';

/** Outcome for a single FIP in a data session. Lets `fetch` report partial data honestly. */
export interface FipResult {
  readonly fipId: string;
  readonly fipName: string;
  readonly status: 'DELIVERED' | 'FAILED';
  readonly fiTypes: FiType[];
  readonly error?: SahajError;
}

/**
 * The parsed result of one data session. v0.1 populates `deposits`; other FI-type
 * collections arrive as their parsers land, so this shape can grow without breaking.
 */
export interface FinancialData {
  readonly consentId: string;
  readonly sessionId: string;
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly deposits: DepositAccount[];
  readonly fips: FipResult[];
}

/** Sum of current balances across every delivered deposit account, in paise. */
export function totalDepositBalancePaise(data: FinancialData): number {
  return data.deposits.reduce(
    (runningTotal, account) => runningTotal + account.summary.currentBalancePaise,
    0,
  );
}
