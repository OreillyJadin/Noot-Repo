// The flows a laptop user needs first: sign in, find a tutor, book (and pay), chat.
// Seed data: supabase/seed_demo.mjs (student@ / Sara W., DEV_PASSWORD).
// Payment: with no Stripe key on the functions, create-payment-intent returns a simulated
// intent and checkout confirms without a card. Set E2E_STRIPE=1 (functions given a test
// sk_test_ key, web built with the matching pk_test_) to pay with test card 4242 instead.
// Locally: `pnpm build:web && pnpm e2e:web` against `supabase start` + `supabase functions serve`.
// After a `supabase db reset`, restart the realtime container (docker restart
// supabase_realtime_noot) or live chat messages never arrive and the chat step fails.
import { test, expect, type Page } from '@playwright/test';
import { DEV_PASSWORD } from '../../../scripts/_devPassword.mjs';

const STUDENT = 'student@crimson.ua.edu';
const TUTOR = 'sara@crimson.ua.edu';

// Screens behind the current one stay mounted, so a text can match more than once; check the
// copy that's on screen.
function onScreen(page: Page, text: string, timeout?: number) {
  return expect(page.getByText(text, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout });
}

async function signIn(page: Page, email: string) {
  await page.goto('/signin');
  await page.getByPlaceholder('yourname@crimson.ua.edu').fill(email);
  await page.getByPlaceholder('Your password').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/signin/);
}

async function openSara(page: Page) {
  await page.getByRole('link', { name: 'Search' }).click();
  await page.getByLabel('Search tutors by course or name').fill('Sara');
  await page.getByRole('button', { name: /^Sara W\./ }).first().click();
  await expect(page.getByText('Courses & rates')).toBeVisible();
}

// Sara holds both roles and the seed leaves her in student mode; switch the way a user would.
async function viewAsTutor(page: Page) {
  await page.getByRole('link', { name: 'Profile' }).click();
  const tutorMode = page.getByRole('button', { name: 'View as Tutor' });
  if ((await tutorMode.getAttribute('aria-selected')) !== 'true') await tutorMode.click();
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveURL(/\/tutor_home/);
}

async function payWithTestCard(page: Page) {
  const card = page.frameLocator('iframe[title="Secure payment input frame"]');
  await card.getByPlaceholder('1234 1234 1234 1234').fill('4242424242424242');
  await card.getByPlaceholder('MM / YY').fill('12 / 34');
  await card.getByPlaceholder('CVC').fill('123');
  const zip = card.getByPlaceholder('12345');
  if (await zip.count()) await zip.fill('35401');
  await page.getByRole('button', { name: /^(Pay|Save card)/ }).click();
}

test('sign in opens the app with the laptop side nav', async ({ page }) => {
  await signIn(page, STUDENT);
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sessions' })).toBeVisible();
});

test('search finds a tutor and opens the profile', async ({ page }) => {
  await signIn(page, STUDENT);
  await openSara(page);
  await expect(page.getByText('MGT 300').filter({ visible: true }).first()).toBeVisible();
});

test('book a session, the tutor accepts, and they chat', async ({ page, browser }) => {
  await signIn(page, STUDENT);
  await openSara(page);
  await page.getByRole('button', { name: 'Book a session' }).click();

  await page.getByText('Exam Study', { exact: true }).click();
  // The day row opens on the first day with open times. Take its last open time, furthest from
  // the 2-hour booking cutoff; booked times are labelled "…, booked" so the pattern skips them.
  const slots = page.getByLabel(/^\d{1,2}:\d{2}\s?(AM|PM)( [A-Z]{2,4})?$/i).filter({ visible: true });
  await slots.last().click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();

  await page.getByRole('button', { name: /^(Confirm & pay|Save card & request|Confirm booking)/ }).click();
  if (process.env.E2E_STRIPE === '1') await payWithTestCard(page);
  await expect(page.getByText('Session request sent')).toBeVisible({ timeout: 30_000 });

  // Sara accepts in her own browser; accepting opens the conversation with the student.
  const { baseURL, viewport } = test.info().project.use;
  const tutorContext = await browser.newContext({ baseURL, viewport });
  const tutor = await tutorContext.newPage();
  await signIn(tutor, TUTOR);
  await viewAsTutor(tutor);
  await tutor.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await expect(tutor).toHaveURL(/\/chat_tutor/);

  const hello = `Got your request, see you then (${Date.now()})`;
  await tutor.getByPlaceholder(/^Message /).fill(hello);
  await tutor.getByLabel('Send').filter({ visible: true }).click();
  await onScreen(tutor, hello);

  await page.getByRole('link', { name: 'Chats' }).click();
  await page.getByRole('button', { name: /^Sara/ }).first().click();
  await onScreen(page, hello);
  const reply = `Thanks! (${Date.now()})`;
  await page.getByPlaceholder(/^Message Sara/).fill(reply);
  await page.getByLabel('Send').filter({ visible: true }).click();
  await onScreen(page, reply);

  // Arrives live over Realtime; no reload.
  await onScreen(tutor, reply, 30_000);
  await tutorContext.close();
});
