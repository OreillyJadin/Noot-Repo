// The version shown at the bottom of the profile screens: "v0.8" for build 8.
//
// The store version stays 1.0.0 through App Review and every resubmission is just a new
// build number, so the build number is the only thing that tells two TestFlight builds
// apart — which is what a tester needs to quote in a bug report. EAS bumps
// ios.buildNumber in app.json for each production build (autoIncrement) and the app config
// is embedded at build time, so this always shows the build that is actually installed.
// Pure — the screens pass in Constants.expoConfig?.ios?.buildNumber.

/** "8" → "v0.8". An unknown build (no config, e.g. a web preview) reads "v0.dev". */
export function versionLabel(buildNumber: string | null | undefined): string {
  const build = (buildNumber ?? '').trim();
  return `v0.${build || 'dev'}`;
}
