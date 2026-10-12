#!/usr/bin/env bash
#
# Build, install, launch and watch the Android app without Android Studio.
#
#   scripts/android.sh doctor            check the toolchain, write local.properties if missing
#   scripts/android.sh build [--bundle-mlkit]
#                                        web build + cap sync + debug APK
#   scripts/android.sh install           install the last built APK on the device
#   scripts/android.sh launch            start the app on the device
#   scripts/android.sh run [--bundle-mlkit]
#                                        build, install, launch
#   scripts/android.sh logs              app-only logcat (Ctrl-C to stop)
#   scripts/android.sh emulator [avd]    boot an emulator and wait for it
#   scripts/android.sh verify            sanity-check the built APK
#
# Finds the JDK and SDK on its own: JAVA_HOME / ANDROID_HOME win when set,
# otherwise Android Studio's bundled JBR and the platform's default SDK path.
# With several devices attached, set ANDROID_SERIAL (adb reads it directly).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID="nl.abektes.fichero"
ACTIVITY="$APP_ID/.MainActivity"
APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

find_java_home() {
  if [ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ]; then
    echo "$JAVA_HOME"; return
  fi
  local c
  for c in \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/opt/android-studio/jbr" \
    "$HOME/android-studio/jbr" \
    "/snap/android-studio/current/jbr"; do
    if [ -x "$c/bin/java" ]; then echo "$c"; return; fi
  done
  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    /usr/libexec/java_home -v 21 2>/dev/null && return
  fi
  return 1
}

find_sdk() {
  local c
  for c in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}"; do
    if [ -n "$c" ] && [ -d "$c/platform-tools" ]; then echo "$c"; return; fi
  done
  if [ -f "$ROOT/android/local.properties" ]; then
    c="$(sed -n 's/^sdk\.dir=//p' "$ROOT/android/local.properties")"
    if [ -n "$c" ] && [ -d "$c/platform-tools" ]; then echo "$c"; return; fi
  fi
  for c in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [ -d "$c/platform-tools" ]; then echo "$c"; return; fi
  done
  return 1
}

setup_env() {
  JAVA_HOME="$(find_java_home)" || die "no JDK found. Install Android Studio, or set JAVA_HOME to a JDK 21."
  export JAVA_HOME
  SDK="$(find_sdk)" || die "no Android SDK found. Install it via Android Studio, or set ANDROID_HOME."
  export ANDROID_HOME="$SDK"
  export PATH="$JAVA_HOME/bin:$SDK/platform-tools:$SDK/emulator:$PATH"

  # Machine-specific and gitignored. Write it, or fix one pointing nowhere.
  local props="$ROOT/android/local.properties"
  local current=""
  [ -f "$props" ] && current="$(sed -n 's/^sdk\.dir=//p' "$props")"
  if [ "$current" != "$SDK" ] && [ ! -d "$current/platform-tools" ]; then
    say "writing android/local.properties (sdk.dir=$SDK)"
    echo "sdk.dir=$SDK" > "$props"
  fi
}

need_device() {
  [ -n "${ANDROID_SERIAL:-}" ] && return
  # adb counts offline entries (a stale emulator, an unauthorised phone) when
  # deciding a target is ambiguous, so pin the one usable device explicitly.
  local ready
  ready="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
  if [ -z "$ready" ]; then
    adb devices -l >&2
    die "no device in 'device' state. Plug in a phone with USB debugging on, or run: scripts/android.sh emulator"
  fi
  if [ "$(echo "$ready" | wc -l | tr -d ' ')" != "1" ]; then
    adb devices -l >&2
    die "several devices attached; set ANDROID_SERIAL to pick one."
  fi
  export ANDROID_SERIAL="$ready"
}

# Until the first unlock after a boot, Android hides every activity that is not
# direct-boot aware: `am start` then reports "Activity class ... does not
# exist", which sends you looking at the APK. Wake the screen (enough for a
# swipe lock) and name the real problem if a PIN or pattern is still in the way.
need_unlocked() {
  adb shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
  local i
  for i in 1 2 3 4 5; do
    adb shell dumpsys user | grep -q 'RUNNING_UNLOCKED' && return
    sleep 1
  done
  die "$ANDROID_SERIAL is locked with a PIN or pattern. Unlock its screen once, then run: scripts/android.sh launch"
}

cmd_doctor() {
  local ok=1
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p 'process.versions.node.split(".")[0]')"
    if [ "$major" -ge 22 ]; then say "node $(node -v)"; else echo "node $(node -v): need 22+"; ok=0; fi
  else
    echo "node: not found (need 22+)"; ok=0
  fi
  [ -d "$ROOT/node_modules" ] && say "node_modules present" || { echo "node_modules missing: run npm ci"; ok=0; }

  setup_env
  say "JAVA_HOME=$JAVA_HOME ($("$JAVA_HOME/bin/java" -version 2>&1 | head -1))"
  say "ANDROID_HOME=$ANDROID_HOME"
  [ -d "$ANDROID_HOME/platforms/android-36" ] && say "platform android-36 installed" \
    || echo "warning: platforms/android-36 missing; Gradle will try to download it"

  say "devices:"
  adb devices -l | sed 1d | sed '/^$/d;s/^/    /' || true
  if command -v emulator >/dev/null 2>&1; then
    say "emulator images:"
    emulator -list-avds 2>/dev/null | sed 's/^/    /' || true
  fi
  [ "$ok" = 1 ] || die "fix the items above"
  say "ready"
}

cmd_build() {
  local bundle=false
  [ "${1:-}" = "--bundle-mlkit" ] && bundle=true
  setup_env
  [ -d "$ROOT/node_modules" ] || { say "npm ci"; (cd "$ROOT" && npm ci); }
  say "web build"
  (cd "$ROOT" && npm run --silent build:web)
  say "cap sync android"
  (cd "$ROOT" && npx cap sync android)
  say "gradle assembleDebug (bundle ML Kit models: $bundle)"
  (cd "$ROOT/android" && ./gradlew assembleDebug --no-daemon -q -PficheroBundleMlkitModels="$bundle")
  say "APK: ${APK#$ROOT/} ($(du -h "$APK" | cut -f1))"
}

cmd_install() {
  setup_env
  [ -f "$APK" ] || die "no APK at ${APK#$ROOT/}; run: scripts/android.sh build"
  need_device
  say "installing on $(adb get-serialno)"
  adb install -r "$APK"
}

cmd_launch() {
  setup_env
  need_device
  need_unlocked
  say "launching $ACTIVITY"
  local out
  out="$(adb shell am start -W -n "$ACTIVITY" 2>&1 | tr -d '\r')" || true
  if grep -q '^Error' <<<"$out"; then
    echo "$out" >&2
    die "launch failed; is the APK installed? (scripts/android.sh install)"
  fi
  say "running (pid $(adb shell pidof "$APP_ID" | tr -d '\r'))"
}

cmd_logs() {
  setup_env
  need_device
  local pid
  pid="$(adb shell pidof "$APP_ID" | tr -d '\r')"
  [ -n "$pid" ] || die "app is not running; run: scripts/android.sh launch"
  say "logcat for pid $pid (Ctrl-C to stop)"
  adb logcat --pid="$pid"
}

cmd_emulator() {
  setup_env
  local avd="${1:-}"
  [ -n "$avd" ] || avd="$(emulator -list-avds | head -1)"
  [ -n "$avd" ] || die "no emulator image. Create one in Android Studio > Device Manager."
  # Pick the port, and so the serial, ourselves: plain `adb wait-for-device`
  # fails outright when any other device or stale emulator is listed.
  local port=5554 serial
  while adb devices | grep -q "^emulator-$port[[:space:]]"; do port=$((port + 2)); done
  serial="emulator-$port"
  say "booting $avd as $serial (no Bluetooth: the designer works, printing does not)"
  nohup emulator -avd "$avd" -port "$port" -no-snapshot-save >/dev/null 2>&1 &
  local waited=0
  until [ "$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    sleep 3; waited=$((waited + 3))
    [ "$waited" -lt 300 ] || die "$serial did not finish booting within 5 minutes"
  done
  say "booted. If other devices are attached: export ANDROID_SERIAL=$serial"
}

cmd_verify() {
  setup_env
  [ -f "$APK" ] || die "no APK at ${APK#$ROOT/}; run: scripts/android.sh build"
  local aapt
  aapt="$(ls -d "$ANDROID_HOME"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)"
  if [ -n "$aapt" ]; then
    "$aapt" dump badging "$APK" | grep -E '^package:|^application-label:' | sed 's/^/    /'
  fi
  # The Bluetooth shim no-ops silently when its plugin is missing, so a broken
  # build looks like a working one until you try to connect.
  # Here-strings, not pipes: under pipefail, grep -q exiting early makes the
  # writer die of SIGPIPE and a found match reads as a failure.
  local plugins listing
  plugins="$(unzip -p "$APK" assets/capacitor.plugins.json)"
  listing="$(unzip -l "$APK")"
  grep -q bluetooth_low_energy <<<"$plugins" && say "Bluetooth plugin registered" \
    || die "Bluetooth plugin missing from capacitor.plugins.json: run the build again"
  grep -q 'assets/public/index.html' <<<"$listing" && say "web assets bundled" \
    || die "assets/public/index.html missing: run the build again"
  grep -q 'assets/efficientnet_lite2.tflite' <<<"$listing" && say "live-overlay model bundled" \
    || die "efficientnet_lite2.tflite missing: the live overlay will not start"
}

case "${1:-}" in
  doctor)   cmd_doctor ;;
  build)    shift; cmd_build "$@" ;;
  install)  cmd_install ;;
  launch)   cmd_launch ;;
  run)      shift; cmd_build "$@"; cmd_install; cmd_launch ;;
  logs)     cmd_logs ;;
  emulator) shift; cmd_emulator "$@" ;;
  verify)   cmd_verify ;;
  *) sed -n '3,18p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
