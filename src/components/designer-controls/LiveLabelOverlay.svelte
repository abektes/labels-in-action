<script lang="ts">
  import type { PluginListenerHandle } from "@capacitor/core";

  import MdIcon from "$/components/basic/MdIcon.svelte";
  import {
    checkObjectNamingStatus,
    chooseNamer,
    cloudKeyStatus,
    nameWithCloud,
    objectNamingProvider,
    refreshCloudKeyStatus,
    type LabelSuggestion,
  } from "$/lib/scan";
  import {
    LiveLabels,
    bestLabel,
    projectOntoPreview,
    type DetectedObject,
  } from "$/lib/scan/live-labels";
  import { appConfig, connectionState } from "$/stores";

  interface Props {
    /** Called with the chosen text; the overlay closes itself first. */
    onPick: (text: string) => void;
    /**
     * A named chip: place *and* commit, in the one tap the user made. The
     * caller owns both halves because only it can reach the canvas and the
     * print path; the overlay closes itself first, same as onPick.
     */
    onPrint: (text: string) => void;
    onClose: () => void;
  }

  let { onPick, onPrint, onClose }: Props = $props();

  let objects = $state<DetectedObject[]>([]);
  let sourceWidth = $state(0);
  let sourceHeight = $state(0);
  let error = $state<string | undefined>(undefined);
  let starting = $state(true);

  /**
   * Read here as well as in the caller, and only to keep the chips honest: a
   * tap prints when a printer is paired and merely places the label when one is
   * not, and a chip that says "Print" either way is the lie this screen can
   * least afford. The caller still makes the actual decision.
   */
  const canPrint = $derived($connectionState === "connected");

  // Naming is the slow, opt-in half of this screen: a frame grab, then one to
  // three seconds inside AICore or a round trip to OpenRouter.
  let nanoAvailable = $state(false);
  let namerChecked = $state(false);
  let naming = $state(false);
  let names = $state<LabelSuggestion[]>([]);

  const fun = $derived($appConfig.funNames ?? false);
  const keyConfigured = $derived($cloudKeyStatus.configured);
  const namer = $derived(chooseNamer({ fun, nanoAvailable, keyConfigured }));
  const canName = $derived(namer !== "none");
  /** Fun is a cloud feature, so the toggle only exists once there is a key. */
  const canFun = $derived(keyConfigured);
  let nameError = $state<string | undefined>(undefined);

  /**
   * Naming outlives the overlay if the user closes mid-run, and by then stop()
   * has already unbound the camera and deleted the frame — so the inference
   * fails, loudly, into a screen that no longer exists. Not $state: nothing
   * renders from it.
   */
  let torn = false;

  // The preview is native and sits *behind* the WebView, so this element is an
  // empty transparent window onto it. Its box is what the fractions map into.
  let viewEl: HTMLDivElement | undefined = $state();
  let viewWidth = $state(0);
  let viewHeight = $state(0);

  const boxes = $derived(
    objects.map((o) => ({
      object: o,
      rect: projectOntoPreview(o, sourceWidth, sourceHeight, viewWidth, viewHeight),
      label: bestLabel(o),
    })),
  );

  $effect(() => {
    let handles: PluginListenerHandle[] = [];
    let cancelled = false;

    const run = async () => {
      try {
        handles.push(
          await LiveLabels.addListener("objectsDetected", (e) => {
            if (cancelled) return;
            objects = e.objects;
            sourceWidth = e.sourceWidth;
            sourceHeight = e.sourceHeight;
          }),
        );
        handles.push(
          await LiveLabels.addListener("liveLabelsError", (e) => {
            if (cancelled) return;
            error = e.message;
          }),
        );
        await LiveLabels.start();
        if (!cancelled) starting = false;
      } catch (err) {
        if (cancelled) return;
        error = err instanceof Error ? err.message : String(err);
        starting = false;
      }

      // Its own await, after start: this is an AICore round-trip and the camera
      // is the point of the screen. A phone that cannot run the model simply
      // never grows the button, and a status check that goes wrong must not be
      // reported as a camera fault.
      const [status] = await Promise.all([checkObjectNamingStatus(), refreshCloudKeyStatus()]);
      if (!cancelled) {
        nanoAvailable = status === "AVAILABLE";
        namerChecked = true;
      }
    };

    void run();

    return () => {
      cancelled = true;
      torn = true;
      // Order matters: the native side restores the WebView background on stop,
      // and leaving it transparent would black out the whole app.
      void LiveLabels.stop().catch(() => undefined);
      handles.forEach((h) => void h.remove().catch(() => undefined));
    };
  });

  const pick = (text: string) => {
    onPick(text);
    onClose();
  };

  /** A chip is the whole action: place it, print it, and get out of the way. */
  const commit = (text: string) => {
    onPrint(text);
    onClose();
  };

  /**
   * The whole frame goes to the model, not a crop of a detected box: the button
   * asks "what am I looking at", and a box the user never chose is a worse
   * answer to that than the scene itself.
   */
  const nameThis = async () => {
    if (naming) return;

    naming = true;
    nameError = undefined;
    names = [];

    try {
      const { path } = await LiveLabels.captureFrame();
      const suggestions =
        namer === "cloud" ? await nameWithCloud(path, fun) : await objectNamingProvider.suggest({ path });
      if (torn) return;

      names = suggestions;
      if (names.length === 0) {
        nameError = "Couldn't name that. Fill more of the frame and try again.";
      }
    } catch (err) {
      if (torn) return;

      console.error("[fichero] Live naming failed", err);
      const raw = err instanceof Error ? err.message : String(err);
      // Never left silent: the camera is still running and looks fine, so an
      // unexplained tap reads as a dead button rather than a failed model.
      // Cloud errors arrive already worded for a person.
      nameError =
        namer === "cloud"
          ? raw
          : /download|unavailable|not available/i.test(raw)
            ? "The AI naming model isn't ready on this phone yet."
            : `Naming failed: ${raw}`;
    } finally {
      naming = false;
    }
  };

  const toggleFun = () => {
    $appConfig.funNames = !fun;
    // The names on screen were asked for in the other mode; keeping them would
    // make the switch look like it did nothing.
    names = [];
    nameError = undefined;
  };

  const dismissNames = () => {
    names = [];
    nameError = undefined;
  };

  /**
   * Making the WebView transparent on the native side is only half of it: the
   * page still paints `body { background: var(--drawer-deep) }` and the whole
   * designer on top, so without this the camera is perfectly invisible behind
   * an opaque app. `live-camera` blanks the shell (see style.scss).
   *
   * The overlay has to leave #app to survive that, hence the move to <body>.
   * Svelte keeps its own handle on the node, so it still tears down normally.
   */
  const portal = (node: HTMLElement) => {
    document.body.appendChild(node);
    document.documentElement.classList.add("live-camera");

    return {
      destroy() {
        document.documentElement.classList.remove("live-camera");
        node.remove();
      },
    };
  };
</script>

<div
  class="live"
  use:portal
  bind:this={viewEl}
  bind:clientWidth={viewWidth}
  bind:clientHeight={viewHeight}
>
  <div class="live-bar">
    <button class="btn btn-sm btn-secondary" onclick={onClose}>
      <MdIcon icon="close" /> Close
    </button>
    <span class="live-hint">
      {#if error !== undefined}
        {error}
      {:else if starting}
        Starting camera&hellip;
      {:else if names.length > 0}
        {canPrint ? "Tap a name to print it" : "Tap a name to add it to the label"}
      {:else if boxes.length === 0}
        Point at an object
      {:else}
        Tap what you want to label
      {/if}
    </span>
  </div>

  {#each boxes as b (b.object.trackingId === -1 ? `${b.rect.left},${b.rect.top}` : b.object.trackingId)}
    <button
      class="box"
      style="left:{b.rect.left}px; top:{b.rect.top}px; width:{b.rect.width}px; height:{b.rect.height}px;"
      onclick={() => pick(b.label ?? "Object")}
    >
      <span class="box-tag">{b.label ?? "Object"}</span>
    </button>
  {/each}

  <!-- Everything the naming half of this screen says lives in one footer, over
       its own scrim. Anchored to the bottom because that is where a thumb is
       while the other hand holds the phone at the thing being named. -->
  <!-- Not gated on `error`: that one latches on any single bad frame the
       detector reports, and losing the naming button to a transient analyser
       hiccup would be worse than showing it next to a stale message. -->
  {#if namerChecked && !starting && !canName}
    <p class="live-setup">
      <MdIcon icon="auto_awesome" />
      <span>To name things, add an OpenRouter key in &#8943; &rarr; AI naming.</span>
    </p>
  {:else if canName && !starting}
    <div class="live-foot">
      {#if nameError !== undefined}
        <p class="foot-error"><MdIcon icon="error_outline" /> <span>{nameError}</span></p>
      {/if}

      {#if names.length > 0}
        <div class="foot-head">
          <span class="foot-title">
            {canPrint ? "Print one of these" : "No printer — this only places the label"}
          </span>
          <button class="foot-dismiss" aria-label="Dismiss names" onclick={dismissNames}>
            <MdIcon icon="close" />
          </button>
        </div>
        <ul class="names">
          {#each names as name (name.text)}
            <li>
              <button
                class="name"
                class:is-print={canPrint}
                class:is-fun={name.fun === true}
                onclick={() => commit(name.text)}>
                <MdIcon icon={canPrint ? "print" : "add"} />
                <span class="name-text">{name.text}</span>
                {#if name.fun}
                  <span class="name-tag"><MdIcon icon="mood" /> Fun</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="foot-keys">
        <button class="btn btn-secondary name-key" disabled={naming} onclick={nameThis}>
          <MdIcon icon={fun && namer === "cloud" ? "mood" : "auto_awesome"} />
          {#if naming}
            {fun && namer === "cloud" ? "Thinking up names…" : "Naming…"}
          {:else if names.length > 0}
            Name again
          {:else}
            Name this
          {/if}
        </button>
        {#if canFun}
          <!-- A toggle, not a mode screen: flipping it is the whole setting, and
               it persists, so the next "Name this" already knows. -->
          <button
            class="btn fun-key"
            class:is-on={fun}
            aria-pressed={fun}
            disabled={naming}
            onclick={toggleFun}>
            <MdIcon icon="mood" /> Fun {fun ? "on" : "off"}
          </button>
        {/if}
      </div>
      {#if namer === "cloud"}
        <p class="foot-note">Sends this frame to OpenRouter.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* Fixed, not absolute: this is a window onto a native surface behind the
     entire WebView, so it cannot be scoped to the tray it was opened from. */
  .live {
    position: fixed;
    inset: 0;
    z-index: 2000;
    /* Transparent on purpose — the camera is behind the WebView, not in it. */
    background: transparent;
  }

  .live-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.75rem;
    /* A scrim, because the controls sit over whatever the camera sees. */
    background: linear-gradient(180deg, rgba(36, 29, 22, 0.85), rgba(36, 29, 22, 0));
  }

  .live-hint {
    font-size: 0.82rem;
    color: var(--ink-primary);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }

  .box {
    position: absolute;
    padding: 0;
    background: transparent;
    border: 2px solid var(--card-bright);
    border-radius: var(--radius-sm, 0.3rem);
    box-shadow: 0 0 0 1px rgba(36, 29, 22, 0.55);
  }

  .box-tag {
    position: absolute;
    top: -0.1rem;
    left: -0.1rem;
    transform: translateY(-100%);
    padding: 0.15rem 0.4rem;
    border-radius: var(--radius-sm, 0.3rem);
    background: var(--card-bright);
    color: var(--ink-on-card);
    font-size: 0.72rem;
    white-space: nowrap;
  }

  /* The naming half. Bottom-anchored and over its own scrim, because the scene
     behind it is arbitrary — a white wall would swallow pale text entirely. */
  .live-foot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.4rem 0.75rem calc(0.9rem + env(safe-area-inset-bottom));
    background: linear-gradient(0deg, rgba(36, 29, 22, 0.92) 55%, rgba(36, 29, 22, 0));
  }

  .foot-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .foot-title {
    font-size: 0.78rem;
    color: var(--ink-secondary);
  }

  .foot-dismiss {
    margin-left: auto;
    padding: 0.1rem 0.2rem;
    border: 0;
    background: transparent;
    color: var(--ink-secondary);
    line-height: 1;
  }

  .foot-error {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0;
    font-size: 0.82rem;
    /* A model that failed is a genuine error, which is what --stamp is for. */
    color: var(--stamp);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  }

  .foot-error :global(.mdi) {
    flex: none;
    font-size: 1.1em;
    vertical-align: -0.15em;
  }

  .names {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    /* Five names plus the button must not eat a short phone's whole screen. */
    max-height: 45vh;
    overflow-y: auto;
  }

  /* Solid card stock, never a translucent pill: these sit on live video, and a
     chip you cannot read is a chip you cannot aim at. */
  .name {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    /* Thumb-sized: this is a one-tap commit on a handheld phone. */
    min-height: 2.9rem;
    padding: 0.55rem 0.75rem;
    text-align: left;
    border: 1px solid var(--card-rule-soft);
    border-radius: var(--radius-sm, 0.3rem);
    background: var(--card-bright);
    color: var(--ink-on-card);
    font-size: 1.05rem;
    box-shadow: var(--lift-card);
  }

  /* Only when a printer is paired does a tap actually commit anything, so only
     then does the row wear the stamp. Without one it is an ordinary add. */
  .name.is-print {
    padding-left: calc(0.75rem - 2px);
    border-left: 3px solid var(--stamp);
  }

  .name.is-print :global(.mdi) {
    color: var(--stamp);
  }

  .name-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .foot-keys {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .fun-key {
    border: 1px solid var(--card-rule-soft);
    background: rgba(36, 29, 22, 0.6);
    color: var(--ink-secondary);
  }

  /* On reads as card stock, same as the chips it changes. */
  .fun-key.is-on {
    background: var(--card-bright);
    color: var(--ink-on-card);
  }

  .foot-note {
    margin: 0;
    font-size: 0.72rem;
    color: var(--ink-tertiary);
  }

  .name-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    margin-left: auto;
    flex: none;
    font-size: 0.68rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-tertiary);
  }

  /* A nickname is a different kind of answer; say so in the type, not a colour —
     --stamp belongs to printing and failures. */
  .name.is-fun .name-text {
    font-style: italic;
  }

  /* Shown where the footer would be, when nothing on this phone can name. */
  .live-setup {
    position: absolute;
    left: 0.75rem;
    right: 0.75rem;
    bottom: calc(0.9rem + env(safe-area-inset-bottom));
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin: 0;
    padding: 0.5rem 0.7rem;
    border-radius: var(--radius-sm, 0.3rem);
    background: rgba(36, 29, 22, 0.85);
    font-size: 0.8rem;
    color: var(--ink-secondary);
  }
</style>
