import { randomUUID } from 'node:crypto';
import {
  type DhCurve,
  JWS_HEADER_NAME,
  type JwsSigner,
  base64ToBytes,
  buildKeyMaterialJson,
  decryptFi,
  generateRequesterKeyMaterial,
  parseKeyMaterialJson,
  signRequestBody,
  verifyRequestBody,
  zeroize,
} from '../crypto';
import { SahajError } from '../errors';
import type { FiType } from '../fi-types';
import type { RawDepositFi } from '../models/deposit';
import type {
  AAAdapter,
  AdapterConsent,
  AdapterSession,
  ConsentRequest,
  ConsentStatus,
  FetchedFip,
} from './adapter';

/**
 * The Setu (now Agya, Pine Labs) Account Aggregator adapter.
 *
 * This talks to Setu's self-managed ReBIT AA API ... the surface where the FIU
 * supplies its own ephemeral KeyMaterial and receives `encryptedFI`, so the SDK
 * can decrypt on customer infra. It deliberately does NOT use Setu's managed
 * `/v2/consents` + `/sessions` product, which decrypts server-side (hosted
 * Rahasya) and never exposes `encryptedFI`: our security posture is that keys and
 * decryption stay with the customer.
 *
 * All key generation, ECDH, HKDF, and AES-GCM run in-process via `src/crypto`.
 * No private key, shared secret, session key, or decrypted FI is ever logged or
 * sent anywhere. The FIU request-signing key is reached only through a pluggable
 * `JwsSigner`, so it can live in a KMS/HSM.
 *
 * Several Setu-specific details (the exact self-managed base host, and whether the
 * DHPublicKey is raw or PEM-wrapped) can only be confirmed against live sandbox
 * credentials, so they are configuration inputs rather than hardcoded guesses.
 * See the PR/README for the live-loop setup.
 */

/** The minimal fetch surface the adapter needs, so tests can inject a stub. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<{
  status: number;
  /**
   * Response headers, used to read the AA's `x-jws-signature`. Optional so simple
   * stubs need not provide it; response verification is skipped when absent.
   */
  headers?: { get(name: string): string | null } | Record<string, string>;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/** Resolve the AA/router signing certificate (SPKI PEM) for a response `kid`. */
export type ResolveResponsePublicKey = (kid: string | undefined) => Promise<string> | string;

export interface SetuAdapterOptions {
  /**
   * Base URL of Setu's self-managed ReBIT AA API (the one that returns
   * encryptedFI). Confirm the exact host from your Bridge/Postman credentials.
   * Example sandbox default is provided but must be verified against your account.
   */
  readonly baseUrl: string;
  /** The `client_api_key` Setu issues the FIU for the self-managed API. */
  readonly clientApiKey: string;
  /** The FIU's own id registered with Setu (DataConsumer.id / recipient id). */
  readonly fiuId: string;
  /** The signer for the detached x-jws-signature. Default = LocalRsaSigner. */
  readonly signer: JwsSigner;
  /** DH curve the counterparty uses. Setu's KeyMaterial reports "Curve25519". */
  readonly curve?: DhCurve;
  /** Injected HTTP client. Defaults to the global fetch, adapted. */
  readonly httpClient?: FetchLike;
  /** ReBIT API version Setu expects in request bodies. */
  readonly apiVersion?: string;
  /** How the VUA is formed from a mobile number, e.g. "<mobile>@onemoney". */
  readonly vuaHandle?: string;
  /** Redirect URL the user returns to after the consent webview. */
  readonly redirectUrl?: string;
  /**
   * Resolves the AA/router signing cert (SPKI PEM) for a response `kid`. When
   * present, every response's detached `x-jws-signature` is verified over the raw
   * body BEFORE it is parsed, and a missing or invalid signature fails closed.
   * Response verification is required by default (see `allowUnsignedResponses`).
   */
  readonly resolveResponsePublicKey?: ResolveResponsePublicKey;
  /**
   * Escape hatch for sandbox and testing only: accept responses that are not
   * signed. Response verification is required by default, so the adapter refuses to
   * construct unless it is given `resolveResponsePublicKey` or this is set true.
   * Never set this in production.
   */
  readonly allowUnsignedResponses?: boolean;
}

/** A serializable snapshot of a consent, so it can survive a restart or a new process. */
export interface SetuConsentState {
  readonly consentHandle: string;
  readonly fiTypes: FiType[];
  readonly dataRange: { from: string; to: string };
  readonly consentId?: string;
  readonly consentArtefactSignature?: string;
}

interface SetuConsentRecord {
  readonly consentHandle: string;
  readonly fiTypes: FiType[];
  readonly dataRange: { from: string; to: string };
  consentId?: string;
  consentArtefactSignature?: string;
}

const DEFAULT_API_VERSION = '1.1.2';

/** Setu consent status strings mapped onto the SDK's ConsentStatus enum. */
function mapConsentStatus(raw: string): ConsentStatus {
  const upper = raw.toUpperCase();
  switch (upper) {
    case 'ACTIVE':
    case 'READY':
      return 'ACTIVE';
    case 'REJECTED':
      return 'REJECTED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'REVOKED':
      return 'REVOKED';
    case 'PAUSED':
      return 'PAUSED';
    default:
      return 'PENDING';
  }
}

export class SetuAdapter implements AAAdapter {
  readonly name = 'setu';

  private readonly baseUrl: string;
  private readonly clientApiKey: string;
  private readonly fiuId: string;
  private readonly signer: JwsSigner;
  private readonly curve: DhCurve;
  private readonly httpClient: FetchLike;
  private readonly apiVersion: string;
  private readonly vuaHandle: string;
  private readonly redirectUrl: string;
  private readonly resolveResponsePublicKey?: ResolveResponsePublicKey;
  private readonly allowUnsignedResponses: boolean;
  private readonly consents = new Map<string, SetuConsentRecord>();
  private readonly pendingSessions = new Map<
    string,
    { curve: DhCurve; privateKey: Uint8Array; nonce: Uint8Array }
  >();

  constructor(options: SetuAdapterOptions) {
    if (!options.baseUrl || !options.clientApiKey || !options.fiuId) {
      throw new SahajError('MISSING_CREDENTIALS');
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.clientApiKey = options.clientApiKey;
    this.fiuId = options.fiuId;
    this.signer = options.signer;
    this.curve = options.curve ?? 'Curve25519';
    this.httpClient = options.httpClient ?? defaultFetch;
    this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
    this.vuaHandle = options.vuaHandle ?? '@onemoney';
    this.redirectUrl = options.redirectUrl ?? 'https://localhost/aa/redirect';
    this.resolveResponsePublicKey = options.resolveResponsePublicKey;
    this.allowUnsignedResponses = options.allowUnsignedResponses ?? false;
    if (!options.resolveResponsePublicKey && !this.allowUnsignedResponses) {
      // Fail closed by default: production must verify AA response signatures.
      throw new SahajError('INVALID_INPUT', { field: 'resolveResponsePublicKey' });
    }
  }

  async createConsent(request: ConsentRequest): Promise<AdapterConsent> {
    const now = new Date();
    const expiry = new Date(now.getTime() + durationToMillis(request.duration));
    const dataRange = {
      from: new Date(now.getTime() - durationToMillis(request.duration)).toISOString(),
      to: now.toISOString(),
    };

    const body = {
      ver: this.apiVersion,
      timestamp: now.toISOString(),
      txnid: newTxnId(),
      ConsentDetail: {
        consentStart: now.toISOString(),
        consentExpiry: expiry.toISOString(),
        consentMode: 'STORE',
        fetchType: 'PERIODIC',
        consentTypes: ['PROFILE', 'SUMMARY', 'TRANSACTIONS'],
        fiTypes: request.fiTypes,
        DataConsumer: { id: this.fiuId, type: 'FIU' },
        Customer: { id: `${request.mobile}${this.vuaHandle}` },
        Purpose: {
          code: '101',
          refUri: 'https://api.rebit.org.in/aa/purpose/101.xml',
          text: request.purpose,
          Category: { type: 'Personal Finance' },
        },
        FIDataRange: dataRange,
        DataLife: { unit: 'MONTH', value: 1 },
        Frequency: { unit: 'MONTH', value: 30 },
      },
    };

    const response = await this.post('/Consent', body);
    const consentHandle = stringField(response, 'ConsentHandle');
    if (!consentHandle) {
      throw new SahajError('AA_UPSTREAM_ERROR', { requestId: stringField(response, 'txnid') });
    }

    this.consents.set(consentHandle, {
      consentHandle,
      fiTypes: request.fiTypes,
      dataRange,
    });

    return {
      id: consentHandle,
      status: 'PENDING',
      redirectUrl: this.redirectUrl,
      createdAt: now.toISOString(),
      expiresAt: expiry.toISOString(),
    };
  }

  async getConsentStatus(consentId: string): Promise<ConsentStatus> {
    const record = this.requireConsent(consentId);
    const response = await this.get(`/Consent/handle/${encodeURIComponent(consentId)}`);

    const statusRaw =
      stringField(nestedObject(response, 'ConsentStatus'), 'status') ??
      stringField(response, 'status') ??
      'PENDING';
    const status = mapConsentStatus(statusRaw);

    if (status === 'ACTIVE') {
      const resolvedId =
        stringField(nestedObject(response, 'ConsentStatus'), 'id') ?? stringField(response, 'id');
      if (resolvedId) {
        record.consentId = resolvedId;
      }
    }

    return status;
  }

  async createSession(consentId: string): Promise<AdapterSession> {
    const record = this.requireConsent(consentId);
    if (!record.consentId) {
      // The signed consent id only exists once the consent is ACTIVE.
      await this.getConsentStatus(consentId);
    }
    if (!record.consentId) {
      throw new SahajError('CONSENT_NOT_ACTIVE');
    }

    const requester = generateRequesterKeyMaterial(this.curve);
    const now = new Date();
    const keyMaterial = buildKeyMaterialJson({
      curve: this.curve,
      publicKey: requester.ourKeyMaterial.publicKey,
      nonce: requester.ourKeyMaterial.nonce,
      expiry: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const body = {
      ver: this.apiVersion,
      timestamp: now.toISOString(),
      txnid: newTxnId(),
      FIDataRange: record.dataRange,
      Consent: { id: record.consentId, digitalSignature: record.consentArtefactSignature ?? '' },
      KeyMaterial: keyMaterial,
    };

    const response = await this.post('/FI/request', body);
    const sessionId = stringField(response, 'sessionId');
    if (!sessionId) {
      throw new SahajError('AA_UPSTREAM_ERROR', { requestId: stringField(response, 'txnid') });
    }

    // Stash the ephemeral material against the session so fetchData can decrypt.
    this.pendingSessions.set(sessionId, {
      curve: this.curve,
      privateKey: requester.keyPair.privateKey,
      nonce: requester.ourKeyMaterial.nonce,
    });

    return { id: sessionId, status: 'PENDING' };
  }

  async fetchData(_consentId: string, sessionId: string): Promise<FetchedFip[]> {
    const pending = this.pendingSessions.get(sessionId);
    if (!pending) {
      throw new SahajError('SESSION_EXPIRED');
    }

    const response = await this.get(`/FI/fetch/${encodeURIComponent(sessionId)}`);
    const fiEntries = arrayField(response, 'FI');
    if (fiEntries.length === 0) {
      throw new SahajError('NO_ACCOUNTS_FOUND');
    }

    const results: FetchedFip[] = [];
    try {
      for (const fiEntry of fiEntries) {
        results.push(...this.decryptFipEntry(fiEntry, pending));
      }
    } finally {
      // The ephemeral private key is single-use; drop and zeroize it.
      zeroize(pending.privateKey, pending.nonce);
      this.pendingSessions.delete(sessionId);
    }
    return results;
  }

  /**
   * Decrypt every account block a FIP returned. A FIP carries one KeyMaterial and a
   * `data` array with one encrypted block per linked account, so this yields one
   * FetchedFip per account rather than dropping all but the first.
   */
  private decryptFipEntry(
    fiEntry: Record<string, unknown>,
    pending: { curve: DhCurve; privateKey: Uint8Array; nonce: Uint8Array },
  ): FetchedFip[] {
    const fipId = stringField(fiEntry, 'fipID') ?? stringField(fiEntry, 'fipId') ?? 'unknown-fip';
    const fipName = stringField(fiEntry, 'fipName') ?? fipId;

    const keyMaterialJson = nestedObject(fiEntry, 'KeyMaterial');
    const dataEntries = arrayField(fiEntry, 'data');
    if (!keyMaterialJson || dataEntries.length === 0) {
      return [{ fipId, fipName, status: 'FAILED', fiType: 'DEPOSIT' }];
    }

    let fipKeyMaterial: ReturnType<typeof parseKeyMaterialJson>;
    try {
      // biome-ignore lint/suspicious/noExplicitAny: bridging untyped upstream JSON into the typed parser.
      fipKeyMaterial = parseKeyMaterialJson(keyMaterialJson as any, pending.curve);
    } catch {
      return [{ fipId, fipName, status: 'FAILED', fiType: 'DEPOSIT' }];
    }

    return dataEntries.map((dataEntry) =>
      this.decryptAccountBlock(dataEntry, fipKeyMaterial, pending, fipId, fipName),
    );
  }

  private decryptAccountBlock(
    dataEntry: Record<string, unknown>,
    fipKeyMaterial: ReturnType<typeof parseKeyMaterialJson>,
    pending: { curve: DhCurve; privateKey: Uint8Array; nonce: Uint8Array },
    fipId: string,
    fipName: string,
  ): FetchedFip {
    const encryptedFi = stringField(dataEntry, 'encryptedFI');
    if (!encryptedFi) {
      return { fipId, fipName, status: 'FAILED', fiType: 'DEPOSIT' };
    }

    try {
      const plaintext = decryptFi({
        curve: fipKeyMaterial.curve,
        ourPrivateKey: pending.privateKey,
        ourNonce: pending.nonce,
        peerPublicKey: fipKeyMaterial.publicKey,
        peerNonce: fipKeyMaterial.nonce,
        ciphertextWithTag: base64ToBytes(encryptedFi, 'encryptedFI'),
      });
      const payload = extractDepositPayload(JSON.parse(new TextDecoder().decode(plaintext)));
      return { fipId, fipName, status: 'DELIVERED', fiType: 'DEPOSIT', payload };
    } catch (cause) {
      if (cause instanceof SahajError) {
        return { fipId, fipName, status: 'FAILED', fiType: 'DEPOSIT' };
      }
      throw new SahajError('DECRYPTION_FAILED', { fipId, cause });
    }
  }

  /**
   * Export a consent as a serializable snapshot. A server persists this after
   * creating the consent, so a later request or a fresh process can rehydrate it
   * with `hydrateConsentState` before creating a data session. The ephemeral
   * session key is not part of this: `createSession` and `fetchData` run together.
   */
  exportConsentState(consentHandle: string): SetuConsentState {
    const record = this.requireConsent(consentHandle);
    return {
      consentHandle: record.consentHandle,
      fiTypes: [...record.fiTypes],
      dataRange: { ...record.dataRange },
      consentId: record.consentId,
      consentArtefactSignature: record.consentArtefactSignature,
    };
  }

  /** Restore a consent snapshot into a fresh adapter, e.g. after a restart. */
  hydrateConsentState(state: SetuConsentState): void {
    this.consents.set(state.consentHandle, {
      consentHandle: state.consentHandle,
      fiTypes: [...state.fiTypes],
      dataRange: { ...state.dataRange },
      consentId: state.consentId,
      consentArtefactSignature: state.consentArtefactSignature,
    });
  }

  private requireConsent(consentId: string): SetuConsentRecord {
    const record = this.consents.get(consentId);
    if (!record) {
      throw new SahajError('INVALID_INPUT', { field: 'consentId' });
    }
    return record;
  }

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const serialized = JSON.stringify(body);
    const jwsHeader = await signRequestBody(serialized, this.signer);
    return this.send(path, 'POST', serialized, jwsHeader);
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    return this.send(path, 'GET');
  }

  private async send(
    path: string,
    method: string,
    body?: string,
    jwsHeader?: string,
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      client_api_key: this.clientApiKey,
    };
    if (jwsHeader) {
      headers['x-jws-signature'] = jwsHeader;
    }

    const response = await this.httpClient(`${this.baseUrl}${path}`, {
      method,
      headers,
      body,
    });

    if (response.status === 401 || response.status === 403) {
      throw new SahajError('TOKEN_EXPIRED');
    }
    if (response.status === 429) {
      throw new SahajError('RATE_LIMITED');
    }
    if (response.status >= 400) {
      const text = await safeText(response);
      throw new SahajError('AA_UPSTREAM_ERROR', { requestId: text.slice(0, 200) });
    }

    // Read the body as raw text so the JWS signature covers the exact bytes, then
    // verify BEFORE deserializing. Parsing an unverified body is the classic bug.
    const rawBody = await response.text();
    await this.verifyResponseSignature(rawBody, response.headers);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new SahajError('AA_UPSTREAM_ERROR');
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new SahajError('AA_UPSTREAM_ERROR');
    }
    return parsed as Record<string, unknown>;
  }

  /**
   * Verify the AA's detached response signature over the raw body before it is
   * parsed. A no-op unless `resolveResponsePublicKey` is configured; when it is, a
   * missing or invalid signature fails closed.
   */
  private async verifyResponseSignature(
    rawBody: string,
    responseHeaders: FetchResponseHeaders | undefined,
  ): Promise<void> {
    if (!this.resolveResponsePublicKey) {
      return;
    }
    const jwsHeader = readHeader(responseHeaders, JWS_HEADER_NAME);
    if (!jwsHeader) {
      throw new SahajError('AA_UPSTREAM_ERROR', { field: JWS_HEADER_NAME });
    }
    await verifyRequestBody({
      body: rawBody,
      jwsHeader,
      resolvePublicKey: this.resolveResponsePublicKey,
    });
  }
}

type FetchResponseHeaders = { get(name: string): string | null } | Record<string, string>;

/** Read a header from either a Headers-like object or a plain record, case-insensitively. */
function readHeader(headers: FetchResponseHeaders | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(key: string): string | null }).get(name) ?? undefined;
  }
  const record = headers as Record<string, string>;
  const match = Object.keys(record).find((key) => key.toLowerCase() === name.toLowerCase());
  return match ? record[match] : undefined;
}

/** The default fetch adapter, wrapping the global fetch into the FetchLike shape. */
const defaultFetch: FetchLike = async (url, init) => {
  const response = await fetch(url, init);
  return {
    status: response.status,
    headers: response.headers,
    json: () => response.json(),
    text: () => response.text(),
  };
};

async function safeText(response: { text(): Promise<string> }): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/**
 * Pull the ReBIT deposit FI object out of a decrypted FI payload. ReBIT wraps the
 * account under `Account` (sometimes nested inside an outer FI envelope). This
 * hands the existing `parseDepositAccount` exactly the shape it expects.
 */
function extractDepositPayload(decrypted: unknown): RawDepositFi {
  if (decrypted && typeof decrypted === 'object') {
    const record = decrypted as Record<string, unknown>;
    if (record.Account) {
      return decrypted as RawDepositFi;
    }
    const account = nestedObject(record, 'Accounts') ?? nestedObject(record, 'Data');
    if (account?.Account) {
      return account as unknown as RawDepositFi;
    }
  }
  throw new SahajError('SCHEMA_PARSE_FAILED', { field: 'Account' });
}

function durationToMillis(period: string): number {
  const match = period.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/);
  if (!match) {
    return 90 * 24 * 60 * 60 * 1000;
  }
  const [, years, months, weeks, days] = match;
  const dayCount =
    Number(years ?? 0) * 365 + Number(months ?? 0) * 30 + Number(weeks ?? 0) * 7 + Number(days ?? 0);
  return dayCount * 24 * 60 * 60 * 1000;
}

function newTxnId(): string {
  return randomUUID();
}

// ── Small untyped-JSON readers, so the flows above stay readable ────────────────

function stringField(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' ? value : undefined;
}

function nestedObject(
  source: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = source?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function arrayField(source: Record<string, unknown> | undefined, key: string): Record<string, unknown>[] {
  const value = source?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object',
  );
}
