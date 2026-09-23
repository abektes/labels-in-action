# Fun names + cloud naming — design

Date: 2026-09-23 · Status: approved via `/goal` (user asked for the plan and build in one go)

## Problem

The live camera's **Name this** button only exists when Gemini Nano is AVAILABLE,
and the user's Galaxy S24 Ultra will never report that. So on the one phone that
matters, nothing names objects beyond ImageNet guesses. The user also wants a
playful mode: affectionate nicknames ("Sir Drips-a-Lot") instead of, or next to,
plain names ("Kettle").

Both need a vision LLM the user already pays for: OpenRouter. That raises the
question the user asked directly: **where does the API key live?**

## Decision: the key

| Option | Verdict |
|---|---|
| Baked into the build (env var, `BuildConfig`) | **No.** The repo is public and any APK can be unzipped; the key would be everyone's. |
| Our own proxy server holding one key | Most secure for a store app, but it is a server to run, pay for and rate-limit against abuse. Overkill for a personal, open-source app. Revisit if LIA ever ships to strangers. |
| **User pastes their own key in the app** | **Chosen.** Standard for BYOK open-source tools. Safe if storage is done properly: |

How the key is stored and used (Android only; scanning is native-only already):

- A new app-local Capacitor plugin, `CloudNaming` (`android/.../cloudnaming/`).
- The key is encrypted with **AES-256-GCM** under a key held in the **Android
  Keystore** (hardware-backed where the phone has it, never exportable), and
  only the ciphertext is written to a private `SharedPreferences` file.
- That file is **excluded from Android backup** (backup rules XML). A restored
  ciphertext could not be decrypted on a new phone anyway, because Keystore keys
  do not travel.
- **The key never enters the WebView.** JS calls `CloudNaming.complete(body)`; the
  native side adds the `Authorization` header and posts to a hard-coded
  `https://openrouter.ai/api/v1/...` URL. JS can learn only `configured` and a
  hint (`sk-or-…a1b2`). A bug or injection in the web layer cannot read the key
  or send it anywhere else.
- The settings screen tells the user to **create a dedicated key with a credit
  limit** on openrouter.ai, which caps what a leaked key can cost. That limit
  is the real safety net.

## Feature

### Settings: "AI naming" modal (⋯ menu)

- Explains what it is in two sentences: photos go to OpenRouter and the chosen
  model's provider; it costs a fraction of a cent per name; it's billed to your key.
- Key field (password input, paste) → **Save & test**. The test calls
  `GET /api/v1/key`, which confirms the key works and returns its credit
  limit/usage; shown as "Key works · $0.02 of $5.00 used".
- Once saved: masked hint + **Remove key**.
- Model: select with `z-ai/glm-5.3-flash` (default, cheap, vision) and
  `deepseek/deepseek-v4.1-flash`, plus a free-text "other model id" field.
- **Fun names** switch (default off). Also togglable on the camera screen.

Non-secret settings (`cloudModel`, `funNames`) go in the existing persisted
`appConfig` (zod schema, optional fields).

### Naming: who answers

| Fun off | Fun on |
|---|---|
| Nano if AVAILABLE (free, on-device) → else cloud if key set → else no button | Cloud if key set → else no fun (toggle explains why) |

Nano stays plain-only: it's small and on-device, and the user's phone cannot run it
to tune a joke prompt against.

### What the cloud returns

One call, JSON: `{"plain": [3], "fun": [3]}` when fun is on, `{"plain": [5]}`
when off. Plain names: at most 3 words, same brief as the Nano prompt. Fun:
at most 22 characters (a 40×12 mm label), affectionate, specific to what is
visible (colour, wear, shape, use); mix puns, royal titles, pet names, dramatic
titles; **never about people, never mean, crude or sexual**.

Request: `temperature` 1.0 fun / 0.3 plain, `max_tokens` 300,
`reasoning: {enabled: false}` (flash models otherwise spend the budget
thinking), image downscaled to at most 768 px on the long edge, JPEG 0.8.

The parser is tolerant: JSON object → JSON array → lines (reusing
`parseLabelOptions`). Fun candidates are length-capped, deduped against plain.

### Where it shows

- **Live overlay**: the **Name this** button appears when any namer is available.
  A **Fun** toggle sits next to it (only when a key is set). Fun chips lead the
  list with a distinct icon (`mood`) and tag. Tap = print, as today.
  With no key and no Nano: a one-line hint pointing to ⋯ → AI naming.
- **Scan tray (photo)**: a cloud provider joins the scan when a key is set;
  fun chips appear when the setting is on. The privacy note stops claiming
  "nothing leaves your phone" whenever the cloud is in the run.
- `LabelSuggestion` gains `fun?: boolean`.

### Errors (from native HTTP status)

401 → "OpenRouter rejected the key." · 402 → "Out of OpenRouter credits." ·
429 → "Rate-limited. Try again in a moment." · timeout (30 s) / offline →
"Couldn't reach OpenRouter." · other → status + message. Raw errors go to the
existing Scan diagnostics panel.

## Out of scope (YAGNI)

- Two-line "nickname / real name" labels (needs canvas layout work, later).
- Style picker (pun/royal/pet) — the model mixes them.
- iOS / web (PWA) cloud naming. Web would mean storing a key in localStorage;
  not doing that.
- Our own proxy server.

## Testing

- Unit (vitest, new dev dependency): response parser (well-formed JSON, fenced
  JSON, lines, over-long fun names, duplicates, people/insult cannot be tested
  by us — prompt only), namer-choice rules, error-message mapping.
- `npm run check` (svelte-check) and `vite build`.
- Android: `./gradlew assembleDebug` compiles the plugin.
- **Not verifiable here: real phone.** Hardware checklist in the plan.
