// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSignedOutRoute, needsSignedOutRedirect, routeName } from '../lib/signedOutRoutes.ts';

test('routeName strips the slash, query and any nested segment', () => {
  assert.equal(routeName('/'), '');
  assert.equal(routeName('/sessions?tab=past'), 'sessions');
  assert.equal(routeName('/set_password?mode=reset'), 'set_password');
  assert.equal(routeName('/admin_user/abc'), 'admin_user');
  assert.equal(routeName('/auth-callback#access_token=x'), 'auth-callback');
});

test('the landing and the sign-in / sign-up screens are public', () => {
  for (const p of ['/', '/signin', '/signup', '/forgot_password', '/auth-callback?code=1']) {
    assert.equal(isSignedOutRoute(p), true, p);
    assert.equal(needsSignedOutRedirect(p, false), false, p);
  }
});

test("every role's signed-in screens redirect without a session", () => {
  const signedIn = [
    '/home', '/sessions', '/chats', '/profile', '/saved', '/b2', // student
    '/tutor_home', '/tutor_calendar', '/tutor_sessions', '/tutor_profile', // tutor
    '/ambassador_home', '/ambassador_referrals', // ambassador
    '/admin_home', '/admin_users', '/admin_user', '/admin_bookings', // admin
    '/guidelines', '/accept_terms', '/verified', '/set_password', '/t3', // onboarding (needs a session)
  ];
  for (const p of signedIn) {
    assert.equal(needsSignedOutRedirect(p, false), true, p);
    assert.equal(needsSignedOutRedirect(p, true), false, p);
  }
});

test('an unknown screen is protected by default', () => {
  assert.equal(needsSignedOutRedirect('/some_new_screen', false), true);
});
