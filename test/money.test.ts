import { describe, expect, it } from 'vitest';
import { formatPaise, isSahajError, rupeesToPaise } from '../src/index';

describe('rupeesToPaise', () => {
  it('parses whole and fractional rupees without floating point', () => {
    expect(rupeesToPaise('152340.75')).toBe(15234075);
    expect(rupeesToPaise('0.01')).toBe(1);
    expect(rupeesToPaise('100')).toBe(10000);
    expect(rupeesToPaise('100.5')).toBe(10050);
  });

  it('handles negative amounts', () => {
    expect(rupeesToPaise('-42.50')).toBe(-4250);
  });

  it('rejects malformed amounts with a schema parse error', () => {
    for (const bad of ['12.345', 'abc', '', '1,000.00', '1.2.3']) {
      try {
        rupeesToPaise(bad);
        expect.unreachable(`should have thrown for "${bad}"`);
      } catch (error) {
        expect(isSahajError(error)).toBe(true);
        if (isSahajError(error)) {
          expect(error.code).toBe('SCHEMA_PARSE_FAILED');
        }
      }
    }
  });
});

describe('formatPaise', () => {
  it('renders Indian-grouped rupees', () => {
    expect(formatPaise(15234075)).toContain('1,52,340.75');
  });
});
