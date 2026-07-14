import {
  type AAAdapter,
  type ConsentRequest,
  type ConsentStatus,
  supportsSandboxControls,
} from './adapters/adapter';
import { MockAdapter } from './adapters/mock';
import { SetuAdapter, type SetuAdapterOptions } from './adapters/setu';
import { SahajError } from './errors';
import { isFiType } from './fi-types';
import { type DepositAccount, type FinancialData, type FipResult, parseDepositAccount } from './models';

/**
 * The developer-facing client. In sandbox it needs no keys and no FIU licence:
 * `consents.create` then `data.fetch` runs the whole loop and hands back typed,
 * parsed financial data. The poll, session, decrypt and parse steps stay hidden.
 */

export type Mode = 'sandbox' | 'production' | 'setu-sandbox';

export interface AAOptions {
  readonly mode: Mode;
  /**
   * Provide your own AA adapter. `sandbox` defaults to the in-memory mock;
   * `production` and `setu-sandbox` need a real adapter (or, for `setu-sandbox`,
   * the `setu` config below).
   */
  readonly adapter?: AAAdapter;
  readonly sandbox?: { autoApprove?: boolean; seed?: number };
  /** Config for the built-in Setu adapter when `mode: 'setu-sandbox'` and no adapter is given. */
  readonly setu?: SetuAdapterOptions;
  /** How many times `data.fetch` polls consent status before giving up. Default 20. */
  readonly maxPollAttempts?: number;
}

export interface Consent {
  readonly id: string;
  readonly status: ConsentStatus;
  readonly redirectUrl: string;
  readonly fiTypes: ConsentRequest['fiTypes'];
  readonly purpose: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export type CreateConsentInput = Omit<ConsentRequest, 'idempotencyKey'> & { idempotencyKey?: string };

const ISO_8601_PERIOD = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?$/;

function validateConsentInput(input: CreateConsentInput): void {
  if (!/^\d{10}$/.test(input.mobile)) {
    throw new SahajError('INVALID_INPUT', { field: 'mobile' });
  }
  if (!Array.isArray(input.fiTypes) || input.fiTypes.length === 0) {
    throw new SahajError('INVALID_INPUT', { field: 'fiTypes' });
  }
  for (const fiType of input.fiTypes) {
    if (!isFiType(fiType)) {
      throw new SahajError('INVALID_INPUT', { field: 'fiTypes' });
    }
  }
  if (!input.purpose || input.purpose.trim().length === 0) {
    throw new SahajError('INVALID_INPUT', { field: 'purpose' });
  }
  if (!ISO_8601_PERIOD.test(input.duration)) {
    throw new SahajError('INVALID_INPUT', { field: 'duration' });
  }
}

/** Map a terminal, non-active consent status to the error a developer should see. */
function errorForNonActiveStatus(status: ConsentStatus): SahajError {
  switch (status) {
    case 'REJECTED':
      return new SahajError('CONSENT_REJECTED');
    case 'EXPIRED':
      return new SahajError('CONSENT_EXPIRED');
    case 'REVOKED':
      return new SahajError('CONSENT_REVOKED');
    case 'PAUSED':
      return new SahajError('CONSENT_PAUSED');
    default:
      return new SahajError('CONSENT_NOT_ACTIVE');
  }
}

class ConsentsApi {
  constructor(private readonly adapter: AAAdapter) {}

  async create(input: CreateConsentInput): Promise<Consent> {
    validateConsentInput(input);
    const created = await this.adapter.createConsent(input);
    return {
      id: created.id,
      status: created.status,
      redirectUrl: created.redirectUrl,
      fiTypes: input.fiTypes,
      purpose: input.purpose,
      createdAt: created.createdAt,
      expiresAt: created.expiresAt,
    };
  }

  async status(consentId: string): Promise<ConsentStatus> {
    return this.adapter.getConsentStatus(consentId);
  }
}

class DataApi {
  constructor(
    private readonly adapter: AAAdapter,
    private readonly maxPollAttempts: number,
  ) {}

  async fetch(consentId: string): Promise<FinancialData> {
    await this.waitForActiveConsent(consentId);

    const session = await this.adapter.createSession(consentId);
    if (session.status === 'FAILED') {
      throw new SahajError('SESSION_EXPIRED');
    }

    const fetchedFips = await this.adapter.fetchData(consentId, session.id);
    const deposits: DepositAccount[] = [];
    const fips: FipResult[] = [];

    for (const fip of fetchedFips) {
      if (fip.status === 'DELIVERED' && fip.payload) {
        deposits.push(parseDepositAccount(fip.payload, fip.fipId, fip.fipName));
        fips.push({ fipId: fip.fipId, fipName: fip.fipName, status: 'DELIVERED', fiTypes: [fip.fiType] });
      } else {
        fips.push({
          fipId: fip.fipId,
          fipName: fip.fipName,
          status: 'FAILED',
          fiTypes: [fip.fiType],
          error: new SahajError('FIP_UNAVAILABLE', { fipId: fip.fipId }),
        });
      }
    }

    return {
      consentId,
      sessionId: session.id,
      schemaVersion: '1.1.2',
      generatedAt: new Date(Date.UTC(2026, 5, 1, 9, 0, 0)).toISOString(),
      deposits,
      fips,
    };
  }

  private async waitForActiveConsent(consentId: string): Promise<void> {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      const status = await this.adapter.getConsentStatus(consentId);
      if (status === 'ACTIVE') {
        return;
      }
      if (status !== 'PENDING') {
        throw errorForNonActiveStatus(status);
      }
      await Promise.resolve();
    }
    throw new SahajError('CONSENT_NOT_ACTIVE');
  }
}

class SandboxApi {
  constructor(
    private readonly adapter: AAAdapter,
    private readonly mode: Mode,
  ) {}

  approve(consentId: string): void {
    this.driver().approve(consentId);
  }

  reject(consentId: string): void {
    this.driver().reject(consentId);
  }

  private driver() {
    if (this.mode !== 'sandbox' || !supportsSandboxControls(this.adapter)) {
      throw new SahajError('INVALID_INPUT', { field: 'sandbox' });
    }
    return this.adapter;
  }
}

export class AA {
  readonly mode: Mode;
  readonly consents: ConsentsApi;
  readonly data: DataApi;
  readonly sandbox: SandboxApi;

  constructor(options: AAOptions) {
    this.mode = options.mode;
    const adapter = this.resolveAdapter(options);
    this.consents = new ConsentsApi(adapter);
    this.data = new DataApi(adapter, options.maxPollAttempts ?? 20);
    this.sandbox = new SandboxApi(adapter, options.mode);
  }

  private resolveAdapter(options: AAOptions): AAAdapter {
    if (options.adapter) {
      return options.adapter;
    }
    if (options.mode === 'sandbox') {
      return new MockAdapter(options.sandbox);
    }
    if (options.mode === 'setu-sandbox' && options.setu) {
      return new SetuAdapter(options.setu);
    }
    throw new SahajError('PRODUCTION_NOT_CONFIGURED');
  }
}
