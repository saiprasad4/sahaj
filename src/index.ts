/**
 * sahaj... an AA-agnostic SDK for India's Account Aggregator ecosystem.
 *
 * Run the full consent-to-data loop in a zero-registration sandbox and get back
 * typed, parsed ReBIT financial data from one `await`. The redirect, polling,
 * data session, decryption and schema parsing stay behind the interface.
 *
 * Independent open-source library. Not affiliated with or endorsed by NPCI, RBI,
 * SEBI, IRDAI, PFRDA, Sahamati, ReBIT, or any Account Aggregator, FIP, FIU or TSP.
 * Installing it grants no AA network access. It is not legal or compliance advice.
 *
 * @packageDocumentation
 */

// ── Client ───────────────────────────────────────────────────────────────────
export { AA } from './client';
export type { AAOptions, Consent, CreateConsentInput, Mode } from './client';

// ── Errors ───────────────────────────────────────────────────────────────────
export { SahajError, isSahajError, describeError, allErrorCodes, ERROR_DOC_BASE } from './errors';
export type { SahajErrorType, SahajErrorCode, SahajErrorDetails } from './errors';

// ── FI types ─────────────────────────────────────────────────────────────────
export { FI_TYPES, SUPPORTED_FI_TYPES, isFiType } from './fi-types';
export type { FiType } from './fi-types';

// ── Money ────────────────────────────────────────────────────────────────────
export { rupeesToPaise, formatPaise } from './money';

// ── Parsed models ────────────────────────────────────────────────────────────
export { parseDepositAccount, totalDepositBalancePaise } from './models';
export type {
  AccountStatus,
  AccountType,
  DepositAccount,
  DepositHolder,
  DepositSummary,
  DepositTransaction,
  FinancialData,
  FipResult,
  RawDepositFi,
  TransactionType,
} from './models';

// ── Adapter seam ─────────────────────────────────────────────────────────────
export { supportsSandboxControls } from './adapters/adapter';
export type {
  AAAdapter,
  AdapterConsent,
  AdapterSession,
  ConsentRequest,
  ConsentStatus,
  FetchedFip,
  SandboxControls,
} from './adapters/adapter';

// ── Sandbox ──────────────────────────────────────────────────────────────────
export { MockAdapter } from './adapters/mock';
export type { MockAdapterOptions } from './adapters/mock';
export { resolveScenario, MAGIC_VUAS } from './sandbox/vua';
export type { SandboxScenario } from './sandbox/vua';
