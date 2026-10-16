// Metro config for an Expo app inside a pnpm monorepo.
// SDK 55+ resolves workspace packages and monorepo node_modules on its own
// (expo.experiments.autolinkingModuleResolution is on by default), so the old
// watchFolders / nodeModulesPaths / disableHierarchicalLookup overrides we
// carried through SDK 54 are gone — expo-doctor flags them as harmful now.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
