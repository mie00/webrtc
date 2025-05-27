<script lang="ts">
  import {
    forwardStore,
    setForwardHost,
    setForwardPeer,
    type LogMessage
  } from '../lib/stores/forwardStore';
  import { toggleForwardHandler } from '../lib/app/forwardHandler';
  import DraggableOverlayBase from './DraggableOverlayBase.svelte';

  const show = $derived(!!$forwardStore.allowedHosts.length || !!$forwardStore.forwardHost);

  async function handleForwardClose() {
    if ($forwardStore.allowedHosts.length) {
      await toggleForwardHandler(); // This should eventually lead to allowedHosts becoming empty
    }
    if ($forwardStore.forwardHost) {
      setForwardHost(null); // This should clear forwardHost
      setForwardPeer(null);
    }
  }
</script>

{#if show}
  <DraggableOverlayBase
    title="Forwarded Content"
    {show}
    onClose={handleForwardClose}
    initialPosition={{ x: 100, y: 100 }}
    initialSize={{ width: 400, height: 350 }}
  >
    <div class="flex-grow flex flex-col overflow-hidden h-full">
      {#if $forwardStore.forwardHost}
        <div class="iframe-container flex-grow mb-1 border border-gray-600 rounded min-h-[50px]">
          <iframe
            src={`/iframe-content.html?host=${$forwardStore.forwardHost}`}
            class="w-full h-full bg-white"
            allowTransparency={false}
            title="Forwarded Content"
          ></iframe>
        </div>
      {/if}
      {#if $forwardStore.logMessages.length > 0}
        <div
          class="log-container flex-grow bg-gray-800 p-2 overflow-y-auto text-xs border border-gray-600 rounded min-h-[50px]"
        >
          <h3 class="text-sm font-semibold mb-1 sticky top-0 bg-gray-800 z-10">Requests:</h3>
          {#each $forwardStore.logMessages as log (log.id)}
            <p class="font-mono break-all">
              <span class="mr-2">{log.status}</span>{log.text}
            </p>
          {/each}
        </div>
      {/if}
    </div>
  </DraggableOverlayBase>
{/if}

<style>
  .iframe-container,
  .log-container {
    min-height: 50px;
  }
</style>
