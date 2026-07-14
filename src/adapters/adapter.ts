import type { FiType } from '../fi-types';
import type { RawDepositFi } from '../models/deposit';

/**
 * The AA-agnostic seam. Every provider (the sandbox mock today, Setu and Finvu
 * later) implements this one interface, so the same application code runs across
 * aggregators. Keeping it small is the whole "agnostic" bet.
 */

export type ConsentStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'REVOKED' | 'PAUSED';

export interface ConsentRequest {
  readonly mobile: string;
  readonly fiTypes: FiType[];
  readonly purpose: string;
  /** ISO-8601 period the consent stays valid for, e.g. "P90D". */
  readonly duration: string;
  /** Optional idempotency key so a retried create returns the same consent. */
  readonly idempotencyKey?: string;
}

export interface AdapterConsent {
  readonly id: string;
  readonly status: ConsentStatus;
  readonly redirectUrl: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface AdapterSession {
  readonly id: string;
  readonly status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

/** One FIP's contribution to a data session, already decrypted into a ReBIT-shaped payload. */
export interface FetchedFip {
  readonly fipId: string;
  readonly fipName: string;
  readonly status: 'DELIVERED' | 'FAILED';
  readonly fiType: FiType;
  readonly payload?: RawDepositFi;
}

export interface AAAdapter {
  readonly name: string;
  createConsent(request: ConsentRequest): Promise<AdapterConsent>;
  getConsentStatus(consentId: string): Promise<ConsentStatus>;
  createSession(consentId: string): Promise<AdapterSession>;
  fetchData(consentId: string, sessionId: string): Promise<FetchedFip[]>;
}

/** Adapters that let you drive the human approval step, only meaningful in sandbox. */
export interface SandboxControls {
  approve(consentId: string): void;
  reject(consentId: string): void;
}

export function supportsSandboxControls(adapter: AAAdapter): adapter is AAAdapter & SandboxControls {
  const candidate = adapter as Partial<SandboxControls>;
  return typeof candidate.approve === 'function' && typeof candidate.reject === 'function';
}
