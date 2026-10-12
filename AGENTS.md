# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Cursor and the like) working in this
repository. Humans may find it useful too; the long-form build notes are in
[BUILD.md](BUILD.md).

## What this is

**Labels in Action (LIA)**: a Svelte 5 + Fabric.js label designer wrapped in Capacitor 8 as an
Android app, printing to a Fichero D11s / AiYin D11s thermal label printer over Bluetooth LE.
The same web build also runs as a PWA in desktop/Android Chrome.

- Android application id: `nl.abektes.fichero`, launch activity `.MainActivity`
- Web source: `src/`; printer protocol: `src/lib/fichero/`; camera scan: `src/lib/scan/`
- Native code: `android/app/src/main/java/nl/abektes/fichero/` (two app-local plugins,
  `livelabels` and `cloudnaming`, registered in `MainActivity.java`)

## Run the Android app

Everything goes through one script. It finds Android Studio's bundled JDK and the Android SDK
by itself and writes `android/local.properties` if it is missing, so you do **not** need
`JAVA_HOME` or `ANDROID_HOME` set.

```bash
npm ci
scripts/android.sh doctor      # toolchain + attached devices; fix anything it flags first
scripts/android.sh run         # web build -> cap sync -> debug APK -> install -> launch
scripts/android.sh logs        # app-only logcat, Ctrl-C to stop
```

Individual steps: `build`, `install`, `launch`, `verify` (sanity-checks the APK), and
`emulator [avd]` (boots an emulator and waits for it). The same are exposed as npm scripts:
`npm run android:doctor`, `android:build`, `android`, `android:logs`.

- **Device choice.** The script targets the one device in `device` state and ignores
  `offline` or `unauthorized` entries (stale emulators are common). With two or more usable
  devices, set `ANDROID_SERIAL` (from `adb devices`).
- **Locked screens.** After a reboot, Android will not start the app until the device has
  been unlocked once; `am start` misleadingly says the activity "does not exist". `launch`
  dismisses a swipe lock itself and stops with a clear message if a PIN or pattern is set. A
  human has to unlock it then, so ask; do not guess PINs.
- **Phone vs emulator.** The emulator has no Bluetooth, so you can test the designer, saved
  labels and settings there, but not connecting or printing. Those need a real phone with
  USB debugging on, and a printer.
- **APK size.** The default build is ~50 MB and gets ML Kit models from Play Services.
  `build --bundle-mlkit` embeds them (~69 MB) for phones without Google Play.
- The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

### Requirements

Node 22+, and Android Studio installed once (for its bundled JDK 21 and the SDK with
platform 36). Nothing else; Gradle comes from the wrapper. On Linux the script looks for the
JBR under `/opt/android-studio/jbr` or `~/android-studio/jbr`, and the SDK under
`~/Android/Sdk`.

## Web-only loop

```bash
npm run dev        # http://localhost:5199 (strict port; see .claude/launch.json)
npm test           # vitest unit tests
npm run check      # svelte-check, expected 0 errors 0 warnings
```

The dev server is fine for layout, the designer and anything non-native. It is **not**
evidence that the Android build works: on localhost `Capacitor.isNativePlatform()` is false,
so the Bluetooth shim, camera, ML Kit and both native plugins never load.

## Rules that have bitten before

1. **Verify native features on a device, not on desktop.** The scan feature has twice been
   reported working from a desktop build and then crashed or showed nothing on the phone.
   Check with `scripts/android.sh logs` or the in-app **⋯ → Debug stuff → Scan diagnostics**
   panel. If you could not run it on hardware, say so.
2. **Bluetooth fails silently.** The Web Bluetooth shim (`src/capacitor/ble-shim.ts`) returns
   without error when its plugin is missing. `scripts/android.sh verify` checks for that.
3. **BLE writes must respect the negotiated MTU.** Android silently truncates
   `writeWithoutResponse` payloads over MTU−3. Chunk size comes from `negotiateMtu()` in
   `src/lib/fichero/client.ts`; do not hard-code it.
4. **Never put a secret in the build.** `VITE_*` variables are inlined into the public
   bundle. Cloud naming uses each user's own OpenRouter key, pasted at runtime and held only
   by the native `CloudNaming` plugin (Android Keystore, excluded from backup). Do not add a
   way for the WebView to read it back.
5. **Generated files are not source.** `dist/`, `android/app/src/main/assets/public/` and
   `android/app/src/main/assets/capacitor*.json` are rebuilt by `cap sync`; edit `src/`.
6. **Measure APK size only after a clean build** (`cd android && ./gradlew clean`): an
   incremental build leaves tens of MB of slack in the archive.

## Before you finish

- `npm test` and `npm run check` pass.
- For anything touching Android: `scripts/android.sh build && scripts/android.sh verify`
  succeeds, and you say whether you actually ran it on a phone.
- Third-party code or assets you add are listed in
  [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) with their licence.
