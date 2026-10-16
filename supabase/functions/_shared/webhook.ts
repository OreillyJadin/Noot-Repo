/** Configured signing secrets, platform endpoint first; blanks dropped. */
export function webhookSecrets(env: { platform?: string | null; connect?: string | null }): string[] {
  return [env.platform, env.connect]
    .map((secret) => secret?.trim())
    .filter((secret): secret is string => Boolean(secret));
}

/** Try each secret in order; first successful verify wins. null if none verifies (or list empty). Never throws. */
export async function verifyWithAnySecret<T>(
  secrets: readonly string[],
  verify: (secret: string) => Promise<T>,
): Promise<T | null> {
  for (const secret of secrets) {
    try {
      return await verify(secret);
    } catch {
      // Try the next configured endpoint secret.
    }
  }
  return null;
}
