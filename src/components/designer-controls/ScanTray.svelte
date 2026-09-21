<script lang="ts">
  import { Capacitor } from "@capacitor/core";

  import MdIcon from "$/components/basic/MdIcon.svelte";
  import {
    CameraSource,
    ScanCancelledError,
    capturePhoto,
    collectSuggestions,
    type LabelSuggestion,
  } from "$/lib/scan";

  interface Props {
    onPick: (suggestion: LabelSuggestion) => void;
  }

  let { onPick }: Props = $props();

  type Phase = "idle" | "working" | "done";

  let phase = $state<Phase>("idle");
  let suggestions = $state<LabelSuggestion[]>([]);
  let error = $state<string | undefined>(undefined);

  const native = Capacitor.isNativePlatform();

  /**
   * By default the recognisers are delivered by Play Services rather than
   * bundled (it saves ~27MB of APK), so the very first scan can land while the
   * model is still downloading. That is a wait, not a fault, and saying so
   * stops it reading as a broken feature.
   */
  const explain = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err);

    if (/download|unavailable|not available|wait/i.test(raw)) {
      return "The scanner is still downloading its model. Stay on Wi-Fi for a moment, then try again.";
    }
    if (/permission|denied/i.test(raw)) {
      return "Camera permission is required to scan. Enable it in Settings, then try again.";
    }
    return raw;
  };

  const scan = async (source: CameraSource) => {
    error = undefined;
    phase = "working";

    try {
      const input = await capturePhoto(source);
      suggestions = await collectSuggestions(input);
      phase = "done";
    } catch (err) {
      if (err instanceof ScanCancelledError) {
        // Backing out of the camera is not a failure; return to the start.
        phase = suggestions.length > 0 ? "done" : "idle";
        return;
      }
      console.error("[fichero] Scan failed", err);
      error = explain(err);
      phase = "idle";
    }
  };

  const reset = () => {
    suggestions = [];
    error = undefined;
    phase = "idle";
  };
</script>

{#if !native}
  <p class="scan-note">
    Scanning uses the on-device text and barcode models, which are only available in the Android
    and iOS builds. Everything else in the designer works here.
  </p>
{:else}
  <div class="scan-actions">
    <button
      class="btn btn-secondary"
      disabled={phase === "working"}
      onclick={() => scan(CameraSource.Camera)}
    >
      <MdIcon icon="photo_camera" /> Take photo
    </button>
    <button
      class="btn btn-secondary"
      disabled={phase === "working"}
      onclick={() => scan(CameraSource.Photos)}
    >
      <MdIcon icon="image" /> Choose image
    </button>
    {#if phase === "done"}
      <button class="btn btn-sm btn-link scan-reset" onclick={reset}>Clear</button>
    {/if}
  </div>

  <p class="scan-note">Nothing leaves your phone &mdash; the text and barcode models run locally.</p>

  {#if error !== undefined}
    <p class="scan-error"><MdIcon icon="error_outline" /> {error}</p>
  {/if}

  {#if phase === "working"}
    <p class="scan-status">Reading the image&hellip;</p>
  {:else if phase === "done" && suggestions.length === 0}
    <p class="scan-status">
      No text or barcodes found. Try filling more of the frame, or steadying the shot.
    </p>
  {:else if suggestions.length > 0}
    <ul class="chips">
      {#each suggestions as s, i (`${s.source}-${i}-${s.text}`)}
        <li>
          <button class="chip" class:is-barcode={s.source === "barcode"} onclick={() => onPick(s)}>
            <MdIcon icon={s.source === "barcode" ? "qr_code_scanner" : "notes"} />
            <span class="chip-text">{s.text}</span>
            {#if s.encoding !== undefined}
              <span class="chip-tag">{s.encoding}</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .scan-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .scan-reset {
    margin-left: auto;
  }

  .scan-note {
    margin: 0.6rem 0 0;
    font-size: 0.78rem;
    color: var(--ink-tertiary);
  }

  .scan-status {
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: var(--ink-muted);
  }

  .scan-error {
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: var(--stamp);
  }

  .chips {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0.85rem 0 0;
    padding: 0;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.55rem 0.7rem;
    text-align: left;
    border: 1px solid var(--card-rule-soft);
    border-radius: 0.4rem;
    background: var(--card-bright);
    color: var(--ink-on-card);
    font-size: 0.95rem;
  }

  .chip:hover,
  .chip:focus-visible {
    border-color: var(--card-rule);
    background: var(--card);
  }

  .chip-text {
    /* One line per suggestion: a wrapped chip reads as two suggestions. */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .is-barcode .chip-text {
    font-family: "Noto Sans Mono", monospace;
    font-size: 0.85rem;
  }

  .chip-tag {
    margin-left: auto;
    flex: none;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-tertiary);
  }
</style>
