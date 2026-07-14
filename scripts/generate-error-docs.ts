/**
 * Generate one Markdown page per error code from the catalog, so every `docUrl`
 * resolves. Run with: npx tsx scripts/generate-error-docs.ts
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allErrorCodes, describeError } from '../src/index';

const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'errors');

for (const code of allErrorCodes()) {
  const entry = describeError(code);
  const reproduce = entry.sandboxVua
    ? `\n## Reproduce in sandbox\n\nUse the magic VUA \`${entry.sandboxVua}\` as the consent mobile number.\n`
    : '';
  const page = `# ${code}

**Category:** \`${entry.type}\`

${entry.message}

## What to show the user

${entry.displayMessage}

## Suggested action

${entry.suggestedAction}
${reproduce}`;
  writeFileSync(join(outputDir, `${code}.md`), page);
}

console.log(`Generated ${allErrorCodes().length} error pages in docs/errors`);
