#!/usr/bin/env node
/**
 * DocuDash Android APK Release Signing Automation
 *
 * 1. Checks for existing signing credentials (`DOCUDASH_UPLOAD_*` env vars or
 *    `credentials/keystore.properties` + keystore file).
 * 2. If missing (and neither partial file exists), automatically generates a
 *    new PKCS12 release keystore (`credentials/docudash-release.jks`) and
 *    `credentials/keystore.properties`.
 * 3. Builds the Android release APK via Gradle (or signs an existing APK via
 *    `zipalign` + `apksigner`) and verifies the final signature.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CREDENTIALS_DIR = path.join(ROOT_DIR, 'credentials');
const DEFAULT_KEYSTORE_PATH = path.join(CREDENTIALS_DIR, 'docudash-release.jks');
const DEFAULT_PROPS_PATH = path.join(CREDENTIALS_DIR, 'keystore.properties');
const DEFAULT_KEY_ALIAS = 'docudash-release';
const DEFAULT_DNAME =
  'CN=DocuDash, OU=DocuDash Mobile, O=DocuDash, L=Manila, ST=Metro Manila, C=PH';
const DEFAULT_RELEASE_APK = path.join(
  ROOT_DIR,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk'
);
const DEFAULT_UNSIGNED_APK = path.join(
  ROOT_DIR,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release-unsigned.apk'
);

const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789_-';

function printHelp() {
  console.log(`DocuDash Android APK Signing Utility

Usage:
  node scripts/sign-apk.mjs [options]

Options:
  --setup-only        Check or generate release keystore & keystore.properties, then exit.
  --sign-only         Skip Gradle build and sign an existing APK using zipalign + apksigner.
  --apk <path>        Input APK path (defaults to release app-release-unsigned.apk or app-release.apk).
  --out <path>        Output signed APK path (defaults to <input>-signed.apk when --sign-only).
  --prebuild          Run "npx expo prebuild --platform android --clean" before Gradle build.
  --dname "<DN>"      Custom X.509 certificate subject when generating a new keystore.
  -h, --help          Show this help message.

Npm shortcuts:
  npm run android:signing-setup   Generate/verify signing credentials only
  npm run android:sign-apk        Sign an already-built APK with existing/generated credentials
  npm run android:release         Ensure credentials, build release APK, and verify signature
`);
}

function parseArgs(argv) {
  const opts = {
    setupOnly: false,
    signOnly: false,
    build: false,
    prebuild: false,
    apkPath: null,
    outPath: null,
    dname: DEFAULT_DNAME,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--setup-only':
        opts.setupOnly = true;
        break;
      case '--sign-only':
        opts.signOnly = true;
        break;
      case '--build':
        opts.build = true;
        break;
      case '--prebuild':
        opts.prebuild = true;
        break;
      case '--apk': {
        const next = argv[++i];
        if (!next) throw new Error('--apk requires a file path.');
        opts.apkPath = path.resolve(ROOT_DIR, next);
        break;
      }
      case '--out': {
        const next = argv[++i];
        if (!next) throw new Error('--out requires a file path.');
        opts.outPath = path.resolve(ROOT_DIR, next);
        break;
      }
      case '--dname': {
        const next = argv[++i];
        if (!next) throw new Error('--dname requires an X.509 Distinguished Name string.');
        opts.dname = next;
        break;
      }
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (opts.apkPath && !opts.build) {
    opts.signOnly = true;
  }

  return opts;
}

function isWindows() {
  return process.platform === 'win32';
}

function runProcess(exe, args, options = {}) {
  const useCmdWrapper = isWindows() && /\.(bat|cmd)$/i.test(exe);
  const command = useCmdWrapper ? 'cmd.exe' : exe;
  const finalArgs = useCmdWrapper ? ['/d', '/c', exe, ...args] : args;

  return spawnSync(command, finalArgs, {
    cwd: options.cwd ?? ROOT_DIR,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'pipe',
    encoding: 'utf8',
  });
}

function runOrThrow(exe, args, label, options = {}) {
  const result = runProcess(exe, args, options);
  if (result.error) {
    throw new Error(`${label} failed to launch: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(
      `${label} exited with code ${result.status}${details ? `:\n${details}` : '.'}`
    );
  }
  return result;
}

function generateStrongPassword(length = 24) {
  const bytes = randomBytes(length);
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return output;
}

function parsePropertiesFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const map = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const eqIndex = line.indexOf('=');
    const colonIndex = line.indexOf(':');
    let sepIndex = -1;
    if (eqIndex >= 0 && colonIndex >= 0) {
      sepIndex = Math.min(eqIndex, colonIndex);
    } else {
      sepIndex = Math.max(eqIndex, colonIndex);
    }
    if (sepIndex <= 0) continue;
    const key = line.slice(0, sepIndex).trim();
    const value = line.slice(sepIndex + 1).trim();
    map[key] = value;
  }
  return map;
}

function resolveKeystoreFile(rawPath) {
  if (!rawPath) return null;
  const fromRoot = path.resolve(ROOT_DIR, rawPath);
  if (fs.existsSync(fromRoot)) return fromRoot;
  if (path.isAbsolute(rawPath) && fs.existsSync(rawPath)) return rawPath;
  return fromRoot;
}

function findExecutableOnPath(names) {
  const pathEnv = process.env.PATH ?? '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function findKeytool() {
  const names = isWindows() ? ['keytool.exe', 'keytool'] : ['keytool'];

  if (process.env.JAVA_HOME) {
    for (const name of names) {
      const candidate = path.join(process.env.JAVA_HOME, 'bin', name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  const fromPath = findExecutableOnPath(names);
  if (fromPath) return fromPath;

  const extraCandidates = isWindows()
    ? [
        'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\keytool.exe',
        'C:\\Program Files\\Microsoft\\jdk-17.0.14.7-hotspot\\bin\\keytool.exe',
      ]
    : ['/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool'];

  for (const candidate of extraCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  if (isWindows()) {
    for (const base of [
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
    ]) {
      if (!fs.existsSync(base)) continue;
      for (const entry of fs.readdirSync(base)) {
        const candidate = path.join(base, entry, 'bin', 'keytool.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  return null;
}

function findAndroidSdkDir() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWindows() ? path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : null,
    !isWindows() ? path.join(os.homedir(), 'Android', 'Sdk') : null,
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Android', 'sdk')
      : null,
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return null;
}

function compareSemverDesc(a, b) {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const maxLen = Math.max(pa.length, pb.length);
  for (let i = 0; i < maxLen; i += 1) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function findBuildToolsExecutable(toolBaseName) {
  const candidates = isWindows()
    ? [`${toolBaseName}.bat`, `${toolBaseName}.exe`, toolBaseName]
    : [toolBaseName];

  const sdkDir = findAndroidSdkDir();
  if (sdkDir) {
    const buildToolsDir = path.join(sdkDir, 'build-tools');
    if (fs.existsSync(buildToolsDir)) {
      const versions = fs
        .readdirSync(buildToolsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort(compareSemverDesc);

      for (const ver of versions) {
        for (const name of candidates) {
          const full = path.join(buildToolsDir, ver, name);
          if (fs.existsSync(full)) return full;
        }
      }
    }
  }

  return findExecutableOnPath(candidates);
}

/**
 * Resolves existing release signing credentials from environment variables or
 * `credentials/keystore.properties`, or generates fresh release credentials if
 * none exist yet. Never overwrites a partial credential setup.
 */
function ensureSigningCredentials(dname) {
  const envStore = process.env.DOCUDASH_UPLOAD_STORE_FILE?.trim();
  const envStorePass = process.env.DOCUDASH_UPLOAD_STORE_PASSWORD?.trim();
  const envAlias = process.env.DOCUDASH_UPLOAD_KEY_ALIAS?.trim();
  const envKeyPass = process.env.DOCUDASH_UPLOAD_KEY_PASSWORD?.trim();

  if (envStore && envStorePass && envAlias && envKeyPass) {
    const resolvedEnvStore = resolveKeystoreFile(envStore);
    if (!resolvedEnvStore || !fs.existsSync(resolvedEnvStore)) {
      throw new Error(
        `DOCUDASH_UPLOAD_STORE_FILE is set (${envStore}), but the keystore file does not exist.`
      );
    }
    console.log(
      `[DocuDash Signing] Found credentials in environment variables (${path.relative(ROOT_DIR, resolvedEnvStore)}, alias "${envAlias}").`
    );
    return {
      source: 'env',
      storeFile: resolvedEnvStore,
      storePassword: envStorePass,
      keyAlias: envAlias,
      keyPassword: envKeyPass,
      generated: false,
    };
  }

  const propsExists = fs.existsSync(DEFAULT_PROPS_PATH);
  const defaultKeystoreExists = fs.existsSync(DEFAULT_KEYSTORE_PATH);

  if (propsExists) {
    const props = parsePropertiesFile(DEFAULT_PROPS_PATH);
    const storeRaw = props.DOCUDASH_UPLOAD_STORE_FILE;
    const storePassword = props.DOCUDASH_UPLOAD_STORE_PASSWORD;
    const keyAlias = props.DOCUDASH_UPLOAD_KEY_ALIAS;
    const keyPassword = props.DOCUDASH_UPLOAD_KEY_PASSWORD;

    if (!storeRaw || !storePassword || !keyAlias || !keyPassword) {
      throw new Error(
        `Existing ${path.relative(ROOT_DIR, DEFAULT_PROPS_PATH)} is missing one or more DOCUDASH_UPLOAD_* keys. Fix it manually or remove partial credentials before regenerating.`
      );
    }

    const storeFile = resolveKeystoreFile(storeRaw);
    if (!storeFile || !fs.existsSync(storeFile)) {
      throw new Error(
        `${path.relative(ROOT_DIR, DEFAULT_PROPS_PATH)} references missing keystore "${storeRaw}". Restore that file before signing.`
      );
    }

    console.log(
      `[DocuDash Signing] Found existing credentials (${path.relative(ROOT_DIR, storeFile)}, alias "${keyAlias}").`
    );
    return {
      source: 'properties',
      storeFile,
      storePassword,
      keyAlias,
      keyPassword,
      generated: false,
    };
  }

  if (defaultKeystoreExists) {
    throw new Error(
      `Found existing keystore at ${path.relative(ROOT_DIR, DEFAULT_KEYSTORE_PATH)}, but ${path.relative(ROOT_DIR, DEFAULT_PROPS_PATH)} is missing. Refusing to overwrite existing keystore.`
    );
  }

  const keytool = findKeytool();
  if (!keytool) {
    throw new Error(
      'Unable to locate "keytool" (JDK or Android Studio JBR). Set JAVA_HOME or add keytool to PATH and re-run.'
    );
  }

  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  const generatedPassword = generateStrongPassword(24);
  const relativeKeystore = 'credentials/docudash-release.jks';

  console.log(
    `[DocuDash Signing] No release keystore found. Generating ${relativeKeystore} via keytool...`
  );

  runOrThrow(
    keytool,
    [
      '-genkeypair',
      '-v',
      '-storetype',
      'PKCS12',
      '-keystore',
      DEFAULT_KEYSTORE_PATH,
      '-alias',
      DEFAULT_KEY_ALIAS,
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-dname',
      dname,
      '-storepass:env',
      'DOCUDASH_GEN_STORE_PASS',
      '-keypass:env',
      'DOCUDASH_GEN_KEY_PASS',
    ],
    'keytool -genkeypair',
    {
      env: {
        ...process.env,
        DOCUDASH_GEN_STORE_PASS: generatedPassword,
        DOCUDASH_GEN_KEY_PASS: generatedPassword,
      },
    }
  );

  const propsBody = [
    '# Auto-generated DocuDash Android release signing credentials (gitignored)',
    `DOCUDASH_UPLOAD_STORE_FILE=${relativeKeystore}`,
    `DOCUDASH_UPLOAD_STORE_PASSWORD=${generatedPassword}`,
    `DOCUDASH_UPLOAD_KEY_ALIAS=${DEFAULT_KEY_ALIAS}`,
    `DOCUDASH_UPLOAD_KEY_PASSWORD=${generatedPassword}`,
    '',
  ].join('\n');

  fs.writeFileSync(DEFAULT_PROPS_PATH, propsBody, { encoding: 'utf8', mode: 0o600 });

  console.log(
    `[DocuDash Signing] Generated ${relativeKeystore} and credentials/keystore.properties.`
  );
  console.log(
    '[DocuDash Signing] Keep a secure offline backup of the credentials/ folder so future APK updates keep the same signature.'
  );

  return {
    source: 'generated',
    storeFile: DEFAULT_KEYSTORE_PATH,
    storePassword: generatedPassword,
    keyAlias: DEFAULT_KEY_ALIAS,
    keyPassword: generatedPassword,
    generated: true,
  };
}

function verifyApkSignature(apksigner, apkPath) {
  const result = runOrThrow(
    apksigner,
    ['verify', '--verbose', '--print-certs', apkPath],
    'apksigner verify'
  );
  const summaryLines = result.stdout
    .split(/\r?\n/)
    .filter((line) =>
      /(Verifies|Verified using|Signer #1 certificate DN:|Signer #1 certificate SHA-256 digest:)/i.test(
        line
      )
    );
  console.log(
    `[DocuDash Signing] Signature verified for ${path.relative(ROOT_DIR, apkPath)}:`
  );
  for (const line of summaryLines) {
    console.log(`  ${line.trim()}`);
  }
}

function signAndVerifyApk(inputApk, outputApk, creds) {
  if (!fs.existsSync(inputApk)) {
    throw new Error(`Input APK not found: ${inputApk}`);
  }

  const apksigner = findBuildToolsExecutable('apksigner');
  if (!apksigner) {
    throw new Error(
      'Unable to locate Android SDK "apksigner". Set ANDROID_HOME / ANDROID_SDK_ROOT or install Android SDK Build-Tools.'
    );
  }

  const zipalign = findBuildToolsExecutable('zipalign');
  const tempWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docudash-sign-'));
  const alignedApk = path.join(tempWorkDir, 'aligned.apk');

  try {
    fs.mkdirSync(path.dirname(outputApk), { recursive: true });

    let sourceForSigning = inputApk;
    if (zipalign) {
      console.log('[DocuDash Signing] Aligning APK with zipalign...');
      runOrThrow(zipalign, ['-p', '-f', '4', inputApk, alignedApk], 'zipalign');
      sourceForSigning = alignedApk;
    } else {
      console.log('[DocuDash Signing] zipalign not found; signing input APK directly.');
    }

    const signedTempApk = path.join(tempWorkDir, 'signed.apk');
    console.log('[DocuDash Signing] Signing APK with apksigner...');
    runOrThrow(
      apksigner,
      [
        'sign',
        '--ks',
        creds.storeFile,
        '--ks-key-alias',
        creds.keyAlias,
        '--ks-pass',
        'env:DOCUDASH_SIGN_STORE_PASS',
        '--key-pass',
        'env:DOCUDASH_SIGN_KEY_PASS',
        '--v1-signing-enabled',
        'true',
        '--v2-signing-enabled',
        'true',
        '--v3-signing-enabled',
        'true',
        '--out',
        signedTempApk,
        sourceForSigning,
      ],
      'apksigner sign',
      {
        env: {
          ...process.env,
          DOCUDASH_SIGN_STORE_PASS: creds.storePassword,
          DOCUDASH_SIGN_KEY_PASS: creds.keyPassword,
        },
      }
    );

    fs.copyFileSync(signedTempApk, outputApk);
    verifyApkSignature(apksigner, outputApk);
  } finally {
    fs.rmSync(tempWorkDir, { recursive: true, force: true });
  }
}

function buildReleaseApk(creds, forcePrebuild) {
  const androidDir = path.join(ROOT_DIR, 'android');
  const npxCmd = isWindows() ? 'npx.cmd' : 'npx';

  if (forcePrebuild || !fs.existsSync(androidDir)) {
    console.log('[DocuDash Build] Running expo prebuild for Android...');
    runOrThrow(
      npxCmd,
      ['expo', 'prebuild', '--platform', 'android', '--clean'],
      'expo prebuild',
      { stdio: 'inherit' }
    );
  }

  const gradlew = isWindows()
    ? path.join(androidDir, 'gradlew.bat')
    : path.join(androidDir, 'gradlew');

  if (!fs.existsSync(gradlew)) {
    throw new Error(
      `Gradle wrapper not found at ${gradlew}. Run with --prebuild to generate android/.`
    );
  }

  console.log('[DocuDash Build] Building signed release APK via Gradle...');
  runOrThrow(gradlew, ['assembleRelease'], 'Gradle assembleRelease', {
    cwd: androidDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      DOCUDASH_UPLOAD_STORE_FILE: creds.storeFile,
      DOCUDASH_UPLOAD_STORE_PASSWORD: creds.storePassword,
      DOCUDASH_UPLOAD_KEY_ALIAS: creds.keyAlias,
      DOCUDASH_UPLOAD_KEY_PASSWORD: creds.keyPassword,
    },
  });

  if (!fs.existsSync(DEFAULT_RELEASE_APK)) {
    throw new Error(`Expected release APK at ${DEFAULT_RELEASE_APK}, but none was created.`);
  }

  const apksigner = findBuildToolsExecutable('apksigner');
  if (!apksigner) {
    console.log(
      `[DocuDash Build] Built release APK at ${path.relative(ROOT_DIR, DEFAULT_RELEASE_APK)} (apksigner unavailable for post-check).`
    );
    return;
  }

  const verifyCheck = runProcess(apksigner, ['verify', DEFAULT_RELEASE_APK]);
  if (verifyCheck.status === 0) {
    verifyApkSignature(apksigner, DEFAULT_RELEASE_APK);
  } else {
    console.log(
      '[DocuDash Build] Gradle output was not signed with release key; applying apksigner now...'
    );
    signAndVerifyApk(DEFAULT_RELEASE_APK, DEFAULT_RELEASE_APK, creds);
  }
}

function resolveDefaultSignOnlyInput() {
  if (fs.existsSync(DEFAULT_UNSIGNED_APK)) {
    return DEFAULT_UNSIGNED_APK;
  }
  if (fs.existsSync(DEFAULT_RELEASE_APK)) {
    return DEFAULT_RELEASE_APK;
  }
  throw new Error(
    `No release APK found at ${path.relative(ROOT_DIR, DEFAULT_UNSIGNED_APK)} or ${path.relative(ROOT_DIR, DEFAULT_RELEASE_APK)}. Pass --apk <path> or run without --sign-only to build first.`
  );
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const creds = ensureSigningCredentials(opts.dname);

  if (opts.setupOnly) {
    console.log('[DocuDash Signing] Setup complete.');
    return;
  }

  if (opts.signOnly) {
    const inputApk = opts.apkPath ?? resolveDefaultSignOnlyInput();
    const parsed = path.parse(inputApk);
    const defaultOut =
      inputApk === DEFAULT_RELEASE_APK
        ? DEFAULT_RELEASE_APK
        : path.join(parsed.dir, `${parsed.name}-signed${parsed.ext || '.apk'}`);
    const outputApk = opts.outPath ?? defaultOut;

    signAndVerifyApk(inputApk, outputApk, creds);
    return;
  }

  buildReleaseApk(creds, opts.prebuild);
}

try {
  main();
} catch (error) {
  console.error(`[DocuDash Signing Error] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
