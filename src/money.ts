import { SahajError } from './errors';

/**
 * Money is carried as an integer number of paise everywhere in sahaj, the same
 * money-safe convention as aadesh. ReBIT amounts arrive as decimal rupee strings,
 * so we parse them without ever touching a float.
 */

const RUPEE_AMOUNT = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/** Parse a ReBIT decimal rupee string ("152340.75") into integer paise (15234075). */
export function rupeesToPaise(amount: string): number {
  const match = RUPEE_AMOUNT.exec(amount.trim());
  if (!match) {
    throw new SahajError('SCHEMA_PARSE_FAILED', { field: 'amount' });
  }
  const [, sign, wholeRupees, fractionalDigits = ''] = match;
  const paise = Number(wholeRupees) * 100 + Number(fractionalDigits.padEnd(2, '0'));
  return sign === '-' ? -paise : paise;
}

const INR_FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

/** Format integer paise as an Indian-grouped rupee string ("₹1,52,340.75"). Display only. */
export function formatPaise(paise: number): string {
  return INR_FORMAT.format(paise / 100);
}
