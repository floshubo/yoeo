#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This build must run on macOS because Apple only ships Xcode for macOS." >&2
  exit 1
fi

for tool in node xcodebuild plutil; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 1; }
done

if ! command -v pnpm >/dev/null 2>&1; then
  command -v corepack >/dev/null 2>&1 || { echo "Install Node.js 24, which includes Corepack, then run this script again." >&2; exit 1; }
  corepack enable
fi

: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID to the 10-character Apple Developer Team ID}"
: "${IOS_BUILD_NUMBER:?Set IOS_BUILD_NUMBER to a new positive number for every App Store upload}"
[[ "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] || { echo "APPLE_TEAM_ID must be 10 uppercase letters or digits." >&2; exit 1; }
[[ "$IOS_BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]] || { echo "IOS_BUILD_NUMBER must be a positive integer." >&2; exit 1; }

IOS_VERSION="${IOS_VERSION:-1.0}"
[[ "$IOS_VERSION" =~ ^[0-9]+([.][0-9]+){1,2}$ ]] || { echo "IOS_VERSION must look like 1.0 or 1.0.0." >&2; exit 1; }

AUTH_ARGS=()
auth_count=0
for value in "${ASC_KEY_ID:-}" "${ASC_ISSUER_ID:-}" "${ASC_KEY_PATH:-}"; do
  [[ -n "$value" ]] && auth_count=$((auth_count + 1))
done
if [[ "$auth_count" -ne 0 && "$auth_count" -ne 3 ]]; then
  echo "Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH together, or leave all three unset and sign in through Xcode." >&2
  exit 1
fi
if [[ "$auth_count" -eq 3 ]]; then
  [[ -f "$ASC_KEY_PATH" ]] || { echo "ASC_KEY_PATH does not point to an App Store Connect .p8 key." >&2; exit 1; }
  AUTH_ARGS=(
    -authenticationKeyPath "$ASC_KEY_PATH"
    -authenticationKeyID "$ASC_KEY_ID"
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
  )
fi

[[ -f .env.production ]] || {
  echo "Missing .env.production. Copy .env.production.example and add the public production URLs and Apple RevenueCat SDK key." >&2
  exit 1
}

echo "Installing locked dependencies..."
pnpm install --frozen-lockfile

echo "Building the web app and synchronizing the iOS project..."
pnpm native:prepare:ios
plutil -lint ios/App/App/Info.plist ios/App/App/PrivacyInfo.xcprivacy

BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yoeo-ios.XXXXXX")"
trap 'rm -rf "$BUILD_DIR"' EXIT
ARCHIVE_PATH="$BUILD_DIR/YOEO.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"
EXPORT_OPTIONS="$BUILD_DIR/ExportOptions.plist"

cat > "$EXPORT_OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>export</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${APPLE_TEAM_ID}</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
PLIST

echo "Archiving YOEO ${IOS_VERSION} (${IOS_BUILD_NUMBER})..."
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  "${AUTH_ARGS[@]}" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  MARKETING_VERSION="$IOS_VERSION" \
  CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" \
  archive

echo "Exporting the signed IPA..."
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates \
  "${AUTH_ARGS[@]}"

GENERATED_IPA="$(find "$EXPORT_DIR" -maxdepth 1 -type f -name '*.ipa' -print -quit)"
[[ -n "$GENERATED_IPA" ]] || { echo "Xcode finished without producing an IPA." >&2; exit 1; }

mkdir -p output/ios
FINAL_IPA="output/ios/YOEO-${IOS_VERSION}-${IOS_BUILD_NUMBER}.ipa"
cp -f "$GENERATED_IPA" "$FINAL_IPA"

echo
echo "IPA ready: $PROJECT_ROOT/$FINAL_IPA"
echo "Upload it with Transporter or Xcode Organizer, or keep it for your CI release job."
