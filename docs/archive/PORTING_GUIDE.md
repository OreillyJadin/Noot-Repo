# Screen Porting Guide (for sub-agents)

You are porting ONE prototype screen file from the design handoff into the real
React Native app. The prototype is **browser React**; you translate it to **React
Native + expo-router**, faithfully preserving layout, copy, and behavior.

## Ground rules
- **Only create route files** under `apps/mobile/app/<key>.tsx` for the keys you're
  assigned. Do NOT edit `@noot/ui`, `lib/`, other screens, or config.
- Every file must **typecheck** (strict TS) and use **only** `@noot/ui`, React Native,
  expo-router, and `lib/`. No `<div>`, no CSS, no `window.*`, no web-only APIs.
- Match the source's copy, structure, and interactions. Simplify only what can't
  translate (e.g. CSS gradients → a solid `surfaceAlt` background; drop hover).

## The exemplar
Read these already-ported screens and copy their style exactly:
- `apps/mobile/app/index.tsx`, `signup.tsx`, `verified.tsx`, `role.tsx`

## Navigation contract
- Route file path = `apps/mobile/app/<key>.tsx`; default-export the component.
- `go('<key>')` → `const router = useRouter(); router.push('/<key>')`
- `back()` → `router.back()`
- A screen that lands on a tab root → `router.replace('/<key>')`
- Read the screen keys + their outbound `to:` targets from
  `design_handoff_noot_app/app/screens-map.jsx` (window.SCREENS).

## State & data
- `import { useApp } from '../lib/store'` → `{ role, setRole, booking, setBooking, patchBooking }`.
  The booking flow builds up `booking` across b3→b4→b5.
- `import { TUTORS, tutorById, reviewsFor, DAYS, slotsFor, REVIEWS_POOL } from '../lib/data'`.
- No Supabase yet. Backend-only actions (the prototype's `showToast`) → a no-op or a
  simple `Alert.alert(...)` / local state; leave a `// TODO(api)` comment.

## Translation cheat-sheet
| Prototype (web) | React Native |
|---|---|
| `<div>` / `<span>` | `<View>` / `<Text>` (all text MUST be inside `<Text>`) |
| `style={{…}}` + `var(--token)` | `StyleSheet.create` + `useTheme()` tokens |
| `<Screen>` `<Body>` `<NavTop>` `<ActionBar>` | same names from `@noot/ui` |
| `<Btn kind onClick>` | `<Button kind onPress>` from `@noot/ui` |
| `<Ic name=.. stroke="var(--x)">` | `<Ic name=.. color={t.x}>` |
| `onClick` | `onPress` |
| `overflowY:auto` | use `<Body>` (it's a ScrollView) |
| flex row `display:'flex'` | `flexDirection:'row'` (RN defaults to column) |

## @noot/ui API (import from '@noot/ui')
- `useTheme()` → tokens: `bg, surface, surface2, surfaceAlt, text, text2, text3,
  border, borderStrong, accent, accentPress, accentWeak, accentBorder, onAccent,
  good, goodWeak`.
- `<Screen>`, `<NavTop title onBack trailing>`, `<Body pad contentStyle>`, `<ActionBar>`
- `<Button label onPress kind={'primary'|'secondary'|'tint'|'ghost'|'dark'} size={'lg'|'md'|'sm'} full iconRight disabled>`
- `<Card onPress selected flat style>`, `<Field label placeholder value onChangeText keyboardType multiline hint prefix suffix>`
- `<Select label value options onChange>`, `<Chip label on tint onPress>`, `<Badge label tone>`, `<Avatar size label accent>`, `<Toggle on onPress>`
- `<H1> <H2> <Eyebrow> <Sub> <Muted> <Label>` (children = string), `<Divider>`, `<ProgressDots total current>`, `<Stepper n active done>`
- `<Ic name color size strokeWidth>` — names are in `packages/ui/src/Icon.tsx` ICONS
- `<Wordmark>`, `<HeroIcon name size>`, `<TabBar active onTab role>`

## Screen shell pattern
```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, H1, Sub, useTheme } from '@noot/ui';

export default function B2() {
  const t = useTheme();
  const router = useRouter();
  return (
    <Screen>
      <NavTop title="Tutor Profile" onBack={() => router.back()} />
      <Body>
        {/* ...ported content, styled with t.* tokens... */}
      </Body>
      <ActionBar>
        <Button label="Book a session" full onPress={() => router.push('/b3')} />
      </ActionBar>
    </Screen>
  );
}
```

## Done = 
Every assigned key has a route file, faithful to the source, using the kit + tokens,
and it would typecheck. Report the list of files you created.
