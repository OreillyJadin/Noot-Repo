# Web app at app.trynoot.com + trynoot.com branding

Everything needed to put the web app on `app.trynoot.com` and finish the brand alignment with
Jacob's trynoot.com. Hosting basics (Cloudflare Pages project, env vars) are in
`docs/WEB_HOSTING.md`; this file covers the custom domain and what's left on branding.

## The plan

- **`trynoot.com`** stays Jacob's WordPress marketing site (Astra + Elementor). Jacob owns it.
- **`app.trynoot.com`** serves the web app: `apps/mobile` exported with React Native Web, the
  same code, accounts and data as the phone app.
- **No new domain to buy.** `app.trynoot.com` is a subdomain of the domain we already own.
- WordPress's "Log in" / "Sign up" buttons link to the app.

## Who runs what (checked 2026-11-05)

| Thing | Where |
|---|---|
| Registrar | DomainRegistry.com LLC |
| DNS (nameservers) | `ns1.hosting.businessidentity.llc`, `ns2.hosting.businessidentity.llc`, the WordPress host's panel (whoever set up the site, probably Jacob, has the login) |
| Website | WordPress on `66.223.49.89` |
| Email | MX `mailserver.businessidentity.llc`, SPF `v=spf1 a mx include:spf.postal.businessidentity.llc ~all` |

Every subdomain currently falls through to the WordPress IP (`app.trynoot.com` → `66.223.49.89`),
so the `app` record below overrides that for `app` only.

**Do not change the MX or TXT records.** Sign-up and password emails go out through that
provider.

## Launch checklist

Do these in order. Steps 1–2 are in `docs/WEB_HOSTING.md`.

1. **Cloudflare Pages project:** create it and set its env vars (`docs/WEB_HOSTING.md` → Steps
   for Jadin). Note its address, e.g. `noot-app.pages.dev`.
2. **Supabase redirect for the Pages address:** `https://<name>.pages.dev/**`
   (`docs/WEB_HOSTING.md`).
3. **Custom domain in Pages:** Cloudflare → Workers & Pages → the project → **Custom domains** →
   **Set up a custom domain** → `app.trynoot.com`. Because DNS isn't on Cloudflare, it shows the
   CNAME to add. Keep that tab open.
4. **DNS record:** in the businessidentity hosting panel → DNS for `trynoot.com`, add:

   | Type | Name | Target / value | TTL |
   |---|---|---|---|
   | CNAME | `app` | `<name>.pages.dev` (exactly what step 3 shows) | default / 3600 |

   If the panel already has an `app` A record or a `*` wildcard, the explicit `app` CNAME wins
   for `app`. Delete an existing `app` A record only if it exists.
5. **Wait for Pages to verify:** back in Cloudflare, the domain turns **Active** and gets HTTPS,
   usually within minutes and up to a day. Check:
   ```bash
   dig +short app.trynoot.com CNAME    # → <name>.pages.dev.
   curl -sI https://app.trynoot.com | head -1   # → HTTP/2 200
   ```
6. **Supabase redirect for the domain:** Dashboard → production project
   (`nepnxbvseuzuayhxaigo`) → **Authentication** → **URL Configuration** → **Redirect URLs** →
   add `https://app.trynoot.com/**`. Keep `noot://**` and the `trynoot.com` entries. Leave
   **Site URL** as `https://trynoot.com`.
7. **Repo follow-up PR (a session can do it):**
   - Add `"https://app.trynoot.com", "https://app.trynoot.com/**"` to
     `additional_redirect_urls` in `supabase/config.toml`, so the code mirrors the dashboard.
   - Point any "open the web app" links and emails at `https://app.trynoot.com`.
   - Update `docs/WEB_HOSTING.md` and `docs/OPEN_ITEMS.md`.
8. **WordPress buttons (Jacob):** link "Log in" → `https://app.trynoot.com/signin` and
   "Sign up" / "Book a tutor" → `https://app.trynoot.com/signup`. Keep the App Store and Play
   links as they are.
9. **Stripe payment method domains (only for Apple Pay / Google Pay / Link on the web):** Stripe
   Dashboard → **Settings** → **Payment method domains** → add `app.trynoot.com` in **both** live
   and test mode. Card payments work without this.
10. **Smoke test on the real domain:** sign up, open the email link, search, book, chat, and open
    a video call. Also do one live sign-in on a phone with the same account to confirm the two
    are interchangeable.

## Stripe test key for web (still needed)

The `preview`/`development` profiles in `apps/mobile/eas.json` use a `pk_test_51Tq3Mg…` key
from a separate Stripe sandbox. The backend's test secret key is from the **main** Noot
account, and Stripe rejects a payment when the two keys come from different accounts. So:

- Get the main account's test publishable key: Stripe Dashboard → Test mode → Developers →
  API keys → the one starting `pk_test_51Tq3MW…`. It isn't secret.
- Use it for the Pages **Preview** environment's `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and for a
  real 4242 test-card payment on the website.
- Production uses the live `pk_live_51Tq3MW…` key already in the `production` profile.

## Branding

### What came from trynoot.com (shipped in PR #202)

- **Colors** (`packages/theme/src/index.ts`, `sage` direction):
  - sage `#7EA072`: `accent`
  - charcoal `#2D342E`: `text`; borders are charcoal at 12% / 24%
  - sand `#D7C5A2`: the site's download band; not used in the app yet
- **Buttons:** pills (`btnRadius: '999px'`).
- **Heading font:** family names `NootHeading-Bold` / `NootHeading-SemiBold` (tokens
  `HEADING_FONT`, `HEADING_FONT_SEMIBOLD`; `t.headingFont`, `t.headingFontSemi`). Loaded in
  `apps/mobile/app/_layout.tsx`. Body text stays on the system font (`BODY_FONT`).
- **Wordmark + gecko:** `packages/ui/src/Brand.tsx` and the gecko icon, already in the app.

### Branding decision (2026-11-05, Jadin and Jacob)

- App headings use **Montserrat** under the SIL Open Font License. The system font remains in
  use for body text (SF Pro on iOS).
- The app wordmark is Jacob's Marble-made PNG from trynoot.com. His Envato Elements license
  covers its use as a logo.
- Do not bundle Marble `.ttf` or `.otf` files. Envato's terms prohibit incorporating or
  distributing the font within an End Product.
- Using Marble for live text would require an app-embedding license purchased directly from
  its author, Umitype.
- To change the wordmark, replace `packages/ui/assets/noot-wordmark.png`.

### Optional later

- Use sand `#D7C5A2` for a band or highlight surface, if Jacob wants it in the app.
- Retiring `apps/web` (the Next.js marketing site in the repo, which isn't what trynoot.com
  serves) is a separate decision.
