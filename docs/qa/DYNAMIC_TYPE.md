# Large text (Dynamic Type / Android font size)

Fix for IOS-2 (see [DEFECT_REGISTER.md](DEFECT_REGISTER.md)). Text scales with the OS setting everywhere in the
mobile app; font scaling is **not** disabled globally. Layouts that can't hold large text side by side
reflow instead, and a few slots whose width is fixed by design get a font-size cap.

## How it works

Both helpers live in `packages/ui/src/textScale.ts` and are exported from `@noot/ui`.

- **`useLargeText()`** is true when the OS font scale is at least **`LARGE_TEXT_SCALE = 1.4`**.
  Below that the app looks exactly as it does at the default size. At or above it:
  - `AdaptiveRow` (in `Layout.tsx`) stacks its children vertically: button pairs, dashboard stat cards,
    "next session" rows.
  - `NavTop` wraps its title to two lines once text is enlarged at all (three at large sizes) instead of truncating it, and widens its side controls at large sizes.
  - `Button` grows taller and tightens its side padding; labels wrap instead of truncating.
  - `RoleSwitcher` shows one role per line; admin headers (`AdminLargeHeader`) stack the trailing
    actions under the title; `AdminRow` titles/subtitles wrap.
  - Screen-specific reflows: admin Users role filters wrap and Status drops below them; the
    student Search and admin Users search fields use a short "Search" placeholder; tutor calendar open-slot
    times sit above the slot instead of in a fixed 60 pt column.
- Always on (no visual change at the default size): `Chip` uses `minHeight` instead of a fixed
  height, chip/tag/link rows use `flexWrap`, long meta text shrinks and wraps.

## Caps (`TEXT_CAPS`, used as `maxFontSizeMultiplier`)

| Key | Value | Where | Why |
|---|---|---|---|
| `tabLabel` | 1.3 | `TabBar` labels | Five equal-width cells across the screen. Past 1.3× "Sessions", "Calendar" and "Referrals" split mid-word. The label also shrinks to fit (`minimumFontScale` 0.75). Icons and accessibility labels are unaffected. |
| `screenTitle` | 1.6 | `H1`, `NavTop` title, `AdminLargeHeader` title | A single long word ("Notifications", "Applications") at the 34 pt title size otherwise breaks mid-word at AX sizes. 1.6× is still far larger than the default. |
| `heading` | 2 | `H2` | Section headings stay readable without dominating the screen. |
| `label` | 1.8 | Profile row labels and subtitles, `AdminRow` titles, tutor Sessions segment labels (which also shrink to fit), tutor Home quick actions, tutor-row "year · major" lines | Labels that are often one long word ("Notifications", "Applications", "Upcoming") beside an icon or chevron. iOS AX-XXXL is about 3.1×, so without the cap a single word wider than the row breaks mid-word. |
| `cell` | 1.4 | Tutor calendar week-strip day labels, admin calendar month-grid day numbers (which also shrink to fit), profile stat labels, `Avatar` initials | Fixed-width cells (seven days across, three stats across) and fixed-size avatar circles. |

Body text, list rows, buttons, chips, inputs and everything else scale without a cap.

One exception sizes itself: the ambassador invite code (`InviteView`). On Android a scaled,
`adjustsFontSizeToFit` code rendered blank at large text, so at large sizes it turns off system
scaling and sets its own size: the font scale capped at `label` (1.8×), shrunk further to fit the
measured card width. It still grows with the user's setting up to that cap.

## Testing

Android emulator:

```
adb shell settings put system font_scale 2.6
adb shell wm density 540
```

Settings tops out at 2.0, but iPhone AX-XXXL renders larger (about 3.1×), so set 2.6 over adb to be
conservative. 540 is the largest Settings → Display size on the Pixel 6 image. Reset with
`adb shell settings put system font_scale 1.0` and `adb shell wm density reset`, then restart Expo Go.

iPhone simulator: Settings → Accessibility → Display & Text Size → Larger Text → turn on Larger
Accessibility Sizes and drag the slider to the right end (AX-XXXL); or in Xcode, Environment Overrides →
Text → Dynamic Type → AX 5.

Screens to check per role (every tab root):

- Student: Home, Search, Sessions, Chats, Profile
- Tutor: Home, Calendar, Sessions, Chats, Profile
- Ambassador: Home, Referrals, Profile
- Admin: Hub, Calendar, Users

On each: no word split mid-word, nothing clipped or overlapping (including the floating settings
button), chips and buttons show their whole label, tab bar labels readable.
