// Release preflight for the App Store / Play builds.  `pnpm check:release`
//
// Exists because the production EAS profile was an empty object for months: every field it
// needed was present in `development`, so every build anyone actually ran was fine, while a
// real production build would have shipped an app that couldn't reach Supabase at all and
// died on the first query. Nothing catches that class of bug at build time — EAS happily
// builds a config with no env — so it gets caught here instead.
//
// ERRORS block a release. WARNINGS are things that are correct for TestFlight but wrong for
// a public launch (test Stripe keys, placeholder submit credentials).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE = join(ROOT, 'apps/mobile');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const app = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(readFileSync(join(MOBILE, 'eas.json'), 'utf8'));

// ---------- identity / versioning ----------
if (!app.version || app.version === '0.0.0') err(`app.json version is "${app.version}" — set a real version`);
if (!app.ios?.bundleIdentifier) err('app.json ios.bundleIdentifier is missing');
if (!app.android?.package) err('app.json android.package is missing');
if (!app.ios?.buildNumber) err('app.json ios.buildNumber is missing');
if (app.android?.versionCode == null) err('app.json android.versionCode is missing');

// ---------- icons ----------
/** Read width/height/colourType straight out of a PNG IHDR — no image lib needed. */
function png(path) {
  const b = readFileSync(path);
  if (b.length < 26 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}
const iconPath = app.icon && join(MOBILE, app.icon);
if (!iconPath || !existsSync(iconPath)) {
  err('app icon is missing — Apple will not accept a build without one');
} else {
  const i = png(iconPath);
  if (!i) err(`${app.icon} is not a readable PNG`);
  else {
    if (i.width !== 1024 || i.height !== 1024) err(`app icon must be 1024x1024, got ${i.width}x${i.height}`);
    // Colour types 4 and 6 carry an alpha channel. App Store Connect rejects a
    // transparent app icon outright, and it is a silent failure until upload.
    if (i.colorType === 4 || i.colorType === 6) {
      err('app icon has an alpha channel — App Store Connect rejects transparent icons; flatten it');
    }
  }
}
const adaptive = app.android?.adaptiveIcon?.foregroundImage;
if (!adaptive || !existsSync(join(MOBILE, adaptive))) warn('android adaptiveIcon.foregroundImage is missing');

// ---------- build profiles ----------
const REQUIRED_ENV = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY',
];
for (const profile of ['preview', 'production']) {
  const env = eas.build?.[profile]?.env;
  if (!env) {
    err(`eas.json build.${profile} has no env — the app cannot reach Supabase and dies on first query`);
    continue;
  }
  for (const k of REQUIRED_ENV) if (!env[k]) err(`eas.json build.${profile}.env is missing ${k}`);
}

// ---------- go-live switches ----------
const prodEnv = eas.build?.production?.env ?? {};
if (prodEnv.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_')) {
  warn('production is using a Stripe TEST key — fine for TestFlight, must be pk_live_ before public launch');
}
if (prodEnv.EXPO_PUBLIC_SUPABASE_URL?.includes('127.0.0.1') || prodEnv.EXPO_PUBLIC_SUPABASE_URL?.includes('localhost')) {
  err('production EXPO_PUBLIC_SUPABASE_URL points at localhost');
}
const submit = eas.submit?.production?.ios ?? {};
const placeholders = Object.entries(submit).filter(([, v]) => String(v).startsWith('REPLACE_'));
if (!Object.keys(submit).length) warn('eas.json submit.production.ios is empty — `eas submit` will prompt for credentials');
else if (placeholders.length) {
  warn(`eas.json submit.production.ios still has placeholders: ${placeholders.map(([k]) => k).join(', ')}`);
}

// ---------- permissions hygiene ----------
// Declaring a permission the app never exercises invites a review question on iOS and a
// data-safety mismatch on Play. expo-image-picker's plugin adds CAMERA + RECORD_AUDIO
// (and the matching iOS usage strings) unless they are explicitly disabled — so removing
// them from app.json alone does nothing.
const androidPerms = app.android?.permissions ?? [];
for (const p of ['android.permission.RECORD_AUDIO', 'android.permission.CAMERA']) {
  if (androidPerms.includes(p)) err(`${p} is declared but the app never uses it — remove it`);
}
const picker = (app.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
if (picker) {
  const opts = picker[1] ?? {};
  if (opts.cameraPermission !== false) {
    err('expo-image-picker: set "cameraPermission": false — the plugin otherwise adds CAMERA + NSCameraUsageDescription for a camera the app never opens');
  }
  if (opts.microphonePermission !== false) {
    err('expo-image-picker: set "microphonePermission": false — the plugin otherwise adds RECORD_AUDIO + NSMicrophoneUsageDescription');
  }
}
if (!app.ios?.infoPlist?.NSPhotoLibraryUsageDescription) {
  err('ios.infoPlist.NSPhotoLibraryUsageDescription is missing — the app reads the photo library');
}

// ---------- report ----------
for (const w of warnings) console.log(`⚠️  ${w}`);
for (const e of errors) console.log(`❌ ${e}`);
if (!errors.length && !warnings.length) console.log('✅ Release preflight OK.');
else if (!errors.length) console.log(`\n✅ No blockers. ${warnings.length} warning(s) to clear before public launch.`);
else console.log(`\n❌ ${errors.length} blocker(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
