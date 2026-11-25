const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Server-only folders (Vercel functions, SQL migrations) must never be bundled
// into the client. Patterns are anchored to this project root so that
// similarly named folders inside node_modules are unaffected.
const escapeForRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const serverOnlyDirs = ['api', 'supabase'].map(
  (dir) => new RegExp(`^${escapeForRegExp(path.resolve(__dirname, dir) + path.sep)}.*`)
);

const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  ...serverOnlyDirs,
];

module.exports = withNativeWind(config, { input: './global.css' });
