import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SahajError } from '../src/errors';
import { AA, LocalRsaSigner, SetuAdapter } from '../src/index';

/**
 * Wiring the Setu adapter through the top-level AA client: `setu-sandbox` builds
 * the adapter from config, `production` accepts an injected SetuAdapter, and both
 * expose the same `consents.create` + `data.fetch` surface as the sandbox.
 */

function makeSigner() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return new LocalRsaSigner({
    kid: 'k',
    privateKeyPkcs8Pem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
}

describe('AA in Setu modes', () => {
  it('builds a Setu adapter from setu-sandbox config', () => {
    const aa = new AA({
      mode: 'setu-sandbox',
      setu: {
        baseUrl: 'https://fiu-sandbox.setu-aa.example',
        clientApiKey: 'k',
        fiuId: 'f',
        signer: makeSigner(),
      },
    });
    expect(aa.mode).toBe('setu-sandbox');
  });

  it('accepts an injected SetuAdapter in production mode', () => {
    const adapter = new SetuAdapter({
      baseUrl: 'https://fiu.setu-aa.example',
      clientApiKey: 'k',
      fiuId: 'f',
      signer: makeSigner(),
    });
    const aa = new AA({ mode: 'production', adapter });
    expect(aa.mode).toBe('production');
  });

  it('rejects setu-sandbox mode with neither adapter nor setu config', () => {
    expect(() => new AA({ mode: 'setu-sandbox' })).toThrow(SahajError);
  });

  it('does not expose sandbox approve/reject controls in production', () => {
    const adapter = new SetuAdapter({
      baseUrl: 'https://fiu.setu-aa.example',
      clientApiKey: 'k',
      fiuId: 'f',
      signer: makeSigner(),
    });
    const aa = new AA({ mode: 'production', adapter });
    expect(() => aa.sandbox.approve('anything')).toThrow(SahajError);
  });
});
