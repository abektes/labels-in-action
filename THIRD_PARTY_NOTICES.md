# Third-party notices

This app embeds and redistributes the work below. Full licence texts are in
[`licenses/`](licenses/).

---

## Upstream: the label designer

### NiimBlue — MIT

**Copyright (c) 2024 MultiMote** · https://github.com/MultiMote/niimblue

The Svelte + Fabric.js label designer originates here. Full text:
[`licenses/NiimBlue-MIT.txt`](licenses/NiimBlue-MIT.txt).

### 0xMH/fichero-printer — MIT (declared)

https://github.com/0xMH/fichero-printer

The direct upstream. It ported NiimBlue's GUI to the Fichero D11s and produced the protocol
documentation in [`vendor/docs/PROTOCOL.md`](vendor/docs/PROTOCOL.md).

**A caveat, stated plainly:** as of 2026-09-21 that repository has **no `LICENSE` file**
(`/LICENSE` returns 404) and no copyright line. Its README declares the project MIT under a
`## License` heading, and `pyproject.toml` carries no licence field. So the grant is a stated
intent rather than a reproducible notice, and there is no named copyright holder whose notice
could be included verbatim.

This project proceeds on that declaration in good faith, attributes the work prominently, and
reproduces the NiimBlue notice above, which is the licence that does exist and which covers
the GUI lineage. If you are forking this, the clean fix is to ask 0xMH to add a `LICENSE`
file; it is a one-line change on their side and removes the ambiguity for everyone downstream.

---

## Bundled and redistributed in the app

### @capgo/capacitor-bluetooth-low-energy — MPL-2.0

https://github.com/Cap-go/capacitor-bluetooth-low-energy ·
[`licenses/CapgoBluetoothLowEnergy-MPL-2.0.txt`](licenses/CapgoBluetoothLowEnergy-MPL-2.0.txt)

Used **unmodified** as an npm dependency. MPL-2.0 is file-level copyleft: its terms attach to
the MPL-licensed files themselves, which this project does not alter. Our Bluetooth changes
live in `src/lib/fichero/client.ts` and `src/capacitor/ble-shim.ts` and are covered by this
project's own licence.

Per MPL-2.0 §3.2, anyone receiving a built APK can obtain the corresponding source of this
component from the upstream repository above, or from npm at the exact version pinned in
`package-lock.json`.

### Scan feature: Capacitor plugins — MIT / Apache-2.0

`@capacitor/camera` (MIT), `@capacitor-mlkit/text-recognition`,
`@capacitor-mlkit/barcode-scanning` and `@capacitor-mlkit/genai-prompt` (all
Apache-2.0). Used unmodified as npm dependencies; the Gradle-level model
selection is described in `BUILD.md`.

### Live overlay: EfficientNet-Lite2 — Apache-2.0

`android/app/src/main/assets/efficientnet_lite2.tflite`, 23.2 MB, retrieved
2026-09-21 from Google's MediaPipe model hosting
(`storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite2/float32/1/`).

An ImageNet-1k image classifier, bundled unmodified and used as ML Kit's custom
classifier so the live camera can name what it sees offline. Apache-2.0, so
unlike the ML Kit recognisers below this one is genuinely free software.

### Scan feature: Google ML Kit — proprietary, not open source

**Read this before redistributing a built APK.** The plugins above are open
source, but the recognisers they call are not:

| Component | Terms |
|---|---|
| `com.google.mlkit:*` | [ML Kit Terms of Service](https://developers.google.com/ml-kit/terms) |
| `com.google.android.gms:play-services-mlkit-*` | [Android Software Development Kit License](https://developer.android.com/studio/terms.html) |
| Gemini Nano, via Android AICore | [ML Kit Terms of Service](https://developers.google.com/ml-kit/terms) · [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) |

Both are proprietary Google licences. Consequences worth stating plainly:

- **The source in this repository is MIT. A built APK is not entirely free
  software**, because it either embeds Google's recognition engines
  (`libmlkit_google_ocr_pipeline.so`, `libbarhopper_v3.so`) or depends on Google
  Play Services to deliver them.
- Distribution channels that require fully free binaries — F-Droid most
  obviously — will reject a build with the Scan feature enabled.
- **AI object naming adds no model to the APK** — only ~1.3 MB of
  `com.google.mlkit:genai-prompt` client classes. The model itself is Gemini
  Nano inside Android's AICore system service, which is proprietary Google
  software already on the phone (or not: most phones cannot run it, and the
  tray says so). Nothing is sent off the device either way.
- Nothing about this affects the designer, the BLE printing path, or the PWA
  build. The scan tray is gated on the native platform, so the web build
  contains none of it.

If that trade is unacceptable for your fork, remove the three `@capacitor-mlkit`
dependencies and the `scan` tray; nothing else in the app depends on them.

### Noto Sans and Noto Sans Mono — SIL Open Font License 1.1

Copyright 2022 The Noto Project Authors ·
[`licenses/NotoSans-OFL-1.1.txt`](licenses/NotoSans-OFL-1.1.txt) ·
[`licenses/NotoSansMono-OFL-1.1.txt`](licenses/NotoSansMono-OFL-1.1.txt)

Self-hosted via `@fontsource-variable/*` and shipped inside the app. Unmodified, and not sold
on their own, as the OFL requires.

### Material Icons — Apache License 2.0

https://github.com/marella/material-icons ·
[`licenses/MaterialIcons-Apache-2.0.txt`](licenses/MaterialIcons-Apache-2.0.txt)

The icon webfont and its codepoint map are bundled and shipped. Used unmodified.

---

## Other dependencies

Capacitor, Svelte, Vite, Bootstrap, Fabric.js, zod, dayjs, toastify-js, qrcode-generator,
@popperjs/core and @formatjs/intl-localematcher are **MIT**; `d3-dsv` is **ISC**; `tslib` is
**0BSD**; TypeScript is **Apache-2.0**. Their notices travel with the packages in
`node_modules/`; run `npm ls` against `package-lock.json` for exact pinned versions.

---

## Trademarks

"Fichero" is a product name of Action, and the hardware is an AiYin D11s made by Xiamen Print
Future Technology. This project is **not affiliated with, endorsed by, or supported by** any
of them. Those names are used only to identify the hardware this software is compatible with.

## The app icon

`assets/source-mark.jpg` and the launcher icons derived from it were generated with an AI
image tool. In several jurisdictions, including the United States, purely AI-generated images
attract no copyright protection, so no ownership is claimed over them.
