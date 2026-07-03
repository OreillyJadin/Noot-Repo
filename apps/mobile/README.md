# @noot/mobile

Expo app → **iOS, Android, and the web app** (React Native Web) from one codebase.

```bash
pnpm --filter @noot/mobile dev      # dev server (press i / a / w)
pnpm --filter @noot/mobile ios
pnpm --filter @noot/mobile android
pnpm --filter @noot/mobile web
pnpm --filter @noot/mobile build:web
```

- Routing: **expo-router** (`app/`). Route files map to the handoff's screen keys
  (`design_handoff_noot_app/app/screens-map.jsx`).
- Theme + components come from `@noot/ui` / `@noot/theme`; data/auth from `@noot/core`.
- Copy `.env.example` → `.env` and fill in Supabase public keys.
- Native modules (e.g. future in-app video) require an **EAS dev build**, not Expo Go
  (ARCHITECTURE.md §9).
