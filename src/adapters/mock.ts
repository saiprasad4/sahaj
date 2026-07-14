import { SahajError } from '../errors';
import { buildDepositFixtures } from '../sandbox/fixtures';
import { type SandboxScenario, resolveScenario } from '../sandbox/vua';
import type {
  AAAdapter,
  AdapterConsent,
  AdapterSession,
  ConsentRequest,
  ConsentStatus,
  FetchedFip,
  SandboxControls,
} from './adapter';

/**
 * The sandbox adapter. It runs the whole consent-to-data loop in memory with no
 * credentials and no network, driving each magic-VUA scenario through the same
 * state machine a real AA would. This is the wedge: the loop works in minutes,
 * offline, before anyone holds an FIU licence.
 */

export interface MockAdapterOptions {
  /** Approve (or reject/expire, per the VUA) as soon as the consent is created. Default true. */
  readonly autoApprove?: boolean;
  /** Seed for the deterministic fixtures. Default 1. */
  readonly seed?: number;
}

interface MockConsentState {
  readonly id: string;
  readonly mobile: string;
  readonly scenario: SandboxScenario;
  readonly fiTypes: ConsentRequest['fiTypes'];
  readonly createdAt: string;
  readonly expiresAt: string;
  status: ConsentStatus;
}

const SANDBOX_CLOCK_MILLIS = Date.UTC(2026, 5, 1, 9, 0, 0); // fixed sandbox "now" for reproducible timestamps

/** What a given scenario resolves to once the human step happens. */
function approvalOutcome(scenario: SandboxScenario): ConsentStatus {
  if (scenario === 'reject') {
    return 'REJECTED';
  }
  if (scenario === 'expire') {
    return 'EXPIRED';
  }
  return 'ACTIVE';
}

export class MockAdapter implements AAAdapter, SandboxControls {
  readonly name = 'sandbox';

  private readonly autoApprove: boolean;
  private readonly seed: number;
  private readonly consents = new Map<string, MockConsentState>();
  private readonly consentIdByIdempotencyKey = new Map<string, string>();
  private consentCounter = 0;

  constructor(options: MockAdapterOptions = {}) {
    this.autoApprove = options.autoApprove ?? true;
    this.seed = options.seed ?? 1;
  }

  async createConsent(request: ConsentRequest): Promise<AdapterConsent> {
    if (request.idempotencyKey) {
      const existingId = this.consentIdByIdempotencyKey.get(request.idempotencyKey);
      if (existingId) {
        return this.toAdapterConsent(this.requireConsent(existingId));
      }
    }

    const scenario = resolveScenario(request.mobile);
    const id = `csnt_sandbox_${++this.consentCounter}`;
    const state: MockConsentState = {
      id,
      mobile: request.mobile,
      scenario,
      fiTypes: request.fiTypes,
      createdAt: new Date(SANDBOX_CLOCK_MILLIS).toISOString(),
      expiresAt: new Date(SANDBOX_CLOCK_MILLIS + 15 * 60 * 1000).toISOString(),
      status: this.autoApprove ? approvalOutcome(scenario) : 'PENDING',
    };
    this.consents.set(id, state);
    if (request.idempotencyKey) {
      this.consentIdByIdempotencyKey.set(request.idempotencyKey, id);
    }
    return this.toAdapterConsent(state);
  }

  async getConsentStatus(consentId: string): Promise<ConsentStatus> {
    return this.requireConsent(consentId).status;
  }

  async createSession(consentId: string): Promise<AdapterSession> {
    const state = this.requireConsent(consentId);
    if (state.scenario === 'fip_down') {
      throw new SahajError('FIP_UNAVAILABLE', { fipId: 'SBIN' });
    }
    return { id: `sess_sandbox_${state.id}`, status: 'COMPLETED' };
  }

  async fetchData(consentId: string, _sessionId: string): Promise<FetchedFip[]> {
    const state = this.requireConsent(consentId);
    if (state.scenario === 'no_accounts') {
      throw new SahajError('NO_ACCOUNTS_FOUND');
    }
    return buildDepositFixtures(state.mobile, state.scenario, this.seed).map((fip) => ({
      fipId: fip.fipId,
      fipName: fip.fipName,
      status: fip.status,
      fiType: 'DEPOSIT' as const,
      payload: fip.payload,
    }));
  }

  approve(consentId: string): void {
    const state = this.requireConsent(consentId);
    state.status = approvalOutcome(state.scenario);
  }

  reject(consentId: string): void {
    this.requireConsent(consentId).status = 'REJECTED';
  }

  private requireConsent(consentId: string): MockConsentState {
    const state = this.consents.get(consentId);
    if (!state) {
      throw new SahajError('INVALID_INPUT', { field: 'consentId' });
    }
    return state;
  }

  private toAdapterConsent(state: MockConsentState): AdapterConsent {
    return {
      id: state.id,
      status: state.status,
      redirectUrl: `https://sandbox.sahaj.local/consents/${state.id}/approve`,
      createdAt: state.createdAt,
      expiresAt: state.expiresAt,
    };
  }
}
