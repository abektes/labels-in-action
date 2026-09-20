# Building Labels in Action

How to get from source to an installable app, on Android today and on iOS or as a PWA if you
want to take it there. Every command in the Android sections was run and verified; anything
untested is labelled as such.

Paths below assume you are in the repository root. Replace `~/Library/Android/sdk` if your
Android SDK lives elsewhere (that is the macOS default; on Linux it is usually
`~/Android/Sdk`).

- [Toolchain](#toolchain)
- [First-time setup](#first-time-setup)
- [Build an APK](#build-an-apk)
- [Run the dev server](#run-the-dev-server)
- [Verify a build](#verify-a-build)
- [Troubleshooting](#troubleshooting)
- [iOS](#ios)
- [PWA](#pwa)

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

You do **not** need a separately installed JDK. Android Studio bundles one (the JBR), and the
commands below point at it explicitly. If you have no system Java — which is common, and was
the case here — `java -version` fails, `JAVA_HOME` is empty, and Gradle dies before printing
anything useful. Exporting `JAVA_HOME` as shown is the fix, and it is the single most common
cause of a build that appears to do nothing.

---

## First-time setup

```bash
npm install
```

Then create or check `android/local.properties`, pointing at **your** SDK:

```properties
sdk.dir=/Users/YOU/Library/Android/sdk
```

This file is gitignored and machine-specific, so it is normal for it to be missing on a fresh
clone — Android Studio writes it for you when you open the project once. Watch out for a copy
inherited from someone else's machine: this project was originally assembled on a Linux box
and arrived holding `sdk.dir=/home/box/Android/Sdk`, which fails immediately.

---

## Build an APK

Three steps: build the web assets, copy them into the Android project, assemble.

```bash
npm run build:web
npx cap sync android
```

```bash
cd android
# macOS; on Linux the JBR is under the Android Studio install dir, e.g.
#   /opt/android-studio/jbr
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

`assembleRelease` exists but **is unsigned and untested** — no keystore has been created for
this project, and signing setup is out of scope here. If you are shipping a release build,
also revisit the splash screen assets: they are 2732px PNGs across 26 density folders and
account for roughly 2.6 MB of the APK.

---

## Run the dev server

```bash
npm run dev        # http://localhost:5199
npm run preview    # serves a production build on http://localhost:5200
```

Port **5199** rather than Vite's default 5173, because 5173 was taken by another project
during development. Any free port works; `.claude/launch.json` records this one.

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

These use `unzip -p | grep -a` rather than `strings` deliberately: on macOS `strings` ships
with the Xcode command line tools and refuses to run until the Xcode licence is accepted,
which is an unhelpful failure in the middle of a build check.

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

### What you will need

- **A Mac with Xcode.** There is no way around this; iOS apps cannot be built elsewhere.
- **A physical iPhone.** The simulator has no Bluetooth radio, so none of the printing path
  can be tested there — only layout.
- **An Apple ID.** Free provisioning is enough to build onto your own device, but the app
  expires after **7 days** and must be reinstalled. A paid **Apple Developer Program**
  membership ($99/yr) removes the expiry and is required to distribute to anyone else.

If you only want to run it on your own phone, free provisioning is genuinely fine — you do
not need to pay Apple to try this.

### Known unknowns

- iOS Web Bluetooth does not exist at all, so the shim is doing *all* the work, on a code path
  nobody has run yet.
- `requestDevice` in the shim takes the first matching scan result with no chooser UI; that
  behaviour is the same on iOS but has not been observed.
- The app is designed phone-first and dark-only; it has never been opened on an iPad.

Nothing here is a blocker. The honest summary is that the protocol work is done and portable,
and the remaining effort is Apple's provisioning ceremony plus one real device to test on.

---

## PWA

**Implemented.** The app builds as an installable PWA, which covers Android and desktop
without an install step — but it can never cover iOS. That is the exact inverse of where the
native app is needed, which is why the two are complementary rather than alternatives.

### Why it would work at all

The thing that makes this app need a native wrapper on Android is that **Android System
WebView has no Web Bluetooth** — which is what the Capgo shim exists to paper over. But
**Chrome on Android is not WebView**, and it ships Web Bluetooth. So in a browser the app can
talk to the printer directly, with no shim and no plugin.

The code already handles this. `negotiateMtu()` in `src/lib/fichero/client.ts` branches on
`Capacitor.isNativePlatform()`, and the non-native branch keeps the full `CHUNK_SIZE`, which
is correct: Chrome negotiates MTU itself and enforces its own write limits. The whole MTU
workaround is Android-WebView-specific and simply does not apply.

You would also get a **better connect experience** than the native app has. The Capgo shim has
no chooser and silently takes the first matching scan result; Chrome shows a real device
picker.

### Support, honestly

| Platform | Web Bluetooth | Verdict |
|---|---|---|
| Chrome / Edge on Android | yes | **works, including installed to the home screen** |
| Chrome / Edge / Opera on desktop | yes | works |
| **Safari, and every browser on iOS** | **no** | **design only, cannot print** |
| Firefox | no | design only |

Apple has never shipped Web Bluetooth, and iOS requires every browser to use WebKit, so no
iOS browser can print — not Chrome on iOS either. This is a platform decision, not something
a polyfill can fix.

### Status: implemented

PWA support is wired up via `vite-plugin-pwa` and builds as part of `npm run build:web`:

```
PWA v1.3.0
mode      generateSW
precache  18 entries (1424.73 KiB)
files generated
  dist/sw.js
  dist/workbox-<hash>.js
```

The precache covers the entire app — every JS chunk, the CSS, all four bundled fonts
(including the 128 KB Material Icons set), both PWA icons, `index.html` and the manifest — so
once installed it runs with no network at all.

The manifest is generated by the plugin from `vite.config.ts`; there is no hand-written
manifest file any more. It declares `standalone`, portrait, the kraft theme colours, and
192/512 icons plus a maskable variant.

**The service worker is registered in a browser only.** `src/index.ts` gates on
`Capacitor.isNativePlatform()`, because inside the Capacitor WebView the app is already served
from local assets and a second cache layer would only add a way to go stale against the
installed APK. The `sw.js` file still rides along inside the APK, unregistered and harmless.

### Serving it

```bash
npm run build:web
npm run preview          # serves dist/ on http://localhost:5200
```

For a real deployment any static host works; the build output is just files. **It must be
HTTPS** — Web Bluetooth and service workers both require a secure context. `localhost` is
exempt, which is why `npm run preview` is enough for local testing.

If you deploy somewhere other than a domain root, set Vite's `base` and the manifest
`start_url`/`scope` to match.

### Verify it yourself

**I could not verify service worker registration in this environment.** The generated `sw.js`
is served correctly (HTTP 200, `text/javascript`, valid Workbox body) and parses cleanly under
`node --check`, but the embedded browser available here refuses to register any service
worker — the same restriction that suppresses its native dialogs and blocks the Bluetooth
chooser. The configuration is sound and the artifacts are correct; actual registration is
unconfirmed.

To check it in real Chrome:

1. `npm run build:web && npm run preview`
2. Open `http://localhost:5200` in Chrome
3. DevTools → **Application** → **Service Workers** should show `sw.js` as *activated*
4. DevTools → **Application** → **Manifest** should show no installability errors
5. An install icon should appear in the address bar

### The catch worth knowing before you start

An installed PWA and the APK would be **two separate installs with separate storage**. Saved
labels, custom fonts and presets live in `localStorage`, so they do not travel between them.
If you ship both, say so plainly, or people will lose work assuming they are the same app.
