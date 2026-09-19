<script lang="ts">
  import { SoundSettingsItemType } from "$/lib/fichero";
  import {
    printerClient,
    connectedPrinterName,
    connectionState,
    heartbeatData,
    printerInfo,
    printerMeta,
    heartbeatFails,
    rfidInfo,
    ribbonRfidInfo,
    refreshRfidInfo,
  } from "$/stores";
  import { tr } from "$/utils/i18n";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import type { MaterialIcon } from "material-icons";
  import FirmwareUpdater from "$/components/basic/FirmwareUpdater.svelte";

  const onDisconnectClicked = () => {
    $printerClient.disconnect();
  };

  const startHeartbeat = async () => {
    $printerClient.startHeartbeat();
  };

  const stopHeartbeat = async () => {
    $printerClient.stopHeartbeat();
  };

  const soundOn = async () => {
    await $printerClient.abstraction.setSoundEnabled(SoundSettingsItemType.BluetoothConnectionSound, true);
    await $printerClient.abstraction.setSoundEnabled(SoundSettingsItemType.PowerSound, true);
  };

  const soundOff = async () => {
    await $printerClient.abstraction.setSoundEnabled(SoundSettingsItemType.BluetoothConnectionSound, false);
    await $printerClient.abstraction.setSoundEnabled(SoundSettingsItemType.PowerSound, false);
  };

  const fetchInfo = async () => {
    await $printerClient.fetchPrinterInfo();
  };

  const reset = async () => {
    await $printerClient.abstraction.printerReset();
  };

  const batteryIcon = (value: number): MaterialIcon => {
    if (value > 4) {
      value = Math.min(4, Math.max(1, Math.ceil(value / 25)));
    }

    if (value === 4) {
      return "battery_full";
    } else if (value === 3) {
      return "battery_5_bar";
    } else if (value === 2) {
      return "battery_3_bar";
    } else if (value === 1) {
      return "battery_2_bar";
    }
    return "battery_0_bar";
  };

</script>

<div class="connector">
  {#if $connectionState === "connected"}
    <button
      class="btn btn-sm btn-secondary"
      data-bs-toggle="dropdown"
      data-bs-auto-close="outside"
      aria-label="Printer details">
      <MdIcon icon="settings" />
    </button>
    <div class="dropdown-menu p-1">
      {#if $printerInfo}
        <div>
          Printer info:
          <ul>
            {#each Object.entries($printerInfo) as [key, value] (key)}
              <li>{key}: <strong>{value ?? "-"}</strong></li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if $printerMeta}
        <button
          class="btn btn-sm btn-outline-secondary d-block w-100 mt-1"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#modelMeta">
          Model metadata <MdIcon icon="expand_more" />
        </button>

        <div class="collapse" id="modelMeta">
          <ul>
            {#each Object.entries($printerMeta) as [key, value] (key)}
              <li>{key}: <strong>{value ?? "-"}</strong></li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if $rfidInfo}
        <button
          class="btn btn-sm btn-outline-secondary d-block w-100 mt-1"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#rfidInfo">
          RFID info <MdIcon icon="expand_more" />
        </button>

        <div class="collapse" id="rfidInfo">
          <button class="btn btn-outline-secondary btn-sm mt-1" onclick={refreshRfidInfo}>Update</button>

          <ul>
            {#each Object.entries($rfidInfo) as [key, value] (key)}
              <li>{key}: <strong>{value ?? "-"}</strong></li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if $ribbonRfidInfo}
        <button
          class="btn btn-sm btn-outline-secondary d-block w-100 mt-1"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#ribbonRfidInfo">
          Ribbon RFID info <MdIcon icon="expand_more" />
        </button>

        <div class="collapse" id="ribbonRfidInfo">
          <button class="btn btn-outline-secondary btn-sm mt-1" onclick={refreshRfidInfo}>Update</button>

          <ul>
            {#each Object.entries($ribbonRfidInfo) as [key, value] (key)}
              <li>{key}: <strong>{value ?? "-"}</strong></li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if $heartbeatData}
        <button
          class="btn btn-sm btn-outline-secondary d-block w-100 mt-1"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#heartbeatData">
          Heartbeat data <MdIcon icon="expand_more" />
        </button>

        <div class="collapse" id="heartbeatData">
          <ul>
            {#each Object.entries($heartbeatData) as [key, value] (key)}
              <li>{key}: <strong>{value ?? "-"}</strong></li>
            {/each}
          </ul>
        </div>
      {/if}

      <FirmwareUpdater />

      <button
        class="btn btn-sm btn-outline-secondary d-block w-100 mt-1"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#tests">
        Tests <MdIcon icon="expand_more" />
      </button>

      <div class="collapse" id="tests">
        <div class="d-flex flex-wrap gap-1 mt-1">
          <button class="btn btn-sm btn-secondary" onclick={startHeartbeat}>Heartbeat on</button>
          <button class="btn btn-sm btn-secondary" onclick={stopHeartbeat}>Heartbeat off</button>
          <button class="btn btn-sm btn-secondary" onclick={soundOn}>Sound on</button>
          <button class="btn btn-sm btn-secondary" onclick={soundOff}>Sound off</button>
          <button class="btn btn-sm btn-secondary" onclick={fetchInfo}>Fetch info again</button>
          <button class="btn btn-sm btn-secondary" onclick={reset}>Reset</button>
        </div>
      </div>
    </div>
    <span class="status" class:faltering={$heartbeatFails > 0}>
      <span class="live" aria-hidden="true"></span>
      <span class="who">{$printerMeta?.model ?? $connectedPrinterName}</span>
      {#if $heartbeatData?.chargeLevel}
        <MdIcon icon={batteryIcon($heartbeatData.chargeLevel)} class="r-90"></MdIcon>
      {/if}
      <span class="visually-hidden">
        {$heartbeatFails > 0 ? "Connection faltering" : "Connected"}
      </span>
    </span>

    <button class="btn btn-sm btn-danger" onclick={onDisconnectClicked} aria-label="Disconnect">
      <MdIcon icon="power_off" />
    </button>
  {:else}
    <!-- Status only. Connecting is the commit key's job, so there is exactly
         one place to start a print. -->
    <span class="status status-empty">
      <span class="live" aria-hidden="true"></span>
      <span class="who">
        {$connectionState === "connecting" ? "Pairing…" : "No printer"}
      </span>
    </span>
  {/if}
</div>

<style>
  .connector {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }

  /* Android touch floor: this is used one-handed, standing at the printer */
  .connector :global(.btn) {
    min-height: 48px;
    min-width: 48px;
  }

  /* A typed strip on the drawer front: who is on the other end of the link */
  .status {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    min-height: 48px;
    padding: 0.28rem 0.55rem;
    background: var(--drawer-deep);
    border: 1px solid var(--border-standard);
    border-radius: var(--radius-sm);
    font-family: var(--font-notation);
    font-size: 0.7rem;
    color: var(--ink-primary);
  }

  .who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 12ch;
  }

  /* State is carried by shape and label as well as colour */
  .live {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: 50%;
    background: var(--status-ok);
    box-shadow: 0 0 0 2px rgba(125, 154, 85, 0.22);
  }

  .status.faltering {
    color: var(--status-warn);
  }

  .status.faltering .live {
    background: var(--status-warn);
    border-radius: 1px;
    box-shadow: 0 0 0 2px rgba(194, 132, 44, 0.22);
  }

  /* No printer filed yet: an empty slot, not an alarm */
  .status-empty {
    color: var(--ink-secondary);
  }

  .status-empty .live {
    background: transparent;
    border: 1px solid var(--ink-tertiary);
    box-shadow: none;
  }

  .connector :global(.dropdown-menu) {
    width: min(86vw, 300px);
    max-height: 70dvh;
    overflow-y: auto;
  }
</style>
