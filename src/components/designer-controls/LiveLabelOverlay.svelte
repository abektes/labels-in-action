<script lang="ts">
  import type { PluginListenerHandle } from "@capacitor/core";

  import MdIcon from "$/components/basic/MdIcon.svelte";
  import {
    LiveLabels,
    bestLabel,
    projectOntoPreview,
    type DetectedObject,
  } from "$/lib/scan/live-labels";

  interface Props {
    /** Called with the chosen text; the overlay closes itself first. */
    onPick: (text: string) => void;
    onClose: () => void;
  }

  let { onPick, onClose }: Props = $props();

  let objects = $state<DetectedObject[]>([]);
  let sourceWidth = $state(0);
  let sourceHeight = $state(0);
  let error = $state<string | undefined>(undefined);
  let starting = $state(true);

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
    };

    void run();

    return () => {
      cancelled = true;
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
</style>
