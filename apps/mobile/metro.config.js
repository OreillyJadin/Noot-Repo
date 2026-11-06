// Metro config for an Expo app inside a pnpm monorepo.
// SDK 55+ resolves workspace packages and monorepo node_modules on its own
// (expo.experiments.autolinkingModuleResolution is on by default), so the old
// watchFolders / nodeModulesPaths / disableHierarchicalLookup overrides we
// carried through SDK 54 are gone — expo-doctor flags them as harmful now.
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// Web only: native-only packages that can't bundle for react-native-web are swapped for
// stand-ins in ./web. iOS and Android resolve the real packages, untouched.
const WEB_SHIMS = {
  '@stripe/stripe-react-native': path.resolve(__dirname, 'web/stripe-react-native.tsx'),
  'react-native-keyboard-controller': path.resolve(__dirname, 'web/keyboard-controller.tsx'),
  'expo-web-browser': path.resolve(__dirname, 'web/expo-web-browser.ts'),
};

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && WEB_SHIMS[moduleName]) {
    return { type: 'sourceFile', filePath: WEB_SHIMS[moduleName] };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
