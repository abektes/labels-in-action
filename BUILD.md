# Building Labels in Action

How to get from source to an installable app. Every command here was run on this machine
and worked; where something is untested it says so.

- [Toolchain](#toolchain)
- [First-time setup](#first-time-setup)
- [Build an APK](#build-an-apk)
- [Run the dev server](#run-the-dev-server)
- [Verify a build](#verify-a-build)
- [Troubleshooting](#troubleshooting)
- [iOS](#ios)

---

## Toolchain

Versions this project is known to build with:

| Tool | Version | Notes |
|---|---|---|
| Node | 22.22.2 | Capacitor 8 CLI needs 22+ |
| npm | 10.9.7 | |
| JDK | 21.0.10 | **Android Studio's bundled JBR**, see below |
| Gradle | 8.14.3 | via the wrapper, do not install separately |
| Android Gradle Plugin | 8.13.0 | |
| Capacitor | 8.5.2 | |
| compileSdk / minSdk | 36 / 24 | `android/variables.gradle` |

**There is no system Java on this machine.** `java -version` fails and `JAVA_HOME` is empty,
so every Gradle command must point at Android Studio's bundled runtime. This is the single
most common reason a build dies before printing anything useful.

---

## First-time setup

```bash
cd /Users/ahmetbektes/WDesignspace/fichero-app
npm install
```

Then confirm `android/local.properties` points at **your** SDK:

```properties
sdk.dir=/Users/ahmetbektes/Library/Android/sdk
```

This file is gitignored and machine-specific. The project was originally assembled on a Linux
box, so a fresh copy can arrive containing `sdk.dir=/home/box/Android/Sdk`, which does not
exist here and fails immediately.

---

## Build an APK

Three steps: build the web assets, copy them into the Android project, assemble.

```bash
cd /Users/ahmetbektes/WDesignspace/fichero-app
npm run build:web
npx cap sync android
```

```bash
cd /Users/ahmetbektes/WDesignspace/fichero-app/android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
./gradlew assembleDebug --no-daemon
```

The APK lands at:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on a connected phone:

```bash
~/Library/Android/sdk/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run cap:sync` wraps the first two commands, and `npm run android` also launches the app.

### Clean build

Incremental builds are ~12s; a clean one is ~35s. Use a clean build before shipping anything,
or when you suspect stale intermediates:

```bash
./gradlew clean assembleDebug --no-daemon
```

### Release build

`assembleRelease` exists but **is unsigned and untested here** — no keystore has been created
for this project. Signing setup is not covered in this document.

---

## Run the dev server

```bash
npm run dev -- --port 5199 --strictPort
```

Port **5199**, not Vite's default 5173, which is occupied by another project on this machine.
`.claude/launch.json` records the same port.

The dev server runs the real app in a desktop browser, which is useful for layout and for
everything that is not Bluetooth. **Bluetooth behaves differently there** — see below.

---

## Verify a build

Checks worth running against an APK before trusting it. Replace the bundle hashes with the
ones the build actually produced (`unzip -l` will show them).

```bash
APK=android/app/build/outputs/apk/debug/app-debug.apk

# Identity
~/Library/Android/sdk/build-tools/36.0.0/aapt2 dump badging "$APK" | grep -E "^package:|application-label:"

# The BLE plugin is registered — if this is 0, the shim silently no-ops at runtime
unzip -p "$APK" assets/capacitor.plugins.json | grep -c bluetooth_low_energy

# Permissions
~/Library/Android/sdk/build-tools/36.0.0/aapt2 dump permissions "$APK"
```

To grep the shipped JS or CSS, first list the hashed filenames:

```bash
unzip -l "$APK" | grep "assets/public/assets/"
unzip -p "$APK" assets/public/assets/index-XXXX.js | LC_ALL=C grep -a -c requestMtu
```

`strings` is unusable on this machine (the Xcode licence has not been accepted), which is why
these use `unzip -p | grep -a` instead.

---

## Troubleshooting

**Gradle fails instantly with no useful output.** `JAVA_HOME` is not set. Export Android
Studio's JBR as shown above.

**`SDK location not found`.** `android/local.properties` has the wrong `sdk.dir`, usually a
stale `/home/box/...` path from the original build machine.

**The app installs but Bluetooth does nothing.** Check that
`assets/capacitor.plugins.json` inside the APK lists
`ee.forgr.plugin.bluetooth_low_energy.BluetoothLowEnergyPlugin`. The Web Bluetooth shim checks
`Capacitor.isPluginAvailable()` and returns silently if the plugin is missing, so a broken
build looks identical to a working one until you try to connect.

**Printing connects but hangs at "sending".** The BLE write chunk size must come from the
negotiated MTU. See `negotiateMtu()` in `src/lib/fichero/client.ts`; Android stays at MTU 23
(20-byte payload) unless asked, and oversized `writeWithoutResponse` calls are silently
truncated with no error.

**Bluetooth does not work on the dev server.** Expected, and it tells you nothing about the
Android build. On localhost `Capacitor.isNativePlatform()` is false, so the native shim never
installs and the app uses the browser's own Web Bluetooth. It works in real Google Chrome
(localhost counts as a secure context) provided Chrome has Bluetooth access in
**System Settings → Privacy & Security → Bluetooth**. It does *not* work in an embedded
browser that suppresses native dialogs, because the device chooser cannot open.

---

## iOS

**Short answer: yes, this should port, and less work than you would expect.** Nothing has been
built or run on iOS yet, so everything in this section is a plan, not a verified procedure.

### What already works in our favour

The BLE plugin ships a full iOS implementation in Swift, and — the part that matters — the
MTU fix is portable **with no code changes**. On iOS the plugin implements `requestMtu` as:

```swift
return peripheral.maximumWriteValueLength(for: .withoutResponse) + 3
```

Our `negotiateMtu()` computes `min(CHUNK_SIZE, mtu - 3)`, which on iOS resolves to exactly
`maximumWriteValueLength`. CoreBluetooth negotiates MTU itself rather than exposing a request,
and the plugin papers over that difference for us. The Web Bluetooth shim is also
platform-agnostic: it gates on `isNativePlatform` and `isPluginAvailable`, both true on iOS.

The toolchain is already here: **Xcode 27.0** and **CocoaPods 1.16.2**.

### What it would take

```bash
npm install @capacitor/ios
npx cap add ios
npm run build:web && npx cap sync ios
npx cap open ios
```

Then, in Xcode:

1. Set a bundle identifier. `nl.abektes.fichero` is fine and does not clash with the Android
   application id.
2. Add the BLE usage strings to `Info.plist` — without these iOS kills the app on first
   Bluetooth call:
   ```xml
   <key>NSBluetoothAlwaysUsageDescription</key>
   <string>Connect to your label printer.</string>
   <key>NSBluetoothPeripheralUsageDescription</key>
   <string>Connect to your label printer.</string>
   ```
3. Add the app icon and splash: `npx capacitor-assets generate --ios` uses the same
   `assets/` sources already in this repo.

### What it would cost you

- **An Apple Developer account** to put it on a real device for more than 7 days. Free
  provisioning works but the build expires weekly and must be reinstalled.
- **A physical iPhone.** The simulator has no Bluetooth radio, so none of the printing path
  can be tested there — only layout.

### Known unknowns

- iOS Web Bluetooth does not exist at all, so the shim is doing *all* the work, on a code path
  nobody has run yet.
- `requestDevice` in the shim takes the first matching scan result with no chooser UI; that
  behaviour is the same on iOS but has not been observed.
- The app is designed phone-first and dark-only; it has never been opened on an iPad.

Nothing here is a blocker. The honest summary is that the protocol work is done and portable,
and the remaining effort is Apple's provisioning ceremony plus one real device to test on.
