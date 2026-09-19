<script lang="ts">
  import Dropdown from "bootstrap/js/dist/dropdown";
  import * as fabric from "fabric";
  import { onDestroy, onMount, tick } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { Barcode } from "$/fabric-object/barcode";
  import { QRCode } from "$/fabric-object/qrcode";
  import { iconCodepoints, type MaterialIcon } from "$/styles/mdi_icons";
  import { automation, connectionState, connectPrinter, csvData, loadedFonts } from "$/stores";
  import { Utils as FicheroUtils } from "$/lib/fichero";
  import {
    type ExportedLabelTemplate,
    type FabricJson,
    type LabelProps,
    type MoveDirection,
    type OjectType,
  } from "$/types";
  import { FileUtils } from "$/utils/file_utils";
  import { tr } from "$/utils/i18n";
  import { LabelDesignerObjectHelper } from "$/utils/label_designer_object_helper";
  import { LocalStoragePersistence } from "$/utils/persistence";
  import { Toasts } from "$/utils/toasts";
  import { UndoRedo, type UndoState } from "$/utils/undo_redo";
  import BarcodeParamsPanel from "$/components/designer-controls/BarcodeParamsControls.svelte";
  import CsvControl from "$/components/designer-controls/CsvControl.svelte";
  import GenericObjectParamsControls from "$/components/designer-controls/GenericObjectParamsControls.svelte";
  import IconPicker from "$/components/designer-controls/IconPicker.svelte";
  import LabelPropsEditor from "$/components/designer-controls/LabelPropsEditor.svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import ObjectPicker from "$/components/designer-controls/ObjectPicker.svelte";
  import PrintPreview from "$/components/PrintPreview.svelte";
  import QrCodeParamsPanel from "$/components/designer-controls/QRCodeParamsControls.svelte";
  import TextParamsControls from "$/components/designer-controls/TextParamsControls.svelte";
  import VariableInsertControl from "$/components/designer-controls/VariableInsertControl.svelte";
  import { DEFAULT_LABEL_PROPS, GRID_SIZE } from "$/defaults";
  import { LabelDesignerUtils } from "$/utils/label_designer_utils";
  import SavedLabelsMenu from "$/components/designer-controls/SavedLabelsMenu.svelte";
  import { CustomCanvas } from "$/fabric-object/custom_canvas";
  import VectorParamsControls from "$/components/designer-controls/VectorParamsControls.svelte";
  import { CanvasUtils } from "$/utils/canvas_utils";

  let htmlCanvas: HTMLCanvasElement;

  let fabricCanvas = $state<CustomCanvas>();
  let labelProps = $state<LabelProps>(DEFAULT_LABEL_PROPS);
  let previewOpened = $state<boolean>(false);
  let selectedObject = $state<fabric.FabricObject | undefined>(undefined);
  let selectedCount = $state<number>(0);
  let editRevision = $state<number>(0);
  let printNow = $state<boolean>(false);
  let csvEnabled = $state<boolean>(false);
  let undoState = $state<UndoState>({ undoDisabled: false, redoDisabled: false });

  // Drawer trays. "none" means no tab is pinned open, which lets a live
  // selection surface its own tray without stealing a tab the user chose.
  type TrayId = "none" | "label" | "insert" | "data" | "file";
  let activeTray = $state<TrayId>("none");

  const objectTrayOpen = $derived(selectedCount > 0 && activeTray === "none");
  const trayOpen = $derived(activeTray !== "none" || objectTrayOpen);

  const toggleTray = (id: TrayId) => {
    activeTray = activeTray === id ? "none" : id;
  };

  // Stage geometry. The card is fitted to the board rather than drawn at
  // literal label pixels, so a 232px label is not a stamp on an empty board
  // and a long label does not overflow into a horizontal scroll.
  let stageW = $state<number>(0);
  let stageH = $state<number>(0);

  // Re-read after mount: the Capgo BLE shim installs navigator.bluetooth late.
  let transports = $state({ webBluetooth: false });
  onMount(() => {
    transports = FicheroUtils.getAvailableTransports();
  });

  let cardZoom = $state<number>(1);

  const fitToStage = () => {
    if (fabricCanvas === undefined || stageW === 0) {
      return;
    }
    const availW = Math.max(80, stageW - 34);
    const availH = Math.max(80, stageH - 120);
    const { width: lw, height: lh } = labelProps.size;
    const zoom = Math.min(availW / lw, availH / lh, 3);
    fabricCanvas.virtualZoom(zoom);
    cardZoom = fabricCanvas.getVirtualZoom();
  };

  // Nearest-neighbour only at whole steps. At a fractional zoom it doubles
  // some stems and not others, which would misreport what actually prints.
  const crispCard = $derived(Math.abs(cardZoom - Math.round(cardZoom)) < 0.01);

  $effect(() => {
    void stageW;
    void stageH;
    void labelProps.size.width;
    void labelProps.size.height;
    fitToStage();
  });

  /** The drawer pull: the tray travels its own height, in and out. */
  const drawerPull = (_node: Element, { duration = 220 }: { duration?: number } = {}) => ({
    duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration,
    easing: cubicOut,
    css: (t: number) => `transform: translateY(${(1 - t) * 100}%)`,
  });

  const selectionLabel = $derived.by(() => {
    if (selectedCount > 1) return `${selectedCount} selected`;
    if (selectedObject instanceof fabric.IText) return "Text";
    if (selectedObject instanceof QRCode) return "QR code";
    if (selectedObject instanceof Barcode) return "Barcode";
    if (selectedObject) return "Shape";
    return "";
  });

  const undo = new UndoRedo();

  const discardSelection = () => {
    fabricCanvas!.discardActiveObject();
    fabricCanvas!.requestRenderAll();
    selectedObject = undefined;
    selectedCount = 0;
    editRevision = 0;
  };

  const loadLabelData = async (data: ExportedLabelTemplate) => {
    undo.paused = true;
    onUpdateLabelProps(data.label);
    if (data.csv) {
      $csvData = data.csv;
      csvEnabled = true;
    }
    await FileUtils.loadCanvasState(fabricCanvas!, data.canvas);
    undo.paused = false;
  };

  undo.onLabelUpdate = loadLabelData;
  undo.onStateUpdate = (state: UndoState) => {
    undoState = state;
  };

  const deleteSelected = () => {
    LabelDesignerUtils.deleteSelection(fabricCanvas!);
    discardSelection();
  };

  const cloneSelected = () => {
    LabelDesignerUtils.cloneSelection(fabricCanvas!).then(() => undo.push(fabricCanvas!, labelProps));
  };

  const moveSelected = (direction: MoveDirection, ctrl?: boolean) => {
    LabelDesignerUtils.moveSelection(fabricCanvas!, direction, ctrl);
    undo.push(fabricCanvas!, labelProps);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const key: string = e.key.toLowerCase();
    // windows and linux users are used to ctrl, mac users use cmd
    const cmdOrCtrl = e.metaKey || e.ctrlKey;

    // Esc
    if (key === "escape") {
      discardSelection();
      return;
    }

    if (LabelDesignerUtils.isAnyInputFocused(fabricCanvas!)) {
      return;
    }

    // Arrows
    if (key.startsWith("arrow")) {
      moveSelected(key.slice("arrow".length) as MoveDirection, cmdOrCtrl);
      return;
    }

    if (e.repeat) {
      return;
    }

    // Ctrl + D
    if (cmdOrCtrl && key === "d") {
      e.preventDefault();
      cloneSelected();
      return;
    }

    // Ctrl + Y, Ctrl + Shift + Z
    if ((cmdOrCtrl && key === "y") || (cmdOrCtrl && e.shiftKey && key === "z")) {
      e.preventDefault();
      if (!undoState.redoDisabled) {
        undo.redo();
      }
      return;
    }

    // Ctrl + Z
    if (cmdOrCtrl && key === "z") {
      e.preventDefault();
      if (!undoState.undoDisabled) {
        undo.undo();
      }
      return;
    }

    // Del
    if (key === "delete" || key === "backspace") {
      deleteSelected();
      return;
    }
  };

  const onUpdateLabelProps = (newProps: LabelProps) => {
    labelProps = newProps;
    fabricCanvas!.setDimensions(labelProps.size);
    fitToStage();
    try {
      LocalStoragePersistence.saveLastLabelProps(labelProps);
      undo.push(fabricCanvas!, labelProps);
    } catch (e) {
      Toasts.zodErrors(e, "Label parameters save error:");
    }
  };

  const exportCurrentLabel = (): ExportedLabelTemplate => {
    return FileUtils.makeExportedLabel(fabricCanvas!, labelProps, csvEnabled);
  };

  const onLoadRequested = (label: ExportedLabelTemplate) => {
    loadLabelData(label).then(() => undo.push(fabricCanvas!, labelProps));
  };

  const zplImageReady = async (img: Blob) => {
    await LabelDesignerObjectHelper.addImageBlob(fabricCanvas!, img);
    undo.push(fabricCanvas!, labelProps);
  };

  const onObjectPicked = (objectType: OjectType) => {
    const obj = LabelDesignerObjectHelper.addObject(fabricCanvas!, objectType);
    if (obj !== undefined) {
      fabricCanvas!.setActiveObject(obj);
      undo.push(fabricCanvas!, labelProps);
    }
  };

  const onIconPicked = (i: MaterialIcon) => {
    // todo: icon is not vertically centered
    LabelDesignerObjectHelper.addStaticText(fabricCanvas!, String.fromCodePoint(iconCodepoints[i]), {
      fontFamily: "Material Icons",
      fontSize: 100,
    });
    undo.push(fabricCanvas!, labelProps);
  };

  const onSvgIconPicked = (i: string) => {
    LabelDesignerObjectHelper.addSvg(fabricCanvas!, i);
    undo.push(fabricCanvas!, labelProps);
  };

  const openPreview = () => {
    printNow = false;
    previewOpened = true;
  };

  const openPreviewAndPrint = () => {
    printNow = true;
    previewOpened = true;
  };

  const controlValueUpdated = () => {
    if (selectedObject) {
      selectedObject.setCoords();
      selectedObject.dirty = true;
      undo.push(fabricCanvas!, labelProps);
    }
    fabricCanvas!.requestRenderAll();

    // trigger reactivity for controls
    editRevision++;
  };

  const getCanvasForPreview = (): FabricJson => {
    return fabricCanvas!.toJSON();
  };

  const onCsvPlaceholderPicked = (name: string) => {
    const obj = LabelDesignerObjectHelper.addText(fabricCanvas!, `{${name}}`, {
      textAlign: "left",
      originX: "left",
      originY: "top",
    });
    fabricCanvas!.setActiveObject(obj);
    undo.push(fabricCanvas!, labelProps);
  };

  const onPaste = async (event: ClipboardEvent) => {
    if (LabelDesignerUtils.isAnyInputFocused(fabricCanvas!)) {
      return;
    }

    const openedDropdowns = document.querySelectorAll(".dropdown-menu.show");
    if (openedDropdowns.length > 0) {
      return;
    }

    if (event.clipboardData != null) {
      event.preventDefault();
      const obj = await LabelDesignerObjectHelper.addObjectFromClipboard(fabricCanvas!, event.clipboardData);

      if (obj !== undefined) {
        fabricCanvas!.setActiveObject(obj);
        undo.push(fabricCanvas!, labelProps);
      }
    }
  };

  const clearCanvas = () => {
    if (!confirm($tr("editor.clear.confirm"))) {
      return;
    }
    undo.push(fabricCanvas!, labelProps);
    fabricCanvas!.clear();
  };

  const loadDefaultLabel = async () => {
    try {
      const urlTemplate = await FileUtils.readLabelFromUrl();

      if (urlTemplate !== null && confirm($tr("params.saved_labels.load.url.warn"))) {
        onLoadRequested(urlTemplate);
        Toasts.message($tr("params.saved_labels.load.url.loaded"));
        return;
      }
    } catch (e) {
      Toasts.error(e);
    }

    try {
      const defaultTemplate = LocalStoragePersistence.loadDefaultTemplate();

      if (defaultTemplate !== null) {
        onLoadRequested(defaultTemplate);
        return;
      }
    } catch (e) {
      Toasts.error(e);
    }

    LabelDesignerObjectHelper.addText(fabricCanvas!, $tr("editor.default_text"));
  };

  const renderOnFontsChanged = () => {
    fabricCanvas?.forEachObject((o) => {
      if (o instanceof fabric.Textbox) {
        o.dirty = true;
      }
    });
    fabricCanvas?.requestRenderAll();
  };

  onMount(async () => {
    try {
      const savedLabelProps = LocalStoragePersistence.loadLastLabelProps();
      if (savedLabelProps !== null) {
        labelProps = savedLabelProps;
      }
    } catch (e) {
      Toasts.zodErrors(e, "Label parameters load error:");
    }

    fabricCanvas = new CustomCanvas(htmlCanvas, {
      width: labelProps.size.width,
      height: labelProps.size.height,
    });
    fabricCanvas.setLabelProps(labelProps);

    await loadDefaultLabel();

    undo.push(fabricCanvas, labelProps);

    // force close dropdowns on touch devices
    fabricCanvas.on("mouse:down", (): void => {
      const dropdowns = document.querySelectorAll("[data-bs-toggle='dropdown']");
      dropdowns.forEach((el) => new Dropdown(el).hide());
    });

    fabricCanvas.on("object:moving", (e): void => {
      if (e.target && e.target.left !== undefined && e.target.top !== undefined) {
        e.target.set({
          left: Math.round(e.target.left / GRID_SIZE) * GRID_SIZE,
          top: Math.round(e.target.top / GRID_SIZE) * GRID_SIZE,
        });
      }
    });

    fabricCanvas.on("object:modified", (): void => {
      undo.push(fabricCanvas!, labelProps);
    });

    fabricCanvas.on("text:changed", () => {
      editRevision++;
    });

    fabricCanvas.on("object:removed", (): void => {
      undo.push(fabricCanvas!, labelProps);
    });

    fabricCanvas.on("selection:created", (e): void => {
      selectedCount = e.selected?.length ?? 0;
      selectedObject = e.selected?.length === 1 ? e.selected[0] : undefined;
      editRevision++;
    });

    fabricCanvas.on("selection:updated", (e): void => {
      selectedCount = e.selected?.length ?? 0;
      selectedObject = e.selected?.length === 1 ? e.selected[0] : undefined;
      editRevision++;
    });

    fabricCanvas.on("selection:cleared", (): void => {
      selectedObject = undefined;
      selectedCount = 0;
      editRevision++;
    });

    fabricCanvas.on("dragover", (e): void => {
      e.e.preventDefault();
    });

    fabricCanvas.on("drop:after", async (e): Promise<void> => {
      const dragEvt = e.e as DragEvent;
      dragEvt.preventDefault();

      let dropped = false;

      if (dragEvt.dataTransfer?.files) {
        for (const file of dragEvt.dataTransfer.files) {
          try {
            await LabelDesignerObjectHelper.addImageFile(fabricCanvas!, file);
            dropped = true;
          } catch (e) {
            Toasts.error(e);
          }
        }

        if (dropped) {
          undo.push(fabricCanvas!, labelProps);
        }
      }
    });

    fabricCanvas.on("object:scaling", (e): void => {
      if (!e.target) {
        return;
      }

      CanvasUtils.fixFabricObjectScale(e.target);
    });

    // userFonts.subscribe((e) => {console.log(e); renderOnFontsChanged();});

    if ($automation !== undefined) {
      if ($automation.startPrint !== undefined) {
        if ($automation.startPrint === "immediately") {
          openPreview();
        } else if ($automation.startPrint === "after_connect") {
          const unsubscribe = connectionState.subscribe((st) => {
            if (st === "connected") {
              tick().then(() => unsubscribe());
              openPreviewAndPrint();
            }
          });
        }
      }
    }
  });

  onDestroy(() => {
    fabricCanvas!.dispose();
  });

  $effect(() => {
    fabricCanvas?.setLabelProps(labelProps);
  });

  $effect(() => {
    if (!previewOpened) {
      printNow = false;
    }
  });

  $effect(() => {
    if ($loadedFonts) {
      renderOnFontsChanged();
    }
  });
</script>

<svelte:window onkeydown={onKeyDown} onpaste={onPaste} />

<div class="workbench">
  <!-- The board holds a fixed-size stage; the tray slides in over its lower
       edge so the card's position never recomputes. -->
  <div class="board">
    <section class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
    <div class="history">
      <button
        class="ghost"
        disabled={undoState.undoDisabled}
        onclick={() => undo.undo()}
        title={$tr("editor.undo")}
        aria-label={$tr("editor.undo")}>
        <MdIcon icon="undo" />
      </button>
      <button
        class="ghost"
        disabled={undoState.redoDisabled}
        onclick={() => undo.redo()}
        title={$tr("editor.redo")}
        aria-label={$tr("editor.redo")}>
        <MdIcon icon="redo" />
      </button>
    </div>

    <div class="mat">
      <div class="canvas-wrapper print-start-{labelProps.printDirection}" class:crisp={crispCard}>
        <canvas bind:this={htmlCanvas}></canvas>
      </div>
    </div>

    <p class="filing notation">
      {labelProps.size.width} × {labelProps.size.height} px
      <span class="sep" aria-hidden="true">·</span>
      feeds {labelProps.printDirection}
    </p>

      <button class="peek" onclick={openPreview}>
        <MdIcon icon="visibility" />
        {$tr("editor.preview")}
      </button>
    </section>

    <!-- The tray, pulled out from the drawer beneath the card -->
    {#if trayOpen}
      <section class="tray" transition:drawerPull>
        <div class="tray-inner">
        {#if objectTrayOpen}
          <div class="tray-head">
            <span class="tray-title">{selectionLabel}</span>
            <div class="tray-head-actions">
              <button class="btn btn-sm btn-secondary" onclick={cloneSelected} title={$tr("editor.clone")}>
                <MdIcon icon="content_copy" />
              </button>
              <button class="btn btn-sm btn-danger" onclick={deleteSelected} title={$tr("editor.delete")}>
                <MdIcon icon="delete" />
              </button>
            </div>
          </div>

          <div class="controls">
            {#if selectedObject && selectedCount === 1}
              <GenericObjectParamsControls {selectedObject} {editRevision} valueUpdated={controlValueUpdated} />
            {/if}

            {#if selectedObject}
              <VectorParamsControls {selectedObject} {editRevision} valueUpdated={controlValueUpdated} />
            {/if}

            {#if selectedObject instanceof fabric.IText}
              <TextParamsControls selectedText={selectedObject} {editRevision} valueUpdated={controlValueUpdated} />
            {/if}

            {#if selectedObject instanceof QRCode}
              <QrCodeParamsPanel selectedQRCode={selectedObject} {editRevision} valueUpdated={controlValueUpdated} />
            {/if}

            {#if selectedObject instanceof Barcode}
              <BarcodeParamsPanel selectedBarcode={selectedObject} {editRevision} valueUpdated={controlValueUpdated} />
            {/if}

            {#if selectedObject instanceof fabric.IText || selectedObject instanceof QRCode || (selectedObject instanceof Barcode && selectedObject.encoding === "CODE128B")}
              <VariableInsertControl {selectedObject} valueUpdated={controlValueUpdated} />
            {/if}
          </div>
        {:else if activeTray === "label"}
          <div class="tray-head"><span class="tray-title">Label</span></div>
          <div class="controls">
            <LabelPropsEditor {labelProps} onChange={onUpdateLabelProps} />
          </div>
        {:else if activeTray === "insert"}
          <div class="tray-head"><span class="tray-title">Add to label</span></div>
          <div class="controls">
            <ObjectPicker onSubmit={onObjectPicked} {labelProps} {zplImageReady} />
            <IconPicker onSubmit={onIconPicked} onSubmitSvg={onSvgIconPicked} />
          </div>
        {:else if activeTray === "data"}
          <div class="tray-head"><span class="tray-title">Data merge</span></div>
          <div class="controls">
            <CsvControl bind:enabled={csvEnabled} onPlaceholderPicked={onCsvPlaceholderPicked} />
          </div>
        {:else if activeTray === "file"}
          <div class="tray-head"><span class="tray-title">Filed labels</span></div>
          <div class="controls">
            <SavedLabelsMenu
              canvas={fabricCanvas!}
              onRequestLabelTemplate={exportCurrentLabel}
              {onLoadRequested}
              {csvEnabled} />
            <button class="btn btn-sm btn-danger" onclick={clearCanvas} title={$tr("editor.clear")}>
              <MdIcon icon="cancel_presentation" />
              {$tr("editor.clear")}
            </button>
          </div>
        {/if}
      </div>
    </section>
  {/if}
  </div>

  <!-- Drawer tabs, then the one key that commits -->
  <nav class="tabs" aria-label="Label tools">
    <div class="tab-row">
      {#if selectedCount > 0}
        <button class="tab tab-live" class:on={objectTrayOpen} onclick={() => (activeTray = "none")}>
          <MdIcon icon="highlight_alt" />
          <span>{selectionLabel}</span>
        </button>
      {/if}

      <button class="tab" class:on={activeTray === "insert"} onclick={() => toggleTray("insert")}>
        <MdIcon icon="add_box" />
        <span>Add</span>
      </button>

      <button class="tab" class:on={activeTray === "label"} onclick={() => toggleTray("label")}>
        <MdIcon icon="straighten" />
        <span>Label</span>
      </button>

      <button class="tab" class:on={activeTray === "data"} class:flagged={csvEnabled} onclick={() => toggleTray("data")}>
        <MdIcon icon="table_rows" />
        <span>Data</span>
      </button>

      <button class="tab" class:on={activeTray === "file"} onclick={() => toggleTray("file")}>
        <MdIcon icon="inventory_2" />
        <span>Filed</span>
      </button>
    </div>

    <!-- One primary action. Without a printer it is the way to get one;
         with a printer it is the stamp that commits. -->
    <div class="commit">
      {#if $connectionState === "connected"}
        <button
          class="btn btn-primary stamp-key"
          title="Print with default or saved parameters"
          onclick={openPreviewAndPrint}>
          <MdIcon icon="print" />
          <span class="commit-label">{$tr("editor.print")}</span>
        </button>
      {:else}
        <button
          class="btn btn-secondary stamp-key pairing-key"
          title="Connect a printer to print"
          onclick={connectPrinter}
          disabled={$connectionState === "connecting" || !transports.webBluetooth}>
          <MdIcon icon="bluetooth" />
          <span class="commit-label">
            {$connectionState === "connecting" ? "Pairing…" : "Connect"}
          </span>
        </button>
      {/if}
    </div>
  </nav>

  {#if previewOpened}
    <PrintPreview
      bind:show={previewOpened}
      canvasCallback={getCanvasForPreview}
      {labelProps}
      {printNow}
      {csvEnabled}
      csvData={$csvData.data} />
  {/if}
</div>

<style>
  .workbench {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  /* ── The card on the board ──────────────────────────────── */

  /* The board is the drawer interior. Its height never changes, so the card
     inside it cannot be pushed around by a tray opening. */
  .board {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    /* A real recess: a dark wall at the lip, falling away from the light */
    box-shadow:
      inset 0 18px 26px -18px rgba(0, 0, 0, 0.95),
      inset 0 -18px 26px -18px rgba(0, 0, 0, 0.95);
  }

  .stage {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 1rem 0.75rem 1.25rem;
    overflow: hidden;
  }

  .history {
    position: absolute;
    top: 0.5rem;
    right: 0.6rem;
    display: flex;
    gap: 0.15rem;
  }

  .ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-secondary);
  }

  .ghost:hover:not(:disabled) {
    background: var(--drawer-raised);
    border-color: var(--border-standard);
    color: var(--ink-primary);
  }

  .ghost:disabled {
    /* Legibly unavailable, not invisible */
    color: var(--ink-disabled);
    opacity: 1;
  }

  /* Index card: the brightest thing on the board, lit from above */
  .mat {
    padding: 0.55rem;
    background: var(--card-bright);
    border: 1px solid var(--control-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--lift-card);
    max-width: 100%;
    overflow: auto;
  }

  .canvas-wrapper {
    position: relative;
    border: 1px solid var(--card-rule-soft);
    background-color: #fff;
    line-height: 0;
  }

  /* Registration ticks marking the edge the printhead feeds from,
     set outside the label area so they never read as part of the artwork. */
  .canvas-wrapper::before {
    content: "";
    position: absolute;
    pointer-events: none;
  }

  .canvas-wrapper.print-start-left::before {
    top: 0;
    bottom: 0;
    left: -5px;
    width: 3px;
    background: repeating-linear-gradient(180deg, var(--mark-feed) 0 4px, transparent 4px 9px);
  }

  .canvas-wrapper.print-start-top::before {
    left: 0;
    right: 0;
    top: -5px;
    height: 3px;
    background: repeating-linear-gradient(90deg, var(--mark-feed) 0 4px, transparent 4px 9px);
  }

  .canvas-wrapper.crisp canvas {
    image-rendering: pixelated;
  }

  /* Fixed furniture: every card is filed with the same facts in the same slots */
  .filing {
    margin: 0;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-secondary);
  }

  .filing .sep {
    color: var(--ink-muted);
    padding: 0 0.2rem;
  }

  /* Looking closely at the card belongs beside the card, not in the commit bar */
  .peek {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-height: 48px;
    padding: 0.3rem 1rem;
    background: transparent;
    border: 1px solid var(--border-emphasis);
    border-radius: var(--radius-sm);
    color: var(--ink-secondary);
    font-size: 0.75rem;
  }

  .peek:hover {
    background: var(--drawer-raised);
    border-color: var(--drawer-edge);
    color: var(--ink-primary);
  }

  /* ── The tray ───────────────────────────────────────────── */

  /* Pulled out over the lower board, never displacing the card above it */
  .tray {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    /* Capped so the card stays visible while its own controls are open:
       a card you cannot see is a card you have left. Tall trays scroll. */
    max-height: 41%;
    overflow-y: auto;
    background: var(--card);
    border-top: 1px solid var(--control-border);
    box-shadow: var(--lift-tray);
  }

  .tray-inner {
    padding: 0.6rem 0.75rem 0.85rem;
  }

  .tray-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding-bottom: 0.4rem;
    margin-bottom: 0.6rem;
    border-bottom: 1px solid var(--card-rule-soft);
  }

  .tray-head-actions {
    display: flex;
    gap: 0.3rem;
  }

  .tray-title {
    font-family: var(--font-notation);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-on-card-2);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }

  /* ── Drawer tabs and the stamp key ──────────────────────── */

  .tabs {
    display: flex;
    align-items: stretch;
    gap: 0.45rem;
    padding: 0.4rem 0.5rem 0.5rem;
    background: linear-gradient(180deg, var(--drawer-raised), var(--drawer-deep));
    border-top: 1px solid var(--drawer-edge);
  }

  .tab-row {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    scrollbar-width: none;
    flex: 1;
    min-width: 0;
  }

  .tab-row::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    /* Share the rail evenly: bigger targets for a one-handed reach */
    flex: 1 1 0;
    min-width: 3.9rem;
    min-height: 58px;
    padding: 0.3rem 0.35rem;
    border: 1px solid transparent;
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    background: transparent;
    color: var(--ink-secondary);
    font-size: 0.72rem;
    letter-spacing: 0.02em;
  }

  .tab :global(.mdi) {
    font-size: 1.4rem;
    line-height: 1;
  }

  .tab span {
    white-space: nowrap;
  }

  .tab:hover {
    color: var(--ink-primary);
    background: rgba(240, 230, 210, 0.06);
  }

  /* An open tab is a drawer tab pulled forward into the light */
  .tab.on {
    background: var(--card);
    border-color: var(--control-border);
    border-bottom-color: var(--card);
    color: var(--ink-on-card);
    font-weight: 600;
  }

  .tab.tab-live:not(.on) {
    color: var(--ink-primary);
  }

  /* Data merge armed: a flag on the tab, not a colour swap */
  .tab.flagged::after {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--status-ok);
  }

  .commit {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex: none;
  }

  .commit .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 58px;
    padding-inline: 0.85rem;
  }

  .commit .btn :global(.mdi) {
    font-size: 1.3rem;
    line-height: 1;
  }

  /* Unavailable, and it says why rather than just dimming */
  .commit .btn:disabled {
    opacity: 1;
    color: var(--ink-secondary);
    border-style: dashed;
  }

  /* The two actions that commit always say what they do; the tab row
     scrolls instead, because an unlabelled icon is what we came to fix. */
  .commit-label {
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .stamp-key {
    font-weight: 600;
    letter-spacing: 0.03em;
  }
</style>
