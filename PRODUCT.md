# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Delivered only as an installed Android app (Capacitor 8 WebView, package `nl.abektes.fichero`).
Per Impeccable's platform rule a native wrapper around a web GUI stays `web`, so the design
language is web — but the phone is the only screen that ships, and Android affordances
(hardware back, safe areas, one-handed reach, 44px+ touch targets) are real constraints.

## Users

A single user — the project owner — labelling their own things. No second audience, no
onboarding for strangers, no shared-device or multi-role concerns. The user already knows the
printer and the tool set, so the design optimizes for speed and reach on a phone held in one
hand, not for teaching.

Confirmed: Android phone only. Tablet and desktop web are explicitly **not** targets, so the
inherited Bootstrap desktop grid is scaffolding to remove, not a constraint to preserve.

## Product Purpose

Design a label on a phone and print it to a Fichero D11s / AiYin D11s BLE label printer.
The MVP job, stated in the README, is: install on an Android phone, pair the printer, design a
simple text label, print. Success is that fast path completing without the user hunting through
tools.

## Positioning

A port of the MIT-licensed [0xMH/fichero-printer](https://github.com/0xMH/fichero-printer) web
GUI — a desktop browser tool that depends on Web Bluetooth — into a self-contained Android app
that works where desktop Web Bluetooth cannot. The Capgo BLE shim plus negotiated-MTU chunked
writes are what make the D11s reachable from a phone at all.

## Operating Context

Used standing up, one-handed, next to the printer, in short bursts: pick or type label text,
preview, print, repeat. The printer must be powered on and in range, Bluetooth on, and on many
Android builds Location enabled for BLE discovery to work. Printing is a physical act with
latency — the app is waiting on hardware, and the user is watching the printer, not the screen.

## Capabilities and Constraints

Core path: text label → preview → print.

Advanced tools exist and must all stay reachable, but behind progressive disclosure rather than
at the top level: barcode, QR code, vector shapes, image/icon picker, CSV data merge, ZPL
import, custom fonts, saved labels, label presets, variables, undo/redo, object alignment and
positioning.

Hardware and protocol constraints that design must respect:

- Printhead is 96 px (12 bytes/row); label geometry is bounded by it.
- Label types: WithGaps, BlackMarkGap, HeatShrinkTube.
- Density 0–2; two print speeds.
- BLE writes must be chunked to the negotiated MTU — see `src/lib/fichero/client.ts`.
- `requestDevice` has no chooser UI: it silently takes the first scan result matching
  namePrefix `FICHERO` or `D11s_`.
- Print is a long, blocking, failure-prone operation (cover open, no paper, overheated,
  out of range) and needs honest progress and error states.

Stack is fixed by the existing codebase: Svelte 5 (runes), Bootstrap 5.3, Sass, Vite 7,
fabric.js 6 for the canvas, Capacitor 8.

## Brand Commitments

Name is **Labels in Action**, short form **LIA** (set by the user, 2026-09-19). The short form
is the in-app mark, set as a typed plate in the notation face; the long name is the Android
launcher label and document title. The previous name "Fichero Labels" and the cyan
`public/logo.png` mark were retired at the user's request — the logo is no longer rendered.

The package id `nl.abektes.fichero` is unchanged, because changing it would orphan the
installed app.

Upstream MIT attribution and the `THIRD_PARTY_NOTICES.md` / source link must be preserved.

## Evidence on Hand

- Working app with a verified end-to-end print to real D11s hardware.
- Reference screenshot of the current UI supplied by the user.
- 18 shipped locales under `src/locale/dicts/`; UI copy is translated via `$tr()`, so new
  user-facing strings need locale keys rather than hardcoded English.
- No user research, analytics, testimonials, or usage data exist. Do not fabricate any.

## Product Principles

1. **The fast path is text → print.** Everything else earns its place by not slowing that down.
2. **One hand, standing, next to a printer.** Reach and touch-target size outrank density.
3. **The hardware is the real UI.** Connection and print state must be legible at a glance,
   because the user's attention is on the printer.
4. **Depth is kept, not deleted.** Every upstream capability stays reachable; only its
   prominence changes.
5. **Inherited desktop scaffolding is evidence, not authority.** The Bootstrap grid reflects a
   browser tool, not this product.

## Accessibility & Inclusion

No user-specific requirement was established. Baseline still applies: legible contrast in the
dark theme, touch targets sized for a phone, and state never signalled by color alone (the
current connection indicator relies on a red icon).
