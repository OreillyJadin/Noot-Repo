// Metro config for an Expo app inside a pnpm monorepo.
// SDK 55+ resolves workspace packages and monorepo node_modules on its own
// (expo.experiments.autolinkingModuleResolution is on by default), so the old
// watchFolders / nodeModulesPaths / disableHierarchicalLookup overrides we
// carried through SDK 54 are gone — expo-doctor flags them as harmful now.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
