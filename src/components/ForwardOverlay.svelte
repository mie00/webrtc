<script lang="ts">
  import { forwardStore, setForwardHost, setForwardPeer, toggleForwardHandler, type LogMessage } from '../lib/forwardBridge.js';
  import DraggableOverlayBase from './DraggableOverlayBase.svelte';

  const currentForwardStore = $derived(forwardStore);
  const show = $derived(!!(currentForwardStore.allowedHosts.length) || !!currentForwardStore.forwardHost);

  async function handleForwardClose() {
    if (currentForwardStore.allowedHosts.length) {
      await toggleForwardHandler(); // This should eventually lead to allowedHosts becoming empty
    }
    if (currentForwardStore.forwardHost) {
      setForwardHost(null); // This should clear forwardHost
      setForwardPeer(null);
    }
  }
</script>

{#if show}
  <DraggableOverlayBase 
    title="Forwarded Content" 
    show={show} 
    onClose={handleForwardClose}
    initialPosition={{ x: 100, y: 100 }}
    initialSize={{ width: 400, height: 350 }}
  >
    <div class="flex-grow flex flex-col overflow-hidden h-full">
      {#if currentForwardStore.forwardHost}
        <div class="iframe-container flex-grow mb-1 border border-gray-600 rounded min-h-[50px]">
          <iframe
            src={`/iframe-content.html?host=${currentForwardStore.forwardHost}`}
            class="w-full h-full bg-white"
            allowTransparency={false}
            title="Forwarded Content"
          ></iframe>
        </div>
      {/if}
      {#if currentForwardStore.logMessages.length > 0}
        <div class="log-container flex-grow bg-gray-800 p-2 overflow-y-auto text-xs border border-gray-600 rounded min-h-[50px]">
          <h3 class="text-sm font-semibold mb-1 sticky top-0 bg-gray-800 z-10">Requests:</h3>
          {#each currentForwardStore.logMessages as log (log.id)}
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
  .iframe-container, .log-container {
    min-height: 50px; 
  }
</style>
