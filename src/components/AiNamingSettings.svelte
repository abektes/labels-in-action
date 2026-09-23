<script lang="ts">
  import AppModal from "$/components/basic/AppModal.svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";
  import {
    CLOUD_MODEL_PRESETS,
    DEFAULT_CLOUD_MODEL,
    checkCloudKey,
    cloudKeyStatus,
    removeCloudKey,
    saveCloudKey,
    type KeyCheck,
  } from "$/lib/scan";
  import { appConfig } from "$/stores";

  let { show = $bindable() } = $props();

  let draft = $state("");
  let busy = $state(false);
  let check = $state<KeyCheck | undefined>(undefined);

  const OTHER = "__other__";
  const model = $derived($appConfig.cloudModel?.trim() || DEFAULT_CLOUD_MODEL);
  const isPreset = $derived(CLOUD_MODEL_PRESETS.some((p) => p.id === model));
  // Picking "Other…" must show the text field even before anything is typed.
  let otherPicked = $state(false);
  const selectValue = $derived(otherPicked || !isPreset ? OTHER : model);

  const onModelSelect = (value: string) => {
    if (value === OTHER) {
      otherPicked = true;
      return;
    }
    otherPicked = false;
    $appConfig.cloudModel = value;
  };

  const save = async () => {
    busy = true;
    check = undefined;
    try {
      check = await saveCloudKey(draft);
      // Out of the DOM as soon as it is stored: the field is the one place in
      // the web layer the key ever exists.
      if ($cloudKeyStatus.configured) draft = "";
    } finally {
      busy = false;
    }
  };

  const test = async () => {
    busy = true;
    try {
      check = await checkCloudKey();
    } finally {
      busy = false;
    }
  };

  const remove = async () => {
    busy = true;
    try {
      await removeCloudKey();
      check = undefined;
    } finally {
      busy = false;
    }
  };
</script>

<AppModal title="AI naming" bind:show>
  <p class="lede">
    Name the things you point the camera at &mdash; or give them a nickname &mdash; using your own
    <a href="https://openrouter.ai" target="_blank" rel="noopener">OpenRouter</a> key.
  </p>
  <p class="fine">
    When this is on, the photo is sent to OpenRouter and the model's provider. Each name costs a
    fraction of a cent, billed to your key. Text and barcodes are still read on your phone.
  </p>

  <h2 class="section">API key</h2>

  {#if $cloudKeyStatus.configured}
    <div class="key-row">
      <MdIcon icon="key" />
      <span class="key-hint">{$cloudKeyStatus.hint ?? "Key stored"}</span>
      <button class="btn btn-sm btn-outline-secondary ms-auto" disabled={busy} onclick={test}>Test</button>
      <button class="btn btn-sm btn-outline-danger" disabled={busy} onclick={remove}>Remove</button>
    </div>
  {:else}
    <form
      class="key-form"
      onsubmit={(e) => {
        e.preventDefault();
        void save();
      }}>
      <input
        class="form-control form-control-sm"
        type="password"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="sk-or-v1-…"
        aria-label="OpenRouter API key"
        bind:value={draft} />
      <button class="btn btn-sm btn-secondary" type="submit" disabled={busy || draft.trim().length === 0}>
        {busy ? "Checking…" : "Save & test"}
      </button>
    </form>
  {/if}

  {#if check !== undefined}
    <p class="check" class:is-bad={!check.ok}>
      <MdIcon icon={check.ok ? "check_circle" : "error_outline"} />
      <span>{check.message}</span>
    </p>
  {/if}

  <p class="fine">
    Make a separate key just for this app, with a small credit limit, at
    <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener">openrouter.ai/settings/keys</a>.
    The key is encrypted with your phone's hardware keystore and never leaves the app except to
    talk to OpenRouter. The limit is what caps the damage if it ever leaks.
  </p>

  <h2 class="section">Model</h2>
  <select
    class="form-select form-select-sm"
    value={selectValue}
    onchange={(e) => onModelSelect(e.currentTarget.value)}>
    {#each CLOUD_MODEL_PRESETS as p (p.id)}
      <option value={p.id}>{p.label}</option>
    {/each}
    <option value={OTHER}>Other model…</option>
  </select>
  {#if selectValue === OTHER}
    <input
      class="form-control form-control-sm mt-2"
      type="text"
      autocapitalize="off"
      spellcheck="false"
      placeholder="provider/model-id (must accept images)"
      aria-label="OpenRouter model id"
      bind:value={$appConfig.cloudModel} />
  {/if}

  <h2 class="section">Fun names</h2>
  <div class="form-check form-switch">
    <input
      class="form-check-input"
      type="checkbox"
      role="switch"
      id="funNamesSwitch"
      checked={$appConfig.funNames ?? false}
      onchange={(e) => ($appConfig.funNames = e.currentTarget.checked)} />
    <label class="form-check-label" for="funNamesSwitch">
      Suggest nicknames too &mdash; "Sir Drips-a-Lot" as well as "Kettle"
    </label>
  </div>
  <p class="fine">You can also flip this on the live camera screen.</p>
</AppModal>

<style>
  .lede {
    margin-bottom: 0.4rem;
  }

  .fine {
    font-size: 0.8rem;
    color: var(--ink-tertiary);
    margin-bottom: 0.5rem;
  }

  .section {
    margin: 1rem 0 0.4rem;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-secondary);
  }

  .key-form {
    display: flex;
    gap: 0.4rem;
  }

  .key-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .key-hint {
    font-family: "Noto Sans Mono", monospace;
    font-size: 0.85rem;
  }

  .check {
    display: flex;
    align-items: flex-start;
    gap: 0.35rem;
    margin: 0.5rem 0;
    font-size: 0.85rem;
  }

  /* --stamp is the red reserved for real failures. */
  .check.is-bad {
    color: var(--stamp);
  }
</style>
