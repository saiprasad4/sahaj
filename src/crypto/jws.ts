import { createSign } from 'node:crypto';
import { flattenedVerify, importSPKI } from 'jose';
import { SahajError } from '../errors';

/**
 * Detached JWS request signing for the AA ecosystem (RFC 7515 App. F + RFC 7797
 * unencoded payload). Header name `x-jws-signature`, algorithm RS256 only.
 *
 * The signature is computed over the plaintext JSON request body and travels in a
 * header, so the body on the wire is the untouched JSON. Verification enforces an
 * RS256 allow-list (rejecting `alg:none` and downgrades) and the `crit:["b64"]`
 * unencoded-payload extension, and must run BEFORE the body is deserialized.
 *
 * The signing key is reached only through a `JwsSigner`, so an FIU can keep its
 * private key in a KMS/HSM: the signer is handed the exact JWS signing input bytes
 * and returns the raw signature. The default `LocalRsaSigner` holds a PKCS#8 key
 * the caller supplies; the SDK never generates, logs, or transmits it.
 */

const REQUIRED_ALG = 'RS256';

export const JWS_HEADER_NAME = 'x-jws-signature';

/**
 * A pluggable RS256 signer. Implement this to sign inside a KMS/HSM. `sign`
 * receives the JWS signing input (`ASCII(protectedHeader) || "." || payloadBytes`,
 * per RFC 7797 with `b64:false`) and returns the raw RSASSA-PKCS1-v1_5 signature.
 */
export interface JwsSigner {
  readonly kid: string;
  sign(signingInput: Uint8Array): Promise<Uint8Array>;
}

/**
 * The default signer: an RS256 PKCS#8 private key held in process. The key is the
 * caller's, passed in from their own secret store; it is never persisted or logged
 * by the SDK. For non-exportable keys, provide a custom `JwsSigner` backed by KMS.
 */
export class LocalRsaSigner implements JwsSigner {
  readonly kid: string;
  private readonly pkcs8Pem: string;

  constructor(params: { kid: string; privateKeyPkcs8Pem: string }) {
    if (!params.privateKeyPkcs8Pem?.includes('PRIVATE KEY')) {
      throw new SahajError('KEY_MATERIAL_INVALID', { field: 'privateKeyPkcs8Pem' });
    }
    this.kid = params.kid;
    this.pkcs8Pem = params.privateKeyPkcs8Pem;
  }

  async sign(signingInput: Uint8Array): Promise<Uint8Array> {
    try {
      const signature = createSign('RSA-SHA256').update(signingInput).sign(this.pkcs8Pem);
      return new Uint8Array(signature);
    } catch {
      // Do not forward the underlying error: it can quote key-related detail.
      throw new SahajError('KEY_MATERIAL_INVALID', { field: 'privateKeyPkcs8Pem' });
    }
  }
}

function encodeProtectedHeader(kid: string): string {
  const header = { alg: REQUIRED_ALG, kid, b64: false, crit: ['b64'] };
  return Buffer.from(JSON.stringify(header)).toString('base64url');
}

/** The RFC 7797 signing input for an unencoded (`b64:false`) payload. */
function signingInput(protectedHeader: string, body: string): Uint8Array {
  return Buffer.concat([Buffer.from(`${protectedHeader}.`, 'ascii'), Buffer.from(body, 'utf8')]);
}

/**
 * Produce the detached `x-jws-signature` header value over a plaintext JSON body.
 * The returned string is `<protected>..<signature>`: the compact detached form
 * with an empty middle (payload) segment, which is what the AA header carries.
 */
export async function signRequestBody(body: string, signer: JwsSigner): Promise<string> {
  const protectedHeader = encodeProtectedHeader(signer.kid);
  const signature = await signer.sign(signingInput(protectedHeader, body));
  return `${protectedHeader}..${Buffer.from(signature).toString('base64url')}`;
}

/**
 * Verify a detached `x-jws-signature` over a plaintext JSON body BEFORE the caller
 * deserializes it. Enforces the RS256 allow-list and `crit:["b64"]`, and resolves
 * the sender public key via `resolvePublicKey(kid)`. Throws on any failure so the
 * caller fails closed and never parses an unverified body.
 */
export async function verifyRequestBody(params: {
  body: string;
  jwsHeader: string;
  resolvePublicKey: (kid: string | undefined) => Promise<string> | string;
}): Promise<void> {
  const segments = params.jwsHeader.split('.');
  if (segments.length !== 3 || segments[1] !== '') {
    throw new SahajError('DECRYPTION_FAILED', { field: JWS_HEADER_NAME });
  }
  const [protectedHeader, , signature] = segments;

  let kid: string | undefined;
  try {
    const header = JSON.parse(Buffer.from(protectedHeader ?? '', 'base64url').toString('utf8'));
    kid = header.kid;
    // Reject alg:none and any downgrade up front, before touching a key.
    if (header.alg !== REQUIRED_ALG) {
      throw new SahajError('DECRYPTION_FAILED', { field: 'alg' });
    }
    // Require the unencoded-payload form explicitly, rather than leaning on a jose
    // quirk: b64 must be false and b64 must be a declared critical header.
    if (header.b64 !== false || !Array.isArray(header.crit) || !header.crit.includes('b64')) {
      throw new SahajError('DECRYPTION_FAILED', { field: 'crit' });
    }
  } catch (cause) {
    if (cause instanceof SahajError) {
      throw cause;
    }
    throw new SahajError('DECRYPTION_FAILED', { field: JWS_HEADER_NAME, cause });
  }

  const spki = await params.resolvePublicKey(kid);
  const key = await importPublicKey(spki);
  const payload = new TextEncoder().encode(params.body);

  try {
    await flattenedVerify({ protected: protectedHeader, signature: signature ?? '', payload }, key, {
      algorithms: [REQUIRED_ALG],
      crit: { b64: true },
    });
  } catch (cause) {
    throw new SahajError('DECRYPTION_FAILED', { field: JWS_HEADER_NAME, cause });
  }
}

async function importPublicKey(pem: string) {
  try {
    return await importSPKI(pem, REQUIRED_ALG);
  } catch (cause) {
    throw new SahajError('KEY_MATERIAL_INVALID', { field: 'publicKey', cause });
  }
}
