---
name: Labels in Action
description: A phone-sized catalogue drawer where a label is a card you file, not a canvas you draw on.
colors:
  stamp: "#b8352c"
  stamp-deep: "#8f2721"
  drawer-deep: "#241d16"
  drawer: "#33291f"
  drawer-raised: "#433527"
  drawer-high: "#54432f"
  drawer-edge: "#6b573d"
  card: "#f2e9d5"
  card-bright: "#fbf6ea"
  card-sunk: "#e6dbc2"
  card-rule: "#7d9bb5"
  control-bg: "#ece2cb"
  control-border: "#b9a684"
  ink-primary: "#f0e6d2"
  ink-secondary: "#bda882"
  ink-tertiary: "#8a7962"
  ink-muted: "#5c4c39"
  ink-disabled: "#a2907a"
  ink-on-card: "#2a241c"
  ink-on-card-2: "#6b5f4e"
  withdrawn: "#9b8a70"
  status-ok: "#7d9a55"
  status-warn: "#c2842c"
  status-danger: "#d4503f"
typography:
  wordmark:
    fontFamily: "Noto Sans Mono Variable, ui-monospace, monospace"
    fontSize: "0.8rem"
    fontWeight: 700
    letterSpacing: "0.12em"
  notation:
    fontFamily: "Noto Sans Mono Variable, ui-monospace, monospace"
    fontSize: "0.7rem"
    fontWeight: 400
    letterSpacing: "0.01em"
    fontFeature: "tnum 1"
  tray-title:
    fontFamily: "Noto Sans Mono Variable, ui-monospace, monospace"
    fontSize: "0.68rem"
    fontWeight: 600
    letterSpacing: "0.1em"
  commit-label:
    fontFamily: "Noto Sans Variable, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    letterSpacing: "0.03em"
  body:
    fontFamily: "Noto Sans Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Noto Sans Variable, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 400
    letterSpacing: "0.02em"
  caption:
    fontFamily: "Noto Sans Mono Variable, ui-monospace, monospace"
    fontSize: "0.62rem"
    fontWeight: 400
    letterSpacing: "0.1em"
rounded:
  sm: "2px"
  md: "3px"
  lg: "4px"
spacing:
  hair: "0.15rem"
  xs: "0.3rem"
  sm: "0.45rem"
  md: "0.6rem"
  lg: "0.75rem"
  xl: "1rem"
components:
  commit-key-print:
    backgroundColor: "{colors.stamp}"
    textColor: "#ffffff"
    typography: "{typography.commit-label}"
    rounded: "{rounded.sm}"
    padding: "0 0.85rem"
    height: "58px"
  commit-key-connect:
    backgroundColor: "{colors.drawer-raised}"
    textColor: "{colors.ink-primary}"
    typography: "{typography.commit-label}"
    rounded: "{rounded.sm}"
    padding: "0 0.85rem"
    height: "58px"
  commit-key-disabled:
    backgroundColor: "{colors.drawer-raised}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.commit-label}"
    rounded: "{rounded.sm}"
    height: "58px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0.3rem 0.35rem"
    height: "58px"
  tab-on:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-on-card}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "58px"
  ghost-key:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    size: "48px"
  ghost-key-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.ink-disabled}"
    rounded: "{rounded.sm}"
    size: "48px"
  status-plate:
    backgroundColor: "{colors.drawer-deep}"
    textColor: "{colors.ink-primary}"
    typography: "{typography.notation}"
    rounded: "{rounded.sm}"
    padding: "0.28rem 0.55rem"
    height: "48px"
  card-mat:
    backgroundColor: "{colors.card-bright}"
    textColor: "{colors.ink-on-card}"
    rounded: "{rounded.sm}"
    padding: "0.55rem"
  tray:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-on-card}"
    rounded: "0"
    padding: "0.6rem 0.75rem 0.85rem"
  input-field:
    backgroundColor: "{colors.control-bg}"
    textColor: "{colors.ink-on-card}"
    typography: "{typography.notation}"
    rounded: "{rounded.sm}"
  input-field-focus:
    backgroundColor: "{colors.card-bright}"
    textColor: "{colors.ink-on-card}"
    rounded: "{rounded.sm}"
  input-field-disabled:
    backgroundColor: "{colors.card-sunk}"
    textColor: "{colors.ink-on-card-2}"
    rounded: "{rounded.sm}"
  withdraw-key:
    backgroundColor: "{colors.drawer-raised}"
    textColor: "{colors.withdrawn}"
    rounded: "{rounded.sm}"
---

# Design System: Labels in Action

## Overview

**Creative North Star: "The Catalogue Drawer"**

A label exists so you can find the thing again. The app is therefore the drawer you file it in, not a canvas you draw on. Kraft drawer board is the ground; the label under design is an index card lying on that board, and it is the brightest surface and the only true black ink on screen. Every other surface is furniture: raised kraft for keys, a typed plate for the drawer front, a card-stock tray that pulls out from under the card. Nothing floats over the artifact.

Density is low by intent and by device. This ships as a single Android phone app used one-handed, standing at the printer, so reach and target size outrank information density: tabs are 62x58, the commit key 109x58, every ghost and rail control at least 48px. The catalogue ships its measurements in a monospaced notation face with tabular figures, because a dimension that shifts width as it updates is a dimension you cannot read at a glance.

The world refuses the floating-toolbar mobile editor: no palette hovering over the work, no bottom sheet that shoves the card off screen. Tool surfaces slide out beneath a card that never moves. The shipped build also collapses Connect and Print into one state-dependent key in a single commit slot, so there is exactly one place a print begins, and the status rail carries state only.

**Key Characteristics:**
- Kraft board ground, index-card stock for the artifact, stamp red for commit and nothing else
- Square-cut stock: 2-4px radii, hairline rules, no soft pill geometry
- The card never moves; trays pull out beneath it (measured displacement 0px)
- Monospaced notation with tabular figures for every measurement, count and device id
- One authored motion: the drawer pull. No fades, no springs, no ambient animation
- Touch floor 48px, primary controls 58px

## Colors

A kraft-and-card-stock palette: warm dark board, cream stock, one saturated red that means commit.

### Primary
- **Stamp Red** (`{colors.stamp}`): The rubber-stamp accent. It appears on exactly one control at a time — the Print key when a printer is connected — plus the caret, the selection highlight, the focus ring, and the progress fill. Red in this world means *print*, and only print.
- **Stamp Red Deep** (`{colors.stamp-deep}`): The pressed and hover state of the stamp key, and its border at rest, reading as ink pressed harder into the stock.

### Neutral
- **Drawer Deep** (`{colors.drawer-deep}`): The body ground and the recessed plate behind the wordmark and status strip. The darkest surface in the world.
- **Drawer** (`{colors.drawer}`): The board itself, carrying a fibrous kraft texture built from two crossed repeating-linear-gradients at 94deg and 2deg — a fibrous ground, never a flat fill.
- **Drawer Raised / High / Edge** (`{colors.drawer-raised}`, `{colors.drawer-high}`, `{colors.drawer-edge}`): Drawer furniture in ascending light — secondary keys, their hover, and the brass-frame hairline that separates rail from board and tabs from board.
- **Card Stock** (`{colors.card}`): The tray, dropdown menus, modals, and a pulled-forward drawer tab. Anything you read from or write on is card stock.
- **Card Bright** (`{colors.card-bright}`): The mat the label canvas sits on and the focused input field. The brightest surface on screen; reserved for the artifact and for the field you are typing in.
- **Card Sunk** (`{colors.card-sunk}`): Disabled field fill and hovered menu rows — stock pressed down rather than greyed out.
- **Ruled Blue** (`{colors.card-rule}`): The hairline blue of ruled stock. Carries the canvas edge (at 38% alpha) and the printhead registration ticks, which are dashed guides set *outside* the label area so they never read as artwork.
- **Ink on Kraft** (`{colors.ink-primary}`, `{colors.ink-secondary}`, `{colors.ink-tertiary}`, `{colors.ink-muted}`): The four-step warm ink ramp on the board. Primary for live text and the connected device name, secondary for filing lines and tab labels, tertiary and muted for separators and inert furniture.
- **Ink Disabled** (`{colors.ink-disabled}`): A dedicated token, not an opacity. Undo and redo start disabled, so this is the first ink the user reads; it holds 4.68:1 on the board while still reading as unavailable.
- **Ink on Card** (`{colors.ink-on-card}`, `{colors.ink-on-card-2}`): Ink on stock — body and secondary. The wordmark sets at 12.72:1 on card stock.
- **Withdrawn** (`{colors.withdrawn}`): Destructive actions. A card struck from the catalogue is greyed and ruled through, never painted in the commit colour.

### Semantic
- **Status OK / Warn / Danger** (`{colors.status-ok}`, `{colors.status-warn}`, `{colors.status-danger}`): The live dot, the faltering-heartbeat state, and toast errors. Muted to sit inside the kraft world rather than puncture it.

### Named Rules
**The One Red Rule.** Stamp red marks commit and only commit. Delete, disconnect, and every destructive path use `withdrawn` grey with a strikethrough. If red appears on a control that does not print, it is a bug.

**The Brightest-Is-The-Artifact Rule.** The label card is the brightest surface and carries the only true black on screen. No chrome may out-brighten it; if a panel needs more light than the card, the panel is wrong.

**The Not-Alone Rule.** State is never carried by colour alone. The live dot changes shape as well as hue (6px circle when connected, 1px-radius square when faltering, hollow ring when empty), the disabled commit key switches to a dashed border, and every state carries a text label.

**The Contrast Floor.** Measured on the shipped build: filing line 6.15:1, tab label 6.15:1, status 7.2:1, commit key 9.54:1, wordmark on stock 12.72:1, disabled ghost 4.68:1. Nothing ships below 4.5:1.

## Typography

**Body/UI Font:** Noto Sans Variable (with system-ui, sans-serif) — self-hosted, weights 100-900, Latin and Cyrillic subsets
**Notation Font:** Noto Sans Mono Variable (with ui-monospace, monospace) — self-hosted, weights 100-900

**Character:** Two neutral, wide-covering Noto faces, both bundled offline because the app runs in a WebView with no network guarantee. The sans carries speech; the mono carries the catalogue — anything a filing clerk would type on a card rather than say out loud.

### Hierarchy
- **Wordmark** (mono, 700, 0.8rem, 0.12em tracking): "LIA" set as a typed card-stock plate at the left end of the drawer label. The mark is typography, not an image.
- **Commit Label** (sans, 600, 0.78rem, 0.03em): The one primary key. It always carries a word — Connect, Pairing…, Print — never an icon alone.
- **Tab Label** (sans, 400, 0.72rem, 0.02em): The five drawer tabs. Weight rises to 600 and ink flips to card ink when a tab is pulled forward.
- **Notation** (mono, 400, 0.7rem, 0.01em, tabular figures): Dimensions, counts, device ids, build stamps. Applied via the `.notation` class, which sets `font-variant-numeric: tabular-nums` and `"tnum" 1`.
- **Filing Line** (sans, 0.7rem, 0.06em, uppercase): The fixed strip under the card — `232 × 96 PX · FEEDS LEFT`. Same facts, same slots, on every card.
- **Tray Title** (mono, 600, 0.68rem, 0.1em, uppercase): The ruled-off heading of an open tray.
- **Caption** (mono, 0.62-0.65rem, 0.1em): Menu field labels and the colophon.

### Named Rules
**The Notation Rule.** Every measured quantity — millimetres, pixels, densities, counts, device ids, commit hashes — sets in the mono face with tabular figures. A number that changes width as it updates is unreadable at arm's length.

**The Named Key Rule.** Any control that commits or changes device state carries a word. Icon-only is permitted only for reversible, self-evident furniture (undo, redo, the overflow menu).

**The Bundled Face Rule.** No webfont is fetched at runtime. Both families are self-hosted variable woff2; the system stack is a fallback, never the shipped face.

## Layout

A single full-height column (`min-height: 100dvh`) in three fixed bands: the drawer label rail at top, the board filling all remaining height, the tab rail plus commit slot pinned to the bottom. Safe-area insets are honoured top and bottom (`env(safe-area-inset-*)`) because the only shipped device class is an Android phone.

The board is the load-bearing invariant. It is `flex: 1; min-height: 0; overflow: hidden` with `position: relative`, and its height never changes. The stage inside it is `position: absolute; inset: 0`, centring the card with 1rem / 0.75rem / 1.25rem padding. The tray is `position: absolute; bottom: 0` with `max-height: 41%` of the board — capped so the card stays fully visible while its own controls are open. Measured card displacement on tray open is 0px; gap from card to the tallest (Text) tray is 49px.

The card scales to the stage via `fitToStage() = min(availW/lw, availH/lh, 3)`, applied as a CSS-only zoom (the canvas backing store stays at true label pixels, so what is drawn is what prints). `image-rendering: pixelated` is applied only when the zoom is within 0.01 of a whole number, because fractional nearest-neighbour would misreport the print.

Spacing rhythm is fine and rem-based: 0.15 / 0.3 / 0.45 / 0.6 / 0.75 / 1rem. Gaps between sibling controls are 0.25-0.45rem; tray and rail padding is 0.4-0.85rem.

Touch sizing is a floor, not a suggestion: tabs 62x58, commit key 109x58, ghost undo/redo 48x48, every rail control at least 48px. The tab row scrolls horizontally with the scrollbar hidden when tabs overflow; it never wraps and never truncates a label.

There are no breakpoints. One device class ships, and the layout is fluid within it.

## Elevation & Depth

Depth is physical and directional: a light source above, a card resting on board, and a board that is genuinely recessed. Three shadow tokens carry it; there are no other shadows in the system, and nothing uses a hard offset shadow.

### Shadow Vocabulary
- **Card Lift** (`0 1px 1px rgba(0,0,0,.22), 0 6px 14px rgba(0,0,0,.3)`): The index card on the board, and by extension dropdown menus and modals, which are cards pulled from the drawer.
- **Tray Lift** (`0 -2px 18px rgba(0,0,0,.34)`): Upward-cast only, so the tray reads as sliding out from *under* the card.
- **Key Lift** (`0 1px 0 rgba(255,255,255,.16) inset, 0 2px 4px rgba(0,0,0,.32)`): The stamp key. An inset top highlight plus a short drop — a key you can press. On `:active` it inverts to `0 1px 2px rgba(0,0,0,.3) inset`; when disabled it drops to none.
- **Board Recess** (`inset 0 18px 26px -18px rgba(0,0,0,.95)` top and bottom): A dark wall at the drawer lip falling away from the light. This is the only inset-on-surface effect in the system.

### Named Rules
**The Light-From-Above Rule.** Shadows fall downward from a fixed overhead source. The single exception is the tray, whose shadow casts upward precisely because it emerges from beneath the card.

**The No-Floating-Chrome Rule.** Nothing is elevated over the card. Panels, trays and menus occupy the board beside or beneath the artifact; the artifact is never eclipsed.

### Motion
One authored moment: the **drawer pull**. Opening or closing a tray translates the panel by its own height with `cubicOut` easing over 220ms, and 0ms under `prefers-reduced-motion: reduce`. The card does not move, fade, or rescale. There is no other animation in the system — no ambient motion, no entrance transitions, no hover lifts.

## Shapes

Catalogue stock is cut square. Radii are 2px (default), 3px (dropdowns, modals, alerts), 4px (largest). Bootstrap's radius scale is remapped onto these three values, so no inherited component can round further. Progress bars and scrollbar thumbs are square-cornered at 0.

Borders are hairlines — 1px, mostly warm ink at low alpha on kraft (0.06 / 0.11 / 0.22) and `control-border` on stock — reading as rules drawn on a card rather than as container chrome.

Two silhouettes recur and are the form language: the **plate** (a rectangle with a flush card-stock end-cap, used for the wordmark + status strip as one uninterrupted strip, with interior borders zeroed so it reads as one object rather than stacked chips), and the **drawer tab** (radius on the top two corners only, `2px 2px 0 0`, with the bottom border matched to the tray fill so an active tab merges into the surface it opens).

Browser surfaces are themed from the same materials: selection is stamp red on white, caret is stamp red, scrollbars are `drawer-high` on transparent at 9px with a hairline left rule, focus-visible is a 2px stamp-red outline at 2px offset, and links carry a 1px underline at 0.18em offset.

## Components

### Commit Key (signature)
The one primary control, sitting alone in the bottom-right commit slot, thumb-reachable. It is state-dependent rather than duplicated:
- **Disconnected:** raised-kraft key, "Connect".
- **Connecting:** same key, disabled, "Pairing…" — and disabled here means `opacity: 1`, secondary ink, and a **dashed** border, so it says why rather than just dimming.
- **Connected:** stamp-red key, "Print", with the key lift shadow and an inset press on `:active`.

Size is 109x58 with 0.85rem inline padding and a 0.35rem gap between glyph and word. There is no second Connect control anywhere in the app.

### Drawer Tabs
Five bottom-edge tabs (Add, Label, Data, Filed) plus a live selection tab that appears only when objects are selected. Each is `flex: 1 1 0` with a 3.9rem minimum, 62x58 as shipped, transparent at rest with secondary ink.
- **Hover:** primary ink over `rgba(240,230,210,0.06)`.
- **Open:** card-stock fill, `control-border` hairline, bottom border matched to the tray so tab and tray merge, card ink at weight 600.
- **Flagged** (data merge armed): a 5px `status-ok` dot appended — a flag on the tab, not a colour swap.

### Status Plate
A typed strip on the drawer front, butted directly against the wordmark inside one recessed frame. Drawer-deep fill, hairline border, notation face at 0.7rem, 48px tall, device name clipped at 12ch with an ellipsis. Carries status only — never an action. The live dot changes shape with state and every state has a `visually-hidden` sentence behind it.

### Card Mat (signature)
The artifact holder: card-bright stock, `control-border` hairline, 0.55rem of margin, card lift shadow, with the white canvas inside behind a `card-rule-soft` hairline. Dashed ruled-blue registration ticks sit 5px outside the canvas edge on the side the printhead feeds from. Directly below, the filing line states dimensions and feed direction in the same slots every time. Preview sits beside the card in the stage, not in the commit bar.

### Tray
Card stock pulled out over the lower board. Full width, bottom-anchored, `max-height: 41%`, scrolls internally when tall, `control-border` top hairline plus the upward tray lift. Opens with a ruled-off tray head: a mono uppercase title above a `card-rule-soft` divider.

### Inputs / Fields
Card stock you type on: `control-bg` fill, `control-border` hairline, card ink, set in the notation face with tabular figures.
- **Focus:** fill brightens to card-bright, border goes stamp red, with a 3px stamp-red-at-55% ring.
- **Disabled:** fill sinks to `card-sunk`, ink drops to secondary card ink.
- Select chevrons are redrawn in card ink rather than inheriting Bootstrap's default.

### Buttons (secondary and withdraw)
- **Secondary / drawer furniture:** raised-kraft fill, hairline border, primary ink; hover lifts to `drawer-high` with an emphasis border.
- **Ghost:** transparent, 48x48, secondary ink, hover fills to raised kraft. Disabled uses the dedicated `ink-disabled` token at full opacity.
- **Withdraw:** raised-kraft fill with `withdrawn` ink; on hover or focus the label flips to card ink and gains a 2px line-through. Destructive is *struck from the catalogue*, never alarm-coloured.

## Do's and Don'ts

### Do:
- **Do** keep stamp red for commit alone. One red control on screen at a time.
- **Do** keep the card the brightest surface and the only true black on screen.
- **Do** open tool surfaces from the bottom edge beneath a card that does not move. Measured displacement must stay 0px.
- **Do** set every measurement in the notation face with tabular figures.
- **Do** give every commit or device-state control a word alongside its glyph.
- **Do** hold 48px as the touch floor and 58px for rail-level controls.
- **Do** express disabled with a dedicated ink token and a shape change (dashed border), never with opacity alone.
- **Do** carry state in shape and text as well as colour.
- **Do** keep motion to the drawer pull (220ms cubicOut, 0ms reduced-motion) and honour `prefers-reduced-motion`.
- **Do** cut stock square: 2-4px radii and 1px hairlines.
- **Do** theme browser-native surfaces — selection, caret, scrollbars, focus ring — from the palette.
- **Do** apply `image-rendering: pixelated` only at whole-number zoom, so the preview never misreports the print.

### Don't:
- **Don't** paint a destructive action red. Struck-through `withdrawn` grey is the destructive language.
- **Don't** float a toolbar, palette, or sheet over the card. Chrome sits beside or beneath the artifact.
- **Don't** add a second way to start a print or a connection. One commit slot, one state-dependent key.
- **Don't** let a tray exceed 41% of the board height; a card you cannot see is a card you have left.
- **Don't** introduce a fourth shadow token or a hard offset shadow. This world is lit from above and diffuse.
- **Don't** fetch a font at runtime or fall back to a system display face.
- **Don't** round past 4px or introduce pill and capsule geometry.
- **Don't** add hover lifts, fades, springs, or ambient animation; the drawer pull is the whole motion vocabulary.
- **Don't** scale the canvas backing store to fit the stage — scale CSS size only, so the drawn pixels stay the printed pixels.
- **Don't** use a flat fill for the board; the kraft texture is the ground.
