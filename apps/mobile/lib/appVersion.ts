// The version shown at the bottom of the profile screens: "v0.8" for build 8.
//
// The store version stays 1.0.0 through App Review and every resubmission is just a new
// build number, so the build number is the only thing that tells two TestFlight builds
// apart — which is what a tester needs to quote in a bug report.
//
// Pure — the screens pass in the installed binary's own build number
// (Constants.platform.ios.buildNumber, read from the app's Info.plist: the number TestFlight
// shows), falling back to the one in the app config where there is no binary of ours
// (Expo Go).

/** "8" → "v0.8". An unknown build (no config, e.g. a web preview) reads "v0.dev". */
export function versionLabel(buildNumber: string | null | undefined): string {
  const build = (buildNumber ?? '').trim();
  return `v0.${build || 'dev'}`;
}
