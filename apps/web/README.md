# @noot/web

Next.js **marketing site** — the public front door (waitlist, how-it-works, app-store
+ web-app links). The full product lives in `@noot/mobile` (React Native Web); this
app is intentionally separate for SEO and a fast landing experience.

```bash
pnpm --filter @noot/web dev     # http://localhost:3000
pnpm --filter @noot/web build
```

Shares brand tokens via `@noot/theme` so the marketing site and app stay visually in sync.
