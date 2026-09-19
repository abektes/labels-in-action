---
version: 1
slug: "src-components-mainpage-svelte"
primary_target: "src/components/MainPage.svelte"
related_targets: ["src/components/LabelDesigner.svelte","src/components/PrinterConnector.svelte","src/components/PrintPreview.svelte"]
---

Scope: the Fichero Labels app shell and label designer — the single screen the user lives in. Visitor mode: Operate.

Audience and job: one user, standing, one hand, phone next to the printer. Job: text label → preview → print, repeatedly. Advanced tools (barcode, QR, vector, CSV, ZPL, fonts, saved labels, presets) all stay reachable but behind progressive disclosure. Android phone only; tablet and desktop web are not targets, so the inherited Bootstrap desktop grid is scaffolding to remove.

Constraints: 96px printhead, 1-bit output, BLE print is slow and failure-prone, 18 locales via `$tr()`, fonts must stay bundled for offline use.

Memorable moment: the tool tray pulls out of the drawer beneath the card while the card itself never moves.

Unresolved: whether the status rail should expose density/speed inline or keep them in the print tray.

## Direction contract

THESIS: A label exists so you can find the thing again, so this is the drawer you file it in, not a canvas you draw on. It refuses the floating-toolbar mobile editor.

OWN-WORLD: Kraft drawer board ground (#3a2f24, #8a6f4a); index-card stock (#f2e9d5) carries the artifact; stamp red (#b8352c) is the sole accent and means commit/print; ruled hairline blue (#7d9bb5). Noto Sans for UI, Noto Sans Mono for catalogue notation and numerics, both bundled offline. Drawer tabs, ruled rows, rubber date stamp. Withdrawn items are struck through, never red.

STORY: The user sees the label as a physical card, reads the printer's state at a glance, and reaches Print without ever leaving the card.

FIRST VIEWPORT: A status rail set as a drawer label at top (printer, battery, link). The label card centred on kraft at true proportions, the brightest and only true-black ink on screen. A stamp-red PRINT key thumb-reachable bottom-right. Drawer tabs along the bottom edge; signature interaction is a tray sliding up beneath the card like a pulled drawer while the card stays fixed. Motion grammar: drawer slide, stamp press, nothing else.

FORM: The Catalogue Drawer; candidate 5 of 7 on the ordered grounded list; seed key 9954973e.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
