#!/bin/sh
# One-command installer for miaopan607/oh-my-pi, NOT for the upstream build.
# Installs only an independent omp-mp command; never overwrites "omp".
set -eu

REPO="miaopan607/oh-my-pi"
RAW_INSTALLER="https://raw.githubusercontent.com/$REPO/main/scripts/fork/install.sh"
API="https://api.github.com/repos/$REPO/releases/latest"
APP_DIR="${OMP_MP_DATA_DIR:-$HOME/.local/share/omp-mp}"
BIN_DIR="${OMP_MP_BIN_DIR:-$HOME/.local/bin}"
CONFIG_DIR="${OMP_MP_CONFIG_DIR:-$HOME/.omp-mp}"

fail() { printf 'omp-mp: %s\n' "$*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v mktemp >/dev/null 2>&1 || fail "mktemp is required"

case "$(uname -s):$(uname -m)" in
  Darwin:arm64|Darwin:aarch64) ASSET="omp-darwin-arm64" ;;
  Linux:x86_64|Linux:amd64) ASSET="omp-linux-x64" ;;
  *) fail "No binary Release for $(uname -s)/$(uname -m). Supported: Linux x64, Apple Silicon macOS." ;;
esac

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$1" | awk '{print $NF}'
  else
    fail "A SHA-256 utility (sha256sum, shasum, or openssl) is required"
  fi
}

mkdir -p "$APP_DIR" "$BIN_DIR" "$CONFIG_DIR"
if [ ! -e "$CONFIG_DIR/config.yml" ]; then
  (umask 077; printf '{}\n' > "$CONFIG_DIR/config.yml")
  printf 'Created fork-only overrides: %s\n' "$CONFIG_DIR/config.yml"
fi

# Always refresh installer logic, even when the binary version is unchanged.
NEW_INSTALLER="$APP_DIR/install.sh.new"
curl -fLsS --retry 3 --connect-timeout 20 "$RAW_INSTALLER" -o "$NEW_INSTALLER" \
  || fail "Unable to download installer from the fork repository"
chmod 700 "$NEW_INSTALLER"
mv -f "$NEW_INSTALLER" "$APP_DIR/install.sh"

case "${1:-}" in
  --enable-auto-update)
    command -v crontab >/dev/null 2>&1 || fail "crontab is unavailable; use omp-mp --fork-update manually"
    CRON_LINE="17 3 * * * /bin/sh \"$APP_DIR/install.sh\" > /dev/null 2>&1 # omp-mp-autoupdate"
    (crontab -l 2>/dev/null || true) | grep -v '# omp-mp-autoupdate' > "$APP_DIR/previous-crontab" || true
    { cat "$APP_DIR/previous-crontab"; printf '%s\n' "$CRON_LINE"; } | crontab -
    rm -f "$APP_DIR/previous-crontab"
    printf 'Enabled a daily update check at 03:17 using cron.\n'
    ;;
  ""|--update) ;;
  *) fail "Unknown option: $1" ;;
esac

RELEASE_JSON="$(curl -fLsS --retry 3 --connect-timeout 20 -H 'Accept: application/vnd.github+json' "$API")" \
  || fail "Cannot query the latest GitHub release"
TAG="$(printf '%s\n' "$RELEASE_JSON" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
printf '%s\n' "$TAG" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+-mp\.[1-9][0-9]*$' ||
  fail "Unexpected release tag (expected vX.Y.Z-mp.N): $TAG"

TARGET="$APP_DIR/omp"
TAG_FILE="$APP_DIR/release-tag"
HASH_FILE="$APP_DIR/installed-sha256"
if [ -s "$TARGET" ] && [ -f "$TAG_FILE" ] && [ -f "$HASH_FILE" ] &&
   [ "$(cat "$TAG_FILE")" = "$TAG" ] &&
   [ "$(sha256_of "$TARGET")" = "$(cat "$HASH_FILE")" ]; then
  printf 'omp-mp already up to date: %s\n' "$TAG"
else
  TEMP_DIR="$(mktemp -d)" || fail "Cannot create temporary install directory"
  trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM
  BASE_URL="https://github.com/$REPO/releases/download/$TAG"
  curl -fLsS --retry 3 --connect-timeout 20 "$BASE_URL/SHA256SUMS.txt" -o "$TEMP_DIR/SHA256SUMS.txt" ||
    fail "Missing SHA256SUMS.txt in the latest Release"
  EXPECTED="$(awk -v name="$ASSET" '$2 == name || $2 == "*"name { print $1; exit }' "$TEMP_DIR/SHA256SUMS.txt")"
  case "$EXPECTED" in
    ""|*[!0-9a-fA-F]*) fail "Release checksum missing or invalid for $ASSET" ;;
  esac
  [ "${#EXPECTED}" -eq 64 ] || fail "Invalid SHA-256 checksum length"
  printf 'Downloading %s (%s)...\n' "$ASSET" "$TAG"
  curl -fLsS --retry 3 --connect-timeout 20 "$BASE_URL/$ASSET" -o "$TEMP_DIR/omp" ||
    fail "Failed to download $ASSET"
  ACTUAL="$(sha256_of "$TEMP_DIR/omp")"
  [ "$ACTUAL" = "$EXPECTED" ] || fail "SHA-256 mismatch; existing version is untouched"
  chmod 755 "$TEMP_DIR/omp"
  "$TEMP_DIR/omp" --version >/dev/null || fail "Downloaded binary failed version smoke test"
  # A stable Release from before the isolated config feature must never be
  # installed by this launcher: it would still write to the official config.
  FEATURE_CONFIG_DIR="$(OMP_MP_CONFIG_FILE="$CONFIG_DIR/config.yml" "$TEMP_DIR/omp" config path)" ||
    fail "Downloaded binary could not verify isolated fork settings support"
  [ "$FEATURE_CONFIG_DIR" = "$CONFIG_DIR" ] ||
    fail "Latest stable Release is too old to isolate settings; use the next verified fork Release"
  mv -f "$TEMP_DIR/omp" "$TARGET" || fail "Cannot replace binary; close omp-mp and retry"
  printf '%s\n' "$TAG" > "$TAG_FILE"
  printf '%s\n' "$EXPECTED" > "$HASH_FILE"
  printf 'Installed %s.\n' "$TAG"
  rm -rf "$TEMP_DIR"
  trap - EXIT HUP INT TERM
fi

LAUNCHER="$BIN_DIR/omp-mp"
# Use the built-in overlay mechanism rather than reimplementing upstream
# configuration loading. This keeps default-profile credentials and sessions.
cat > "$LAUNCHER" <<'LAUNCHER_EOF'
#!/bin/sh
set -eu
APP_DIR="${OMP_MP_DATA_DIR:-$HOME/.local/share/omp-mp}"
CONFIG_DIR="${OMP_MP_CONFIG_DIR:-$HOME/.omp-mp}"
case "${1:-}" in
  --fork-update) exec /bin/sh "$APP_DIR/install.sh" --update ;;
  --fork-auto-update) exec /bin/sh "$APP_DIR/install.sh" --enable-auto-update ;;
  --fork-config) printf '%s\n' "$CONFIG_DIR/config.yml"; exit 0 ;;
esac
if [ ! -e "$CONFIG_DIR/config.yml" ]; then
  mkdir -p "$CONFIG_DIR"
  (umask 077; printf '{}\n' > "$CONFIG_DIR/config.yml")
fi
# Fork-only writable layer. Upstream's official profile, auth and
# sessions remain at ~/.omp; no official settings file is ever written.
# Existing PI_CONFIG_FILES overlays and explicit --config still work.
OMP_MP_CONFIG_FILE="$CONFIG_DIR/config.yml"
export OMP_MP_CONFIG_FILE
exec "$APP_DIR/omp" "$@"
LAUNCHER_EOF
chmod 755 "$LAUNCHER"
printf 'Command: %s\n' "$LAUNCHER"
printf 'Fork overrides: %s/config.yml\n' "$CONFIG_DIR"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) printf 'Add %s to PATH, then run: omp-mp\n' "$BIN_DIR" ;;
esac
printf 'Update: omp-mp --fork-update | Daily updates: omp-mp --fork-auto-update\n'
 ||
  fail "Unexpected release tag (expected vX.Y.Z-mp.N): $TAG"

TARGET="$APP_DIR/omp"
TAG_FILE="$APP_DIR/release-tag"
HASH_FILE="$APP_DIR/installed-sha256"
if [ -s "$TARGET" ] && [ -f "$TAG_FILE" ] && [ -f "$HASH_FILE" ] &&
   [ "$(cat "$TAG_FILE")" = "$TAG" ] &&
   [ "$(sha256_of "$TARGET")" = "$(cat "$HASH_FILE")" ]; then
  printf 'omp-mp already up to date: %s\n' "$TAG"
else
  TEMP_DIR="$(mktemp -d)" || fail "Cannot create temporary install directory"
  trap 'rm -rf "$TEMP_DIR"' EXIT HUP INT TERM
  BASE_URL="https://github.com/$REPO/releases/download/$TAG"
  curl -fLsS --retry 3 --connect-timeout 20 "$BASE_URL/SHA256SUMS.txt" -o "$TEMP_DIR/SHA256SUMS.txt" ||
    fail "Missing SHA256SUMS.txt in the latest Release"
  EXPECTED="$(awk -v name="$ASSET" '$2 == name || $2 == "*"name { print $1; exit }' "$TEMP_DIR/SHA256SUMS.txt")"
  case "$EXPECTED" in
    ""|*[!0-9a-fA-F]*) fail "Release checksum missing or invalid for $ASSET" ;;
  esac
  [ "${#EXPECTED}" -eq 64 ] || fail "Invalid SHA-256 checksum length"
  printf 'Downloading %s (%s)...\n' "$ASSET" "$TAG"
  curl -fLsS --retry 3 --connect-timeout 20 "$BASE_URL/$ASSET" -o "$TEMP_DIR/omp" ||
    fail "Failed to download $ASSET"
  ACTUAL="$(sha256_of "$TEMP_DIR/omp")"
  [ "$ACTUAL" = "$EXPECTED" ] || fail "SHA-256 mismatch; existing version is untouched"
  chmod 755 "$TEMP_DIR/omp"
  "$TEMP_DIR/omp" --version >/dev/null || fail "Downloaded binary failed version smoke test"
  # A stable Release from before the isolated config feature must never be
  # installed by this launcher: it would still write to the official config.
  FEATURE_CONFIG_DIR="$(OMP_MP_CONFIG_FILE="$CONFIG_DIR/config.yml" "$TEMP_DIR/omp" config path)" ||
    fail "Downloaded binary could not verify isolated fork settings support"
  [ "$FEATURE_CONFIG_DIR" = "$CONFIG_DIR" ] ||
    fail "Latest stable Release is too old to isolate settings; use the next verified fork Release"
  mv -f "$TEMP_DIR/omp" "$TARGET" || fail "Cannot replace binary; close omp-mp and retry"
  printf '%s\n' "$TAG" > "$TAG_FILE"
  printf '%s\n' "$EXPECTED" > "$HASH_FILE"
  printf 'Installed %s.\n' "$TAG"
  rm -rf "$TEMP_DIR"
  trap - EXIT HUP INT TERM
fi

LAUNCHER="$BIN_DIR/omp-mp"
# Use the built-in overlay mechanism rather than reimplementing upstream
# configuration loading. This keeps default-profile credentials and sessions.
cat > "$LAUNCHER" <<'LAUNCHER_EOF'
#!/bin/sh
set -eu
APP_DIR="${OMP_MP_DATA_DIR:-$HOME/.local/share/omp-mp}"
CONFIG_DIR="${OMP_MP_CONFIG_DIR:-$HOME/.omp-mp}"
case "${1:-}" in
  --fork-update) exec /bin/sh "$APP_DIR/install.sh" --update ;;
  --fork-auto-update) exec /bin/sh "$APP_DIR/install.sh" --enable-auto-update ;;
  --fork-config) printf '%s\n' "$CONFIG_DIR/config.yml"; exit 0 ;;
esac
if [ ! -e "$CONFIG_DIR/config.yml" ]; then
  mkdir -p "$CONFIG_DIR"
  (umask 077; printf '{}\n' > "$CONFIG_DIR/config.yml")
fi
# Fork-only writable layer. Upstream's official profile, auth and
# sessions remain at ~/.omp; no official settings file is ever written.
# Existing PI_CONFIG_FILES overlays and explicit --config still work.
OMP_MP_CONFIG_FILE="$CONFIG_DIR/config.yml"
export OMP_MP_CONFIG_FILE
exec "$APP_DIR/omp" "$@"
LAUNCHER_EOF
chmod 755 "$LAUNCHER"
printf 'Command: %s\n' "$LAUNCHER"
printf 'Fork overrides: %s/config.yml\n' "$CONFIG_DIR"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) printf 'Add %s to PATH, then run: omp-mp\n' "$BIN_DIR" ;;
esac
printf 'Update: omp-mp --fork-update | Daily updates: omp-mp --fork-auto-update\n'
