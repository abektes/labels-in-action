<script lang="ts">
  import "bootstrap/js/dist/dropdown";
  import BrowserWarning from "$/components/basic/BrowserWarning.svelte";
  import LabelDesigner from "$/components/LabelDesigner.svelte";
  import PrinterConnector from "$/components/PrinterConnector.svelte";
  import { locale, locales, tr } from "$/utils/i18n";
  import DebugStuff from "$/components/DebugStuff.svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";

  // eslint-disable-next-line no-undef
  const appCommit = __APP_COMMIT__;
  // eslint-disable-next-line no-undef
  const buildDate = __BUILD_DATE__;

  let debugStuffShow = $state<boolean>(false);
</script>

<div class="drawer">
  <header class="drawer-label">
    <!-- The drawer label: whose drawer this is, and what is on the other
         end of the link, read as one strip. -->
    <div class="drawer-plate">
      <span class="wordmark" title="Labels in Action">LIA</span>
      <PrinterConnector />
    </div>

    <div class="rail-end">
      <div class="app-menu">
        <button
          class="btn btn-sm btn-secondary menu-key"
          data-bs-toggle="dropdown"
          data-bs-auto-close="outside"
          aria-label="App settings">
          <MdIcon icon="more_horiz" />
        </button>
        <div class="dropdown-menu dropdown-menu-end p-2">
          <label class="menu-label" for="localePick">Language</label>
          <select id="localePick" class="form-select form-select-sm mb-2" bind:value={$locale}>
            {#each Object.entries(locales) as [key, name] (key)}
              <option value={key}>{name}</option>
            {/each}
          </select>

          <button class="btn btn-sm btn-outline-secondary w-100 mb-2" onclick={() => (debugStuffShow = true)}>
            <MdIcon icon="bug_report" /> {$tr("debug.title")}
          </button>

          <div class="colophon notation">
            <div>{$tr("main.built")} {buildDate}</div>
            {#if appCommit}
              <div>
                <a href="https://github.com/mohamedha/fichero-printer/commit/{appCommit}">{appCommit.slice(0, 6)}</a>
              </div>
            {/if}
            <div><a href="https://github.com/mohamedha/fichero-printer">{$tr("main.code")}</a></div>
          </div>
        </div>
      </div>
    </div>
  </header>

  <BrowserWarning />

  <LabelDesigner />
</div>

{#if debugStuffShow}
  <DebugStuff bind:show={debugStuffShow} />
{/if}

<style>
  .drawer {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background-color: var(--drawer);
    /* Kraft board: a fibrous ground, not a flat fill */
    background-image:
      repeating-linear-gradient(94deg, rgba(0, 0, 0, 0.035) 0 2px, transparent 2px 5px),
      repeating-linear-gradient(2deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 4px);
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }

  /* The drawer front: a typed plate in a brass frame, ruled off from the contents */
  .drawer-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: linear-gradient(180deg, var(--drawer-raised), var(--drawer));
    border-bottom: 1px solid var(--drawer-edge);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
  }

  /* One strip: the drawer's own label butted against its printer link */
  .drawer-plate {
    display: flex;
    align-items: stretch;
    min-width: 0;
    border: 1px solid var(--drawer-edge);
    border-radius: var(--radius-sm);
    background: var(--drawer-deep);
    overflow: hidden;
  }

  .wordmark {
    display: inline-flex;
    align-items: center;
    flex: none;
    padding: 0 0.55rem;
    background: var(--card);
    border-right: 1px solid var(--drawer-edge);
    font-family: var(--font-notation);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--ink-on-card);
  }

  .rail-end {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
    flex: none;
    min-width: 0;
  }

  /* Blend the connector into the strip: one plate, not stacked chips */
  .drawer-plate :global(.btn),
  .drawer-plate :global(.status) {
    border-radius: 0;
    border-top: 0;
    border-bottom: 0;
    border-left: 0;
  }

  .drawer-plate :global(.connector) {
    gap: 0;
    min-width: 0;
  }

  .app-menu {
    position: relative;
    flex: none;
  }

  .menu-key {
    min-height: 48px;
    min-width: 48px;
  }

  .menu-label {
    display: block;
    font-family: var(--font-notation);
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-on-card-2);
    margin-bottom: 0.2rem;
  }

  .colophon {
    font-size: 0.65rem;
    line-height: 1.5;
    color: var(--ink-on-card-2);
    border-top: 1px solid var(--card-rule-soft);
    padding-top: 0.4rem;
  }

  .colophon a {
    color: var(--ink-on-card-2);
  }

  .colophon a:hover {
    color: var(--ink-on-card);
  }

  .app-menu :global(.dropdown-menu) {
    width: min(78vw, 260px);
  }

  /* The drawer front spans the furniture, not the whole tabletop */
  @media (min-width: 700px) {
    .drawer-label {
      padding: 0.6rem 1.5rem;
      gap: 1rem;
    }

    .wordmark {
      font-size: 0.9rem;
      padding: 0 0.8rem;
    }

    .rail-end {
      gap: 0.5rem;
    }
  }

  @media (min-width: 1000px) {
    .drawer-label {
      padding-inline: 2.25rem;
    }
  }
</style>
