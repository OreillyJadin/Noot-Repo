// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, FunctionError } from '../src/api/index.ts';
import { initSupabase } from '../src/supabase.ts';

test('invokeFn preserves the server message and error code', async () => {
  initSupabase({ url: 'http://127.0.0.1:54321', anonKey: 'local-anon-key' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: 'Add your date of birth to book a session.',
    code: 'age_required',
    message: 'Add your date of birth to book a session.',
  }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    await assert.rejects(
      api.createPaymentIntent({
        tutorId: 'tutor-id',
        courseCode: 'MATH 125',
        durationMinutes: 60,
        scheduledAt: '2027-01-15T16:00:00.000Z',
      }),
      (error: unknown) => {
        assert.ok(error instanceof FunctionError);
        assert.equal(error.message, 'Add your date of birth to book a session.');
        assert.equal(error.status, 403);
        assert.equal(error.code, 'age_required');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
