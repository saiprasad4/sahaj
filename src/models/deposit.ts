import { SahajError } from '../errors';
import { rupeesToPaise } from '../money';

/**
 * Typed DEPOSIT model, parsed from the ReBIT deposit FI schema.
 *
 * The raw payload uses decimal rupee strings, mixed enum casing and nested
 * capitalised objects. We normalise all of that into a flat, typed shape with
 * integer-paise money, and keep the original under `.raw` as an escape hatch.
 */

export type AccountType = 'SAVINGS' | 'CURRENT' | 'DEFAULT' | 'NRE' | 'NRO';
export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'CLOSED';
export type TransactionType = 'CREDIT' | 'DEBIT';

export interface DepositTransaction {
  readonly txnId: string;
  readonly type: TransactionType;
  readonly amountPaise: number;
  readonly balanceAfterPaise: number;
  readonly valueDate: string;
  readonly transactionTimestamp: string;
  readonly narration: string;
  readonly mode?: string;
  readonly reference?: string;
}

export interface DepositSummary {
  readonly currentBalancePaise: number;
  readonly currency: string;
  readonly balanceDateTime: string;
  readonly type: AccountType;
  readonly status: AccountStatus;
  readonly branch?: string;
  readonly ifsc?: string;
}

export interface DepositHolder {
  readonly name: string;
  readonly mobile?: string;
  readonly pan?: string;
  readonly dob?: string;
}

export interface DepositAccount {
  readonly fiType: 'DEPOSIT';
  readonly fipId: string;
  readonly fipName: string;
  readonly maskedAccountNumber: string;
  readonly linkReferenceNumber: string;
  readonly holders: DepositHolder[];
  readonly summary: DepositSummary;
  readonly transactions: DepositTransaction[];
  readonly raw: unknown;
}

/** The ReBIT-shaped deposit payload, as it arrives once decrypted. */
export interface RawDepositFi {
  Account: {
    maskedAccNumber: string;
    linkedAccRef: string;
    Profile: {
      Holders: {
        Holder: Array<{ name: string; mobile?: string; pan?: string; dob?: string }>;
      };
    };
    Summary: {
      currentBalance: string;
      currency: string;
      balanceDateTime: string;
      type: string;
      status: string;
      branch?: string;
      ifscCode?: string;
    };
    Transactions: {
      Transaction: Array<{
        txnId: string;
        type: string;
        amount: string;
        currentBalance: string;
        valueDate: string;
        transactionTimestamp: string;
        narration: string;
        mode?: string;
        reference?: string;
      }>;
    };
  };
}

function normalizeAccountType(value: string): AccountType {
  const upper = value.toUpperCase();
  if (
    upper === 'SAVINGS' ||
    upper === 'CURRENT' ||
    upper === 'DEFAULT' ||
    upper === 'NRE' ||
    upper === 'NRO'
  ) {
    return upper;
  }
  return 'DEFAULT';
}

function normalizeAccountStatus(value: string): AccountStatus {
  const upper = value.toUpperCase();
  return upper === 'INACTIVE' || upper === 'CLOSED' ? upper : 'ACTIVE';
}

function normalizeTransactionType(value: string): TransactionType {
  return value.toUpperCase() === 'DEBIT' ? 'DEBIT' : 'CREDIT';
}

export function parseDepositAccount(payload: RawDepositFi, fipId: string, fipName: string): DepositAccount {
  const account = payload?.Account;
  if (!account?.Summary || !account.Transactions?.Transaction) {
    throw new SahajError('SCHEMA_PARSE_FAILED', { fipId, field: 'Account' });
  }

  const summary: DepositSummary = {
    currentBalancePaise: rupeesToPaise(account.Summary.currentBalance),
    currency: account.Summary.currency,
    balanceDateTime: account.Summary.balanceDateTime,
    type: normalizeAccountType(account.Summary.type),
    status: normalizeAccountStatus(account.Summary.status),
    branch: account.Summary.branch,
    ifsc: account.Summary.ifscCode,
  };

  const transactions: DepositTransaction[] = account.Transactions.Transaction.map((txn) => ({
    txnId: txn.txnId,
    type: normalizeTransactionType(txn.type),
    amountPaise: rupeesToPaise(txn.amount),
    balanceAfterPaise: rupeesToPaise(txn.currentBalance),
    valueDate: txn.valueDate,
    transactionTimestamp: txn.transactionTimestamp,
    narration: txn.narration,
    mode: txn.mode,
    reference: txn.reference,
  }));

  const holders: DepositHolder[] = account.Profile.Holders.Holder.map((holder) => ({
    name: holder.name,
    mobile: holder.mobile,
    pan: holder.pan,
    dob: holder.dob,
  }));

  return {
    fiType: 'DEPOSIT',
    fipId,
    fipName,
    maskedAccountNumber: account.maskedAccNumber,
    linkReferenceNumber: account.linkedAccRef,
    holders,
    summary,
    transactions,
    raw: payload,
  };
}
