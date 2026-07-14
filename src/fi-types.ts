/**
 * ReBIT Financial Information (FI) types.
 *
 * The full ReBIT spec defines 23 FI types across banking, investments, insurance
 * and taxes. v0.1 models DEPOSIT end to end and declares the rest so the surface
 * is stable before their parsers land in later milestones.
 */

export const FI_TYPES = [
  'DEPOSIT',
  'TERM_DEPOSIT',
  'RECURRING_DEPOSIT',
  'SIP',
  'CP',
  'GOVT_SECURITIES',
  'EQUITIES',
  'BONDS',
  'DEBENTURES',
  'MUTUAL_FUNDS',
  'ETF',
  'IDR',
  'CIS',
  'AIF',
  'INSURANCE_POLICIES',
  'NPS',
  'INVIT',
  'REIT',
  'GSTR',
  'OTHER',
] as const;

export type FiType = (typeof FI_TYPES)[number];

/** FI types with a full typed parser in v0.1. */
export const SUPPORTED_FI_TYPES: readonly FiType[] = ['DEPOSIT'];

export function isFiType(value: string): value is FiType {
  return (FI_TYPES as readonly string[]).includes(value);
}
