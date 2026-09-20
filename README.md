# Labels in Action (LIA)

Capacitor Android wrapper around the [0xMH/fichero-printer](https://github.com/0xMH/fichero-printer) web GUI (MIT) for the Fichero D11s / AiYin D11s BLE label printer.

**App name:** Labels in Action (short mark: LIA)  
**Package id:** `nl.abektes.fichero`

> **Building?** See **[BUILD.md](BUILD.md)** for the current, verified build procedure,
> including the Java and SDK setup this project needs, how to verify an APK, and notes on
> porting to iOS. The Prerequisites and First-time setup sections below are the original
> upstream notes and are partly stale.

MVP goal: install on an Android phone, pair the printer, design a simple text label, print.

## Prerequisites (Mac)

- Node.js **22+** (Capacitor 8 CLI requirement)
- npm 10+
- [Android Studio](https://developer.android.com/studio) (Ladybug/Meerkat or newer is fine)
- Android SDK with:
  - Android SDK Platform **35** (or whatever `android/variables.gradle` / AGP asks for)
  - Android SDK Build-Tools
  - A device or emulator; **physical phone recommended for BLE**
- On the phone: enable **Developer options** + **USB debugging** (for `adb install` / Android Studio Run)

```bash
node -v   # should be v22+
java -version
echo $ANDROID_HOME
```

Typical Mac paths after Android Studio install:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

## First-time setup

```bash
cd /Users/ahmetbektes/WDesignspace/fichero-app
npm install
npm run build:web
npx cap sync android
```

Open the native project:

```bash
npx cap open android
# or: open -a "Android Studio" android
```

In Android Studio: wait for Gradle sync, then **Run** on a connected phone.

### CLI alternative (no Studio UI)

```bash
npm run build:web && npx cap sync android
npx cap run android
# or build a debug APK:
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Install debug APK on phone

1. USB cable, USB debugging on.
2. `adb devices` should list the phone.
3. `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`
4. Or copy the APK to the phone and open it (allow “Install unknown apps” for Files/Chrome).

Wireless: pair via `adb pair` / Android Studio Device Manager if preferred.

## Using the app

1. Turn on the Fichero / D11s printer (BLE name like `FICHERO_…` or `D11s_…`).
2. Open **Fichero Labels**.
3. Grant **Nearby devices / Bluetooth** (and **Location** on Android 11 and older if prompted).
4. Tap the Bluetooth connect control in the GUI.
5. Add text on the canvas, print.

### BLE / WebView caveats (honest)

| Approach | BLE? | Capacitor plugins? | Notes |
|---|---|---|---|
| **Android System WebView** | No native Web Bluetooth | Yes | Default Capacitor host. `navigator.bluetooth` is missing. |
| **Chrome Custom Tabs / TWA** | Sometimes (Chrome Web Bluetooth) | **No** bridge | Not used — would lose Cap plugins. |
| **This MVP: Capgo BLE + `shimWebBluetooth()`** | Yes (native) | Yes | Installs a JS shim so the upstream GUI keeps calling `navigator.bluetooth`. |

**Capgo shim limitation:** `requestDevice()` connects to the **first matching** scanned device (name prefix `FICHERO` / `D11s_`), not a Chrome-style picker. Keep only one printer nearby for MVP.

**Permissions:** Android 12+ uses `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT`. Older Android still needs location permission for BLE scans (OS rule, not optional).

## Dev loop

```bash
# After web/src changes:
npm run build:web && npx cap sync android
# Then re-run from Android Studio, or:
npx cap run android
```

Live reload against a local Vite server is possible later (`capacitor.config.ts` `server.url`); MVP ships built assets in `android/…/assets/public`.

## Credits

Web GUI and protocol: [0xMH/fichero-printer](https://github.com/0xMH/fichero-printer) (MIT). See `THIRD_PARTY_NOTICES.md` and `vendor/`.

## Out of scope (this pass)

- iOS
- Play Store publishing
- Native protocol rewrite
- UX polish / new design system
