<script lang="ts">
  import Dropdown from "bootstrap/js/dist/dropdown";
  import { type LabelProps, type OjectType } from "$/types";
  import { tr } from "$/utils/i18n";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import ZplImportButton from "$/components/designer-controls/ZplImportButton.svelte";

  interface Props {
    onSubmit: (i: OjectType) => void;
    labelProps: LabelProps;
    zplImageReady: (img: Blob) => void;
  }

  let { onSubmit, labelProps, zplImageReady }: Props = $props();

  let toggleEl: HTMLButtonElement;

  /** Adding is a one-shot action: close the sheet so the card is visible again. */
  const pick = (type: OjectType) => {
    onSubmit(type);
    Dropdown.getOrCreateInstance(toggleEl).hide();
  };
</script>

<div class="dropdown">
  <button
    bind:this={toggleEl}
    class="btn btn-sm btn-secondary"
    data-bs-toggle="dropdown"
    data-bs-auto-close="outside">
    <MdIcon icon="format_shapes" />
    <MdIcon icon="add" />
  </button>

  <div class="dropdown-menu">
    <h6 class="dropdown-header">{$tr("editor.objectpicker.title")}</h6>
    <div class="p-3">
      <button class="btn me-1" onclick={() => pick("text")}>
        <MdIcon icon="title" />
        {$tr("editor.objectpicker.text")}
      </button>
      <button class="btn me-1" onclick={() => pick("line")}>
        <MdIcon icon="remove" />
        {$tr("editor.objectpicker.line")}
      </button>
      <button class="btn me-1" onclick={() => pick("rectangle")}>
        <MdIcon icon="crop_square" />
        {$tr("editor.objectpicker.rectangle")}
      </button>
      <button class="btn me-1" onclick={() => pick("circle")}>
        <MdIcon icon="radio_button_unchecked" />
        {$tr("editor.objectpicker.circle")}
      </button>

      <button class="btn me-1" onclick={() => pick("image")}>
        <MdIcon icon="image" />
        {$tr("editor.objectpicker.image")}
      </button>
      <button class="btn me-1" onclick={() => pick("qrcode")}>
        <MdIcon icon="qr_code_2" />
        {$tr("editor.objectpicker.qrcode")}
      </button>
      <button class="btn me-1" onclick={() => pick("barcode")}>
        <MdIcon icon="view_week" />
        {$tr("editor.objectpicker.barcode")}
      </button>

      <ZplImportButton {labelProps} onImageReady={zplImageReady} text={$tr("editor.import.zpl")} />
    </div>
  </div>
</div>

<style>
  .dropdown-menu {
    width: 100vw;
    max-width: 450px;
  }
</style>
