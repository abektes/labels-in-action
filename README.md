# Labels in Action

Design a label on your phone and print it to a **Fichero D11s** (also sold as the AiYin D11s)
Bluetooth thermal label printer. Or point the camera at something and print its name.

Labels in Action (LIA) is an Android app built with Capacitor around a Svelte + Fabric.js
label designer. The same build also runs as an installable web app in Chrome.

## Features

- **Label designer** for text, QR codes, barcodes, icons, images and shapes, with undo/redo,
  label size presets, saved labels, custom fonts and CSV-driven batch printing.
- **Direct Bluetooth printing** to the D11s, with MTU-aware chunking so Android's WebView
  prints reliably.
- **Scan to label.** On-device OCR and barcode reading (Google ML Kit) turn a photo into a
  label. A live camera overlay frames objects; tap one to name it and print.
- **Optional AI naming.** On-device Gemini Nano where the phone supports it. Otherwise you
  can use your own [OpenRouter](https://openrouter.ai) key, which is stored encrypted in the
  Android Keystore and never leaves the native layer. Photos go to the cloud only after you
  add a key.
- **Works offline.** Everything except cloud naming runs on the phone, and the PWA build
  installs from Chrome on Android and desktop. The designer is translated into 18 languages;
  the newer scan and AI screens are English only for now.

## Quick start (Android)

You need Node 22+ and Android Studio installed once (for its bundled JDK and the Android
SDK). Then, with a phone plugged in and USB debugging on:

```bash
npm ci
scripts/android.sh doctor    # checks the toolchain and lists devices
scripts/android.sh run       # builds, installs and launches the app
```

No `JAVA_HOME` or `ANDROID_HOME` setup is needed; the script finds Android Studio's JDK and
your SDK. Run `scripts/android.sh` with no arguments for the other commands (`logs`,
`emulator`, `verify`, …). The emulator runs the designer, but it has no Bluetooth, so printing
needs a real phone.

Prefer Android Studio? `npm run cap:sync && npm run cap:open`, then press Run.

**First print:** switch the printer on, open the app, allow *Nearby devices* when asked, tap
the Bluetooth button, design something and print. The app connects to the first D11s it finds,
so keep only one printer powered on nearby.

## Web / PWA

```bash
npm run dev          # http://localhost:5199
npm run build:web    # static PWA in dist/; serve over HTTPS
```

Printing from a browser needs Web Bluetooth: Chrome or Edge on Android or desktop. Safari,
iOS browsers and Firefox can design labels but cannot print.

## Documentation

| | |
|---|---|
| [BUILD.md](BUILD.md) | Toolchain versions, APK size options, verifying a build, troubleshooting, iOS notes |
| [AGENTS.md](AGENTS.md) | Runbook for coding agents (and the short version for humans) |
| [vendor/docs/PROTOCOL.md](vendor/docs/PROTOCOL.md) | The D11s Bluetooth protocol |
| [DESIGN.md](DESIGN.md) / [PRODUCT.md](PRODUCT.md) | Design system and product brief |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | What is bundled, and under which licence |

## Status

A personal project, developed against a D11s and a Samsung Galaxy S24 Ultra. iOS is untested; see
[BUILD.md § iOS](BUILD.md#ios) for what a port would take. There is no signed release build
and no Play Store listing.

## Credits and licence

MIT, see [LICENSE](LICENSE). The designer comes from
[NiimBlue](https://github.com/MultiMote/niimblue) by MultiMote (MIT), via
[0xMH/fichero-printer](https://github.com/0xMH/fichero-printer), which ported it to the D11s
and documented the protocol. Bluetooth uses
[@capgo/capacitor-bluetooth-low-energy](https://github.com/Cap-go/capacitor-bluetooth-low-energy)
(MPL-2.0, unmodified). The scan feature uses Google ML Kit, which is proprietary; read
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) before redistributing an APK.

Not affiliated with Fichero or AiYin.
