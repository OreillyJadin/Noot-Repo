import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = fileURLToPath(new URL('../apps/mobile', import.meta.url));
const b4 = readFileSync(join(mobileRoot, 'app/b4.tsx'), 'utf8');

assert.match(b4, /err instanceof FunctionError && err\.code === 'age_required'/);
assert.match(
  b4,
  /err\.code === 'under_age'[\s\S]*?message === STUDENT_UNDER_AGE_MESSAGE[\s\S]*?router\.replace\('\/under_age'\)/,
);
assert.match(b4, /Add your date of birth to book\. You must be 18 or older\./);
assert.match(b4, /isValidDob\(dateOfBirth\)[\s\S]*?api\.profile\.confirmDateOfBirth\(dateOfBirth\)[\s\S]*?await pay\(\)/);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '.expo' ? [] : sourceFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const userCopyPatterns = [
  /<Text\b[^>]*>[\s\S]{0,120}\bage_required\b[\s\S]{0,120}<\/Text>/,
  /(?:label|title|message|placeholder|accessibilityLabel)\s*[:=]\s*['"`]age_required['"`]/,
  /Alert\.alert\s*\(\s*['"`]age_required['"`]/,
];
for (const path of sourceFiles(mobileRoot)) {
  const source = readFileSync(path, 'utf8');
  for (const pattern of userCopyPatterns) assert.doesNotMatch(source, pattern, path);
}

console.log('verify_age_required_ui: B4 handles age errors without exposing the internal code');
