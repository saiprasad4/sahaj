/**
 * The sahaj quickstart. No keys, no FIU licence, no registration.
 *
 *   npm install
 *   npm run example
 *
 * It creates a consent, runs the full data loop against the sandbox, and prints a
 * typed bank balance parsed from the ReBIT deposit schema.
 */

import { AA, formatPaise, totalDepositBalancePaise } from '../src/index';

async function main(): Promise<void> {
  const aa = new AA({ mode: 'sandbox' }); // no keys, no FIU licence needed

  const consent = await aa.consents.create({
    mobile: '9999999999', // magic VUA... healthy multi-account user
    fiTypes: ['DEPOSIT'],
    purpose: 'loan-underwriting',
    duration: 'P90D',
  });

  console.log('Approve here:', consent.redirectUrl); // in sandbox this auto-approves

  const data = await aa.data.fetch(consent.id); // awaits ACTIVE, opens a session, decrypts, parses

  const firstAccount = data.deposits[0];
  if (firstAccount) {
    console.log(`${firstAccount.fipName} ${firstAccount.maskedAccountNumber}`);
    console.log('Current balance:', formatPaise(firstAccount.summary.currentBalancePaise));
    console.log('Transactions:', firstAccount.transactions.length);
  }

  console.log('Total across accounts:', formatPaise(totalDepositBalancePaise(data)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
