<script lang="ts">
  import { Capacitor } from "@capacitor/core";

  import MdIcon from "$/components/basic/MdIcon.svelte";
  import {
    CameraSource,
    ScanCancelledError,
    allProviders,
    capturePhoto,
    checkObjectNamingStatus,
    collectSuggestions,
    downloadObjectNaming,
    onDeviceProviders,
    providerLabel,
    type LabelSuggestion,
    type ObjectNamingStatus,
    type ProviderFailure,
  } from "$/lib/scan";

  interface Props {
    onPick: (suggestion: LabelSuggestion) => void;
  }

  let { onPick }: Props = $props();

  type Phase = "idle" | "working" | "done";

  let phase = $state<Phase>("idle");
  let suggestions = $state<LabelSuggestion[]>([]);
  let failures = $state<ProviderFailure[]>([]);
  let unavailable = $state<string[]>([]);
  let attempted = $state<string[]>([]);
  let error = $state<string | undefined>(undefined);

  const native = Capacitor.isNativePlatform();

  /**
   * Gemini Nano lives in Android's AICore, not in this APK, so whether object
   * naming can run at all is a property of the phone. Checked once per tray
   * rather than per scan: the answer only changes when the user acts on it.
   */
  let aiStatus = $state<ObjectNamingStatus | undefined>(undefined);
  let aiDownloading = $state<boolean>(false);
  let aiBytes = $state<number>(0);
  let aiError = $state<string | undefined>(undefined);

  const refreshAiStatus = async () => {
    aiStatus = await checkObjectNamingStatus();
  };

  if (native) {
    void refreshAiStatus();
  }

  // Object naming joins a scan only once the model is actually on the phone.
  // Every other status leaves the existing OCR + barcode pair exactly as it was.
  const providers = $derived(aiStatus === "AVAILABLE" ? allProviders : onDeviceProviders);

  const enableAi = async () => {
    aiError = undefined;
    aiBytes = 0;
    aiDownloading = true;
    try {
      await downloadObjectNaming((bytes) => (aiBytes = bytes));
    } catch (err) {
      console.error("[fichero] AI naming download failed", err);
      // Not explain(): that one talks about the scanner's own model and would
      // tell the user to wait for a download that has just stopped.
      const raw = err instanceof Error ? err.message : String(err);
      aiError = /network|connect|internet|offline/i.test(raw)
        ? "The AI model download needs a working connection. Try again on Wi-Fi."
        : `The AI model didn't download: ${raw}`;
    } finally {
      aiDownloading = false;
      // Whether it finished or failed, the phone is the authority on what the
      // status now is — a failed download can still leave it DOWNLOADING.
      await refreshAiStatus();
    }
  };

  const megabytes = (bytes: number): string => `${(bytes / 1048576).toFixed(0)} MB`;

  /** Encoded on the object, printed on it, or guessed about it. */
  const chipIcon = (source: LabelSuggestion["source"]) =>
    source === "barcode" ? "qr_code_scanner" : source === "ai" ? "auto_awesome" : "notes";

  /**
   * The end of a scan is three different stories, and telling the wrong one is
   * what made this feature feel broken: a model that failed to load was
   * reported as a badly framed photo, so the user retook the photo forever.
   *
   *   nothing-ran  — every provider reported isAvailable() === false
   *   failed       — a provider ran and threw, and nothing else found anything
   *   empty        — providers ran, finished, and the image really had nothing
   *
   * Results win over all three: if one provider worked, its chips are the
   * answer and the other one's failure is a footnote.
   */
  type Ending = "results" | "nothing-ran" | "failed" | "empty";

  const ending = $derived<Ending>(
    suggestions.length > 0
      ? "results"
      : attempted.length === 0
        ? "nothing-ran"
        : failures.length > 0
          ? "failed"
          : "empty",
  );

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
      const outcome = await collectSuggestions(input, providers);
      suggestions = outcome.suggestions;
      failures = outcome.failures;
      unavailable = outcome.unavailable;
      attempted = outcome.attempted;
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
    failures = [];
    unavailable = [];
    attempted = [];
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

  <p class="scan-note">
    Nothing leaves your phone &mdash; the text{#if aiStatus === "AVAILABLE"}, barcode and object-naming
      models{:else} and barcode models{/if} run locally.
  </p>

  <!-- Four statuses, four honest answers. AVAILABLE says nothing extra: the AI
       chips are the message. The rest never take the scan buttons away, because
       OCR and barcodes do not need this model to work. -->
  {#if aiStatus === "DOWNLOADABLE"}
    <div class="scan-ai">
      <p class="scan-ai-copy">
        <strong>Name objects with AI.</strong> This phone can suggest names for things with no text on
        them &mdash; a jar, a cable, a plant. It needs a one-time download of Android's on-device model
        (several hundred MB, best on Wi-Fi). Photos still never leave your phone.
      </p>
      <button class="btn btn-sm btn-secondary" disabled={aiDownloading} onclick={enableAi}>
        <MdIcon icon="download" />
        {aiDownloading ? "Downloading…" : "Enable AI naming"}
      </button>
      {#if aiDownloading}
        <p class="scan-status">
          <MdIcon icon="downloading" />
          <!-- AICore reports bytes so far and never a total, so this counts up
               rather than filling a bar it cannot size. -->
          <span>{megabytes(aiBytes)} downloaded&hellip; you can keep scanning text and barcodes.</span>
        </p>
      {/if}
    </div>
  {:else if aiStatus === "DOWNLOADING"}
    <p class="scan-aside">
      <MdIcon icon="downloading" />
      <span>
        Android is still downloading the AI naming model. Text and barcodes work now; object names
        appear once it lands.
      </span>
    </p>
  {:else if aiStatus === "UNAVAILABLE"}
    <p class="scan-aside">
      <MdIcon icon="block" />
      <span>This phone can't run on-device AI naming. Text and barcode scanning work as usual.</span>
    </p>
  {/if}

  {#if aiError !== undefined}
    <p class="scan-error"><MdIcon icon="error_outline" /> {aiError}</p>
  {/if}

  {#if error !== undefined}
    <p class="scan-error"><MdIcon icon="error_outline" /> {error}</p>
  {/if}

  {#if phase === "working"}
    <!-- Nano inference takes seconds, which is long enough that silence reads
         as a hang. Only promised when it is actually in the run. -->
    <p class="scan-status">
      {aiStatus === "AVAILABLE"
        ? "Reading the image and naming what's in it…"
        : "Reading the image…"}
    </p>
  {:else if phase === "done"}
    {#if ending === "results"}
      <ul class="chips">
        {#each suggestions as s, i (`${s.source}-${i}-${s.text}`)}
          <li>
            <button
              class="chip"
              class:is-barcode={s.source === "barcode"}
              class:is-ai={s.source === "ai"}
              onclick={() => onPick(s)}
            >
              <MdIcon icon={chipIcon(s.source)} />
              <span class="chip-text">{s.text}</span>
              {#if s.encoding !== undefined}
                <span class="chip-tag">{s.encoding}</span>
              {:else if s.source === "ai"}
                <!-- A guess at what the thing is, not something read off it.
                     Worth saying on the chip itself, once. -->
                <span class="chip-tag">AI</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    {:else if ending === "nothing-ran"}
      <p class="scan-status">
        <MdIcon icon="block" />
        <span>
          Scanning isn't available on this build: {unavailable.map(providerLabel).join(" and ")}
          didn't load. Everything else in the designer still works.
        </span>
      </p>
    {:else if ending === "failed"}
      {#each failures as f (f.providerId)}
        <p class="scan-error">
          <MdIcon icon="error_outline" />
          <span><strong>{providerLabel(f.providerId)}:</strong> {explain(f.error)}</span>
        </p>
      {/each}
    {:else}
      <p class="scan-status">
        {attempted.includes("genai-object-naming")
          ? "Nothing to name here. Try filling more of the frame, or steadying the shot."
          : "No text or barcodes found. Try filling more of the frame, or steadying the shot."}
      </p>
    {/if}

    <!-- Footnotes: true of any ending, and never loud enough to compete with it.
         A failure that did not cost the user their results is news, not an alarm. -->
    {#if ending === "results" && failures.length > 0}
      {#each failures as f (f.providerId)}
        <p class="scan-aside">
          <MdIcon icon="info" />
          <span>{providerLabel(f.providerId)} didn't run: {explain(f.error)}</span>
        </p>
      {/each}
    {/if}

    {#if ending !== "nothing-ran" && unavailable.length > 0}
      <p class="scan-aside">
        <MdIcon icon="block" />
        <span>{unavailable.map(providerLabel).join(", ")} &mdash; not available on this build.</span>
      </p>
    {/if}
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
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: var(--ink-muted);
  }

  /* --stamp is the red for things that went genuinely wrong, so it belongs on a
     failed provider and nowhere else in this tray. */
  .scan-error {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0.75rem 0 0;
    font-size: 0.85rem;
    color: var(--stamp);
  }

  .scan-error + .scan-error {
    margin-top: 0.35rem;
  }

  /* A footnote to an ending the user already has: quiet ink, no red, set in
     from the results it qualifies. */
  .scan-aside {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0.5rem 0 0;
    padding-top: 0.5rem;
    border-top: 1px solid var(--card-rule-soft);
    font-size: 0.78rem;
    color: var(--ink-tertiary);
  }

  .scan-aside + .scan-aside {
    margin-top: 0;
    padding-top: 0.3rem;
    border-top: 0;
  }

  .scan-status :global(.mdi),
  .scan-error :global(.mdi),
  .scan-aside :global(.mdi) {
    /* Keep the glyph on the first line of a wrapped message rather than letting
       it grow the line box. */
    flex: none;
    font-size: 1.1em;
    vertical-align: -0.15em;
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

  /* The opt-in panel: a card inside the tray, quiet enough that a phone which
     cannot run the model loses nothing by never seeing it. */
  .scan-ai {
    margin-top: 0.75rem;
    padding: 0.65rem 0.7rem;
    border: 1px solid var(--card-rule-soft);
    border-radius: 0.4rem;
    background: var(--card-bright);
  }

  .scan-ai-copy {
    margin: 0 0 0.55rem;
    font-size: 0.8rem;
    color: var(--ink-muted);
  }

  .scan-ai-copy strong {
    color: var(--ink-on-card);
  }

  .scan-ai .scan-status {
    margin-top: 0.5rem;
    font-size: 0.78rem;
  }

  /* A guess about the object rather than something read off it. Marked with an
     edge, not a colour: --stamp is for printing and for failures. */
  .is-ai {
    padding-left: calc(0.7rem - 1px);
    border-left: 2px solid var(--ink-tertiary);
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
