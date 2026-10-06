// The password rule (ERR-014): 8+ characters with a lowercase letter, an uppercase letter,
// a number and a special character. The auth server is what enforces it
// (supabase/config.toml → password_requirements); this mirror exists so the app can say
// what is missing before the request is sent.

export const PASSWORD_MIN_LENGTH = 8;

/** The characters the auth server counts as special — its list, not ours. */
export const PASSWORD_SPECIAL_CHARACTERS = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~';

export const PASSWORD_RULE_HINT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with an uppercase letter, a lowercase letter, a number and a special character (like ! or #).`;

/** What is wrong with a password, in words for the user — or null when it meets the rule. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[a-z]/.test(password)) return 'Add a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Add an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Add a number.';
  if (![...password].some((c) => PASSWORD_SPECIAL_CHARACTERS.includes(c))) {
    return 'Add a special character, like ! or #.';
  }
  return null;
}
