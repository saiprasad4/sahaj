/**
 * The sahaj error taxonomy.
 *
 * One typed error shape for the whole consent-to-data loop, modelled on Plaid and
 * Twilio: a stable machine-readable `code`, a developer `message`, a user-safe
 * `displayMessage`, the concrete `suggestedAction`, and a deep link to the docs.
 * Every code is reproducible in sandbox via a magic VUA, so a failure a developer
 * hits in production can be replayed offline.
 */

export type SahajErrorType =
  | 'AUTH_ERROR'
  | 'CONSENT_ERROR'
  | 'DISCOVERY_ERROR'
  | 'FIP_ERROR'
  | 'SESSION_ERROR'
  | 'DATA_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'AA_ERROR'
  | 'VALIDATION_ERROR';

export type SahajErrorCode =
  | 'MISSING_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'CONSENT_REJECTED'
  | 'CONSENT_EXPIRED'
  | 'CONSENT_REVOKED'
  | 'CONSENT_PAUSED'
  | 'CONSENT_NOT_ACTIVE'
  | 'NO_ACCOUNTS_FOUND'
  | 'IDENTIFIER_MISMATCH'
  | 'FIP_UNAVAILABLE'
  | 'FIP_DENIED'
  | 'ACCOUNT_LINKING_FAILED'
  | 'SESSION_EXPIRED'
  | 'DATA_NOT_READY'
  | 'DECRYPTION_FAILED'
  | 'SCHEMA_PARSE_FAILED'
  | 'KEY_MATERIAL_INVALID'
  | 'RATE_LIMITED'
  | 'AA_UPSTREAM_ERROR'
  | 'INVALID_INPUT'
  | 'PRODUCTION_NOT_CONFIGURED';

interface CatalogEntry {
  readonly type: SahajErrorType;
  readonly message: string;
  readonly displayMessage: string;
  readonly suggestedAction: string;
  readonly sandboxVua?: string;
}

/** Base URL for the per-code error pages. Kept as a constant so it can be retargeted. */
export const ERROR_DOC_BASE = 'https://github.com/saiprasad4/sahaj/blob/main/docs/errors';

const CATALOG: Record<SahajErrorCode, CatalogEntry> = {
  MISSING_CREDENTIALS: {
    type: 'AUTH_ERROR',
    message: 'No FIU credentials were configured for production mode.',
    displayMessage: 'We could not connect to your bank right now.',
    suggestedAction: 'Configure an adapter with your FIU credentials, or use mode: "sandbox".',
  },
  TOKEN_EXPIRED: {
    type: 'AUTH_ERROR',
    message: 'The FIU access token has expired.',
    displayMessage: 'We could not connect to your bank right now.',
    suggestedAction: 'Refresh the FIU token and retry.',
  },
  CONSENT_REJECTED: {
    type: 'CONSENT_ERROR',
    message: 'The user rejected the consent request in the AA app.',
    displayMessage: 'You declined the data-sharing request.',
    suggestedAction: 'Recreate the consent and prompt the user to approve it.',
    sandboxVua: '9999999001',
  },
  CONSENT_EXPIRED: {
    type: 'CONSENT_ERROR',
    message: 'The consent request expired before the user acted on it.',
    displayMessage: 'The data-sharing request timed out.',
    suggestedAction: 'Recreate the consent and ask the user to approve it promptly.',
    sandboxVua: '9999999003',
  },
  CONSENT_REVOKED: {
    type: 'CONSENT_ERROR',
    message: 'The consent was revoked and can no longer be used.',
    displayMessage: 'Data sharing was turned off.',
    suggestedAction: 'Recreate the consent if you still need the data.',
  },
  CONSENT_PAUSED: {
    type: 'CONSENT_ERROR',
    message: 'The consent is paused and cannot be used until resumed.',
    displayMessage: 'Data sharing is paused.',
    suggestedAction: 'Ask the user to resume the consent, or recreate it.',
  },
  CONSENT_NOT_ACTIVE: {
    type: 'CONSENT_ERROR',
    message: 'The consent is still pending and did not reach ACTIVE within the wait window.',
    displayMessage: 'We are still waiting for your approval.',
    suggestedAction: 'Wait for the approval webhook, or increase the fetch wait window.',
  },
  NO_ACCOUNTS_FOUND: {
    type: 'DISCOVERY_ERROR',
    message: 'No accounts were discovered at the FIP for this identifier.',
    displayMessage: 'We could not find any accounts to share.',
    suggestedAction: 'Confirm the mobile number is registered with the bank, then retry.',
    sandboxVua: '9999999002',
  },
  IDENTIFIER_MISMATCH: {
    type: 'DISCOVERY_ERROR',
    message: 'The identifier did not match any account at the FIP.',
    displayMessage: 'These details did not match any account.',
    suggestedAction: 'Verify the identifier passed to consent creation.',
  },
  FIP_UNAVAILABLE: {
    type: 'FIP_ERROR',
    message: 'The FIP was unreachable during the data session.',
    displayMessage: 'Your bank is temporarily unavailable.',
    suggestedAction: 'Retry the fetch after a short delay with backoff.',
    sandboxVua: '9999999004',
  },
  FIP_DENIED: {
    type: 'FIP_ERROR',
    message: 'The FIP denied the data request.',
    displayMessage: 'Your bank declined the request.',
    suggestedAction: 'Check that the consent scope is supported by the FIP.',
  },
  ACCOUNT_LINKING_FAILED: {
    type: 'FIP_ERROR',
    message: 'Linking the discovered account failed.',
    displayMessage: 'We could not link your account.',
    suggestedAction: 'Ask the user to retry the linking step in the AA app.',
  },
  SESSION_EXPIRED: {
    type: 'SESSION_ERROR',
    message: 'The data session expired before the data was fetched.',
    displayMessage: 'The data request timed out.',
    suggestedAction: 'Create a fresh data session against the active consent.',
  },
  DATA_NOT_READY: {
    type: 'SESSION_ERROR',
    message: 'The FIP has not finished preparing the data yet.',
    displayMessage: 'Your data is still being prepared.',
    suggestedAction: 'Poll the session status with backoff until it completes.',
  },
  DECRYPTION_FAILED: {
    type: 'DATA_ERROR',
    message: 'The FI payload could not be decrypted with the derived session key.',
    displayMessage: 'We could not read the shared data.',
    suggestedAction: 'Check the curve variant and key material match the counterparty.',
  },
  SCHEMA_PARSE_FAILED: {
    type: 'DATA_ERROR',
    message: 'The decrypted FI payload did not match the expected ReBIT schema.',
    displayMessage: 'We could not read the shared data.',
    suggestedAction: 'Inspect the raw payload via the .raw escape hatch and report the schema version.',
  },
  KEY_MATERIAL_INVALID: {
    type: 'DATA_ERROR',
    message: 'The KeyMaterial returned by the FIP was malformed or used an unexpected curve.',
    displayMessage: 'We could not read the shared data.',
    suggestedAction: 'Validate the curve and key length before deriving the session key.',
  },
  RATE_LIMITED: {
    type: 'RATE_LIMIT_ERROR',
    message: 'The upstream AA or router rate-limited the request.',
    displayMessage: 'Too many requests, please try again shortly.',
    suggestedAction: 'Back off and retry with jitter.',
  },
  AA_UPSTREAM_ERROR: {
    type: 'AA_ERROR',
    message: 'The AA or router returned an unexpected upstream error.',
    displayMessage: 'The data provider had a problem.',
    suggestedAction: 'Retry once, then surface the requestId when reporting the issue.',
  },
  INVALID_INPUT: {
    type: 'VALIDATION_ERROR',
    message: 'The input to the SDK was invalid.',
    displayMessage: 'Something was not quite right with the request.',
    suggestedAction: 'Fix the flagged field and retry.',
  },
  PRODUCTION_NOT_CONFIGURED: {
    type: 'VALIDATION_ERROR',
    message: 'Production mode needs a configured AA adapter, which is not shipped in v0.1.',
    displayMessage: 'This feature is not available yet.',
    suggestedAction: 'Use mode: "sandbox" for now. Production adapters arrive in a later milestone.',
  },
};

export interface SahajErrorDetails {
  readonly fipId?: string;
  readonly field?: string;
  readonly requestId?: string;
  readonly causes?: SahajError[];
  readonly cause?: unknown;
}

/**
 * The single error type every sahaj call throws. Carries the machine-readable
 * code plus everything a developer needs to fix it or show the user.
 */
export class SahajError extends Error {
  readonly type: SahajErrorType;
  readonly code: SahajErrorCode;
  readonly displayMessage: string;
  readonly suggestedAction: string;
  readonly docUrl: string;
  readonly sandboxVua?: string;
  readonly fipId?: string;
  readonly field?: string;
  readonly requestId?: string;
  readonly causes?: SahajError[];

  constructor(code: SahajErrorCode, details: SahajErrorDetails = {}) {
    const entry = CATALOG[code];
    super(entry.message, details.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = 'SahajError';
    this.type = entry.type;
    this.code = code;
    this.displayMessage = entry.displayMessage;
    this.suggestedAction = entry.suggestedAction;
    this.docUrl = `${ERROR_DOC_BASE}/${code}.md`;
    this.sandboxVua = entry.sandboxVua;
    this.fipId = details.fipId;
    this.field = details.field;
    this.requestId = details.requestId;
    this.causes = details.causes;
  }
}

export function isSahajError(value: unknown): value is SahajError {
  return value instanceof SahajError;
}

/** Read-only view of a code's catalog entry, for docs generation and the describe tools. */
export function describeError(code: SahajErrorCode): CatalogEntry & { code: SahajErrorCode; docUrl: string } {
  return { code, docUrl: `${ERROR_DOC_BASE}/${code}.md`, ...CATALOG[code] };
}

export function allErrorCodes(): SahajErrorCode[] {
  return Object.keys(CATALOG) as SahajErrorCode[];
}
