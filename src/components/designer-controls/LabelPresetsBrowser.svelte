<script lang="ts">
  import type { LabelPreset } from "$/types";
  import { tr } from "$/utils/i18n";
  import MdIcon from "$/components/basic/MdIcon.svelte";

  interface Props {
    onItemSelected: (index: number) => void;
    onItemDelete: (index: number) => void;
    presets: LabelPreset[];
    class?: string;
  }

  let { class: className = "", onItemDelete, onItemSelected, presets }: Props = $props();
  let deleteIndex = $state<number>(-1);

  const scaleDimensions = (preset: LabelPreset): { width: number; height: number } => {
    const scaleFactor = Math.min(100 / preset.width, 100 / preset.height);
    return {
      width: Math.round(preset.width * scaleFactor),
      height: Math.round(preset.height * scaleFactor),
    };
  };

  const deleteConfirmed = (e: MouseEvent, idx: number) => {
    e.stopPropagation();
    deleteIndex = -1;
    onItemDelete(idx);
  };

  const deleteRejected = (e: MouseEvent) => {
    e.stopPropagation();
    deleteIndex = -1;
  };

  const deleteRequested = (e: MouseEvent, idx: number) => {
    e.stopPropagation();
    deleteIndex = idx;
  };
</script>

<div class="preset-browser overflow-y-auto border d-flex p-2 gap-1 flex-wrap {className}">
  <!-- fixme: key -->
  {#each presets as item, idx (item)}
    <div
      role="button"
      class="btn p-0 card-wrapper d-flex justify-content-center align-items-center"
      tabindex="0"
      onkeydown={() => onItemSelected(idx)}
      onclick={() => onItemSelected(idx)}>
      <div
        class="card print-start-{item.printDirection} d-flex justify-content-center align-items-center"
        style="width: {scaleDimensions(item).width}%; height: {scaleDimensions(item).height}%;">
        <div class="remove d-flex">
          {#if deleteIndex === idx}
            <button class="remove btn withdraw" onclick={(e) => deleteConfirmed(e, idx)}>
              <MdIcon icon="delete" />
            </button>
            <button class="remove btn text-success" onclick={(e) => deleteRejected(e)}>
              <MdIcon icon="close" />
            </button>
          {:else}
            <button class="remove btn withdraw" onclick={(e) => deleteRequested(e, idx)}>
              <MdIcon icon="delete" />
            </button>
          {/if}
        </div>

        <span class="label p-1">
          {#if item.title}
            {item.title}
          {:else}
            {item.width}x{item.height}{#if item.unit === "mm"}{$tr("params.label.mm")}{:else if item.unit === "px"}{$tr(
                "params.label.px",
              )}{/if}
          {/if}
        </span>
      </div>
    </div>
  {/each}
</div>

<style>
  .preset-browser {
    max-height: 200px;
    max-width: 100%;
    min-height: 96px;
  }

  .card-wrapper {
    width: 96px;
    height: 96px;
    border-radius: var(--radius-sm);
    transition: background-color 0.15s;
  }

  .card-wrapper:hover {
    background-color: var(--surface-1);
  }

  .card {
    background-color: var(--surface-2);
    border: 1px solid var(--border-standard);
    border-radius: var(--radius-sm);
    position: relative;
    overflow: hidden;
  }

  .card > .remove {
    position: absolute;
    top: 0;
    right: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .card-wrapper:hover .remove {
    opacity: 1;
  }

  .card > .remove > button {
    padding: 0;
    line-height: 100%;
    font-size: 0.75rem;
  }

  .card > .label {
    color: var(--ink-secondary);
    font-size: 0.7rem;
    line-height: 1.2;
    text-align: center;
    padding: 2px 4px;
  }

  .card.print-start-left {
    border-left: 2px solid var(--mark-feed);
  }
  .card.print-start-top {
    border-top: 2px solid var(--mark-feed);
  }
</style>
