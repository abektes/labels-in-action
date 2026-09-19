<script lang="ts">
  import { Capacitor } from "@capacitor/core";
  import { Utils } from "$/lib/fichero";
  import { tr } from "$/utils/i18n";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import { detectAntiFingerprinting } from "$/utils/browsers";
  import { onMount } from "svelte";

  let caps = $state(Utils.getAvailableTransports());
  let antiFingerprinting = detectAntiFingerprinting();
  let isMobile =
    typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  let isNative =
    typeof Capacitor !== "undefined" && Capacitor.isNativePlatform();

  onMount(() => {
    // Re-read after BLE shim may have installed navigator.bluetooth
    caps = Utils.getAvailableTransports();
  });
</script>

{#if isNative && !caps.webBluetooth}
  <div class="alert alert-danger text-center" role="alert">
    <MdIcon icon="bluetooth_disabled" />
    Bluetooth bridge did not start. Grant Nearby devices (and Location if asked), turn Bluetooth on, then fully close and reopen the app.
  </div>
{:else if !isNative && !caps.webBluetooth}
  <div class="alert alert-danger text-center" role="alert">
    {#if isMobile}
      <MdIcon icon="computer" />
      Open on a desktop browser (Chrome, Edge, or Opera) to connect to your printer.
    {:else}
      <div>
        {$tr("browser_warning.lines.first")}
      </div>
      <div>
        {$tr("browser_warning.lines.second")}
      </div>
    {/if}
  </div>
{/if}

{#if antiFingerprinting}
  <div class="alert alert-danger" role="alert">
    {$tr("browser_warning.fingerprinting")}
  </div>
{/if}

<style>
</style>
