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

// ---------- iOS purpose strings ----------
// Apple's binary scan (error 90683) requires a purpose string for every sensitive API
// referenced by ANY linked code — ours or a dependency's — even if the app never calls it.
// We originally REMOVED the camera/microphone strings because noot only reads the photo
// library, and the upload was rejected for it. Privacy hygiene and Apple's static analysis
// want opposite things here, and Apple wins: declare the string on iOS, and keep Android
// clean separately via android.blockedPermissions.
const REQUIRED_IOS_STRINGS = [
  'NSPhotoLibraryUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSFaceIDUsageDescription',
];
const info = app.ios?.infoPlist ?? {};
for (const k of REQUIRED_IOS_STRINGS) {
  if (!info[k] || String(info[k]).trim().length < 10) {
    err(`ios.infoPlist.${k} is missing or too short — Apple rejects the upload with 90683`);
  }
}
// A `false` here deletes the key the plugin would otherwise write, which is what caused the
// 90683 rejection. It must be a string.
const picker = (app.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'expo-image-picker');
if (picker) {
  for (const prop of ['cameraPermission', 'microphonePermission', 'photosPermission']) {
    if ((picker[1] ?? {})[prop] === false) {
      err(`expo-image-picker: "${prop}": false removes the iOS purpose string and triggers Apple 90683 — use a string`);
    }
  }
}

// ---------- Android permission hygiene ----------
// Declaring a permission the app never exercises is a Play data-safety mismatch. Since the
// iOS strings now force the picker plugin to add CAMERA/RECORD_AUDIO on Android, they have to
// be blocked explicitly rather than simply not requested.
const blocked = app.android?.blockedPermissions ?? [];
for (const p of ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO']) {
  if (!blocked.includes(p)) {
    warn(`android.blockedPermissions is missing ${p} — the picker plugin adds it, and the app never uses it`);
  }
}

// ---------- privacy manifest ----------
// ITMS-91053 "Missing API declaration" is the most common post-upload rejection email for
// React Native apps: RN core reads file timestamps, UserDefaults, disk space and boot time,
// and each needs a declared reason code.
const declared = (app.ios?.privacyManifests?.NSPrivacyAccessedAPITypes ?? [])
  .map((e) => e.NSPrivacyAccessedAPIType);
for (const cat of [
  'NSPrivacyAccessedAPICategoryFileTimestamp',
  'NSPrivacyAccessedAPICategoryUserDefaults',
  'NSPrivacyAccessedAPICategoryDiskSpace',
  'NSPrivacyAccessedAPICategorySystemBootTime',
]) {
  if (!declared.includes(cat)) {
    warn(`ios.privacyManifests is missing ${cat} — expect an ITMS-91053 email after upload`);
  }
}

// Avoids the manual export-compliance question on every single upload.
if (app.ios?.infoPlist?.ITSAppUsesNonExemptEncryption !== false) {
  warn('ios.infoPlist.ITSAppUsesNonExemptEncryption is not false — you will be asked the export compliance question on every upload');
}

// ---------- report ----------
for (const w of warnings) console.log(`⚠️  ${w}`);
for (const e of errors) console.log(`❌ ${e}`);
if (!errors.length && !warnings.length) console.log('✅ Release preflight OK.');
else if (!errors.length) console.log(`\n✅ No blockers. ${warnings.length} warning(s) to clear before public launch.`);
else console.log(`\n❌ ${errors.length} blocker(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
