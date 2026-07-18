// The Noot gecko mark. Thin re-export of @noot/ui's GeckoMark so the brand graphic has a
// single source of truth (packages/ui/assets/gecko-sage.png) — swapping in Jake's
// approved asset is a one-file change there. Kept as `GeckoLogo` so existing screen
// imports stay stable.
export { GeckoMark as GeckoLogo, type GeckoMarkProps as GeckoLogoProps } from '@noot/ui';
