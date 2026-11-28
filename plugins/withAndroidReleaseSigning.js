const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING_HELPER_MARKER =
  '// DocuDash release signing (credentials/keystore.properties or DOCUDASH_UPLOAD_* env)';

const SIGNING_HELPER_BLOCK = `${SIGNING_HELPER_MARKER}
def docudashSigningProps = new Properties()
def docudashPropsFile = new File(rootDir.parentFile, "credentials/keystore.properties")
if (docudashPropsFile.exists()) {
    docudashPropsFile.withInputStream { stream ->
        docudashSigningProps.load(stream)
    }
}
def docudashReadSigningValue = { String key ->
    def fromFile = docudashSigningProps.getProperty(key)
    if (fromFile != null && !fromFile.trim().isEmpty()) {
        return fromFile.trim()
    }
    def fromProp = findProperty(key)
    if (fromProp != null && !fromProp.toString().trim().isEmpty()) {
        return fromProp.toString().trim()
    }
    def fromEnv = System.getenv(key)
    return (fromEnv != null && !fromEnv.trim().isEmpty()) ? fromEnv.trim() : null
}
def docudashStorePath = docudashReadSigningValue("DOCUDASH_UPLOAD_STORE_FILE")
def docudashStorePassword = docudashReadSigningValue("DOCUDASH_UPLOAD_STORE_PASSWORD")
def docudashKeyAlias = docudashReadSigningValue("DOCUDASH_UPLOAD_KEY_ALIAS")
def docudashKeyPassword = docudashReadSigningValue("DOCUDASH_UPLOAD_KEY_PASSWORD")
def docudashResolvedStoreFile = null
if (docudashStorePath != null) {
    def candidateFromRoot = new File(rootDir.parentFile, docudashStorePath)
    docudashResolvedStoreFile = candidateFromRoot.exists() ? candidateFromRoot : file(docudashStorePath)
}
def docudashHasReleaseSigning = (
    docudashResolvedStoreFile != null &&
    docudashResolvedStoreFile.exists() &&
    docudashStorePassword != null &&
    docudashKeyAlias != null &&
    docudashKeyPassword != null
)
`;

const RELEASE_SIGNING_CONFIG_BLOCK = `        release {
            if (docudashHasReleaseSigning) {
                storeFile docudashResolvedStoreFile
                storePassword docudashStorePassword
                keyAlias docudashKeyAlias
                keyPassword docudashKeyPassword
            }
        }`;

const RELEASE_BUILD_TYPE_SIGNING = `if (docudashHasReleaseSigning) {
                signingConfig signingConfigs.release
            } else {
                println("[DocuDash] WARNING: No release keystore configured (credentials/keystore.properties or DOCUDASH_UPLOAD_*). Signing release build with debug.keystore.")
                signingConfig signingConfigs.debug
            }`;

function applyReleaseSigning(buildGradle) {
  let updated = buildGradle;

  if (!updated.includes(SIGNING_HELPER_MARKER)) {
    updated = updated.replace(/\nandroid\s*\{/, `\n${SIGNING_HELPER_BLOCK}\nandroid {`);
  }

  if (!updated.includes('signingConfig signingConfigs.release')) {
    updated = updated.replace(
      /(signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\})\s*(\})/,
      `$1\n${RELEASE_SIGNING_CONFIG_BLOCK}\n    $2`
    );

    updated = updated.replace(
      /(buildTypes\s*\{\s*debug\s*\{[\s\S]*?\}\s*release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      `$1${RELEASE_BUILD_TYPE_SIGNING}`
    );
  }

  return updated;
}

/**
 * Expo config plugin configuring permanent Android release signing from
 * gitignored `credentials/keystore.properties` or `DOCUDASH_UPLOAD_*` env vars.
 */
module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language === 'groovy') {
      modConfig.modResults.contents = applyReleaseSigning(modConfig.modResults.contents);
    }
    return modConfig;
  });
};
