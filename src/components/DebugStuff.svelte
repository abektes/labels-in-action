<script lang="ts">
  import AppModal from "$/components/basic/AppModal.svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { appConfig } from "$/stores";
  import { tr } from "$/utils/i18n";
  import { FICHERO_CLIENT_DEFAULTS } from "$/lib/fichero";
  import {
    allProviders,
    getScanDiagnostics,
    probeProviderAvailability,
    type ScanDiagnostics,
  } from "$/lib/scan";

  let { show = $bindable() } = $props();

  /**
   * Scan faults happen on a phone with no cable attached, where `adb logcat` is
   * not an option. Everything the tray deliberately softens for the user —
   * the file ML Kit was handed, whether a recogniser is even present, the raw
   * plugin error — is reproduced here verbatim.
   */
  let scan = $state<ScanDiagnostics>(getScanDiagnostics());
  let probing = $state<boolean>(false);

  const refreshScan = async () => {
    probing = true;
    try {
      // The probe writes its answers into the diagnostics record, so the
      // snapshot taken afterwards carries fresh availability for every provider.
      await probeProviderAvailability(allProviders);
    } finally {
      scan = getScanDiagnostics();
      probing = false;
    }
  };

  // The panel is mounted fresh each time it is opened, so this is one probe per
  // visit rather than a poll.
  void refreshScan();

  const stamp = (at: number | undefined): string =>
    at === undefined ? "never" : new Date(at).toLocaleTimeString();
</script>

<AppModal title={$tr("debug.title")} bind:show>
  <div class="mb-1">
    {$tr("debug.packet_interval.help")}
  </div>

  <div class="input-group flex-nowrap input-group-sm mb-3">
    <input
      class="form-control"
      type="number"
      min="1"
      placeholder={`${FICHERO_CLIENT_DEFAULTS.packetIntervalMs}`}
      bind:value={$appConfig.packetIntervalMs} />
    <span class="input-group-text">ms</span>
    <button class="btn btn-outline-secondary" onclick={() => ($appConfig.packetIntervalMs = undefined)}
      >{$tr("debug.reset")}</button>
  </div>

  <div class="mb-1">
    {$tr("debug.page_delay.help")}
  </div>

  <div class="input-group flex-nowrap input-group-sm mb-3" role="group">
    <input class="form-control" type="number" min="0" placeholder="0" bind:value={$appConfig.pageDelay} />
    <span class="input-group-text">ms</span>
    <button class="btn btn-outline-secondary" onclick={() => ($appConfig.pageDelay = undefined)}
      >{$tr("debug.reset")}</button>
  </div>

  <hr />

  <div class="d-flex align-items-center justify-content-between mb-1">
    <span>Scan diagnostics</span>
    <button class="btn btn-sm btn-outline-secondary" disabled={probing} onclick={refreshScan}>
      <MdIcon icon="refresh" /> {probing ? "Checking…" : "Recheck"}
    </button>
  </div>

  <dl class="scan-diag mb-3">
    <dt>Last capture</dt>
    <dd class="mono">{scan.lastPhotoPath ?? "none this session"}</dd>

    {#if scan.lastCaptureError !== undefined}
      <dt>Capture error</dt>
      <dd class="mono fault">{scan.lastCaptureError}</dd>
    {/if}

    <dt>Last scan</dt>
    <dd>{stamp(scan.lastScanAt)}</dd>

    {#each allProviders as p (p.id)}
      <dt>{p.label} <span class="mono id">{p.id}</span></dt>
      <dd>
        <div>
          available: {scan.providers[p.id]?.available ?? "unknown"}{#if scan.providers[p.id]?.lastCount !== undefined}&nbsp;&middot; last run: {scan
              .providers[p.id]?.lastCount} suggestion(s){/if}
        </div>
        {#if scan.providers[p.id]?.lastError !== undefined}
          <div class="mono fault">
            {stamp(scan.providers[p.id]?.lastErrorAt)} — {scan.providers[p.id]?.lastError}
          </div>
        {/if}
      </dd>
    {/each}
  </dl>
</AppModal>

<style>
  .scan-diag {
    margin-bottom: 0;
    font-size: 0.82rem;
    color: var(--ink-on-card);
  }

  .scan-diag dt {
    margin-top: 0.5rem;
    font-weight: 600;
  }

  .scan-diag dd {
    margin: 0.1rem 0 0;
    color: var(--ink-muted);
  }

  .mono {
    font-family: "Noto Sans Mono", monospace;
    font-size: 0.75rem;
    /* Paths and native error text are long and unbreakable; wrap rather than
       pushing the modal sideways. */
    overflow-wrap: anywhere;
  }

  .id {
    font-weight: 400;
    color: var(--ink-tertiary);
  }

  /* A recorded fault is a genuine error, which is what --stamp is for. */
  .fault {
    color: var(--stamp);
  }
</style>
