<script lang="ts">
  import { onDestroy } from 'svelte';
  import { forwardStore, toggleForwardHandler, type LogMessage } from '../lib/forwardBridge.js';

  let allowedHosts: string[] = $state([]);
  let forwardHost : string | null = $state(null);
  let logMessages: LogMessage[] = $state([]);
  let showOverlay = $state(false);

  let isMinimized = $state(false);
  let position = $state({ x: 100, y: 100 }); // Initial position
  let size = $state({ width: 400, height: 300 }); // Default size, can be made resizable later

  let isDragging = $state(false);
  let dragStart = $state({ x: 0, y: 0 });
  let overlayElement: HTMLElement | undefined = $state();

  const unsubscribeForwardStore = forwardStore.subscribe(value => {
    allowedHosts = value.allowedHosts;
    forwardHost = value.forwardHost;
    logMessages = value.logMessages;
    showOverlay = !!(allowedHosts.length) || !!forwardHost;
    if (!(allowedHosts.length) && !forwardHost) {
      isMinimized = false; // Reset minimized state when forwarding stops
    }
  });

  onDestroy(() => {
    unsubscribeForwardStore();
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  });

  function handleMouseDown(event: MouseEvent) {
    if (event.target !== overlayElement && !(event.target as HTMLElement).closest('.overlay-header')) {
      return;
    }
    isDragging = true;
    // Get mouse cursor position at startup:
    dragStart.x = event.clientX - position.x;
    dragStart.y = event.clientY - position.y;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isDragging) return;
    event.preventDefault();
    // Calculate the new cursor position:
    position.x = event.clientX - dragStart.x;
    position.y = event.clientY - dragStart.y;
  }

  function handleMouseUp() {
    isDragging = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }

  function toggleMinimize() {
    isMinimized = !isMinimized;
  }

  async function handleClose() {
    await toggleForwardHandler();
  }
</script>

{#if showOverlay}
  <div
    bind:this={overlayElement}
    class="fixed bg-gray-700 border border-gray-500 rounded-lg shadow-xl text-white z-50 flex flex-col"
    style="left: {position.x}px; top: {position.y}px; width: {size.width}px; {isMinimized ? 'height: 3rem;' : `height: ${size.height}px;`}"
  >
    <div
      class="overlay-header bg-gray-800 p-2 rounded-t-lg cursor-grab flex justify-between items-center"
      onmousedown={handleMouseDown} role="button" tabindex="0"
    >
      <span class="font-semibold">Forwarded Content</span>
      <div class="flex space-x-2">
        <button onclick={toggleMinimize} class="hover:bg-gray-600 p-1 rounded">
          {isMinimized ? '🗖' : '🗕'}
        </button>
        <button onclick={handleClose} class="hover:bg-red-500 p-1 rounded">
          ✕
        </button>
      </div>
    </div>

    {#if !isMinimized}
      <div class="flex-grow flex flex-col overflow-hidden p-1">
        {#if forwardHost}
          <div class="iframe-container flex-grow mb-1 border border-gray-600 rounded">
            <iframe
              src={`/iframe-content.html?host=${forwardHost}`}
              class="w-full h-full bg-white"
              allowTransparency={false}
              title="Forwarded Content"
            ></iframe>
          </div>
        {/if}
        {#if logMessages.length > 0}
          <div class="log-container flex-grow bg-gray-800 p-2 overflow-y-auto text-xs border border-gray-600 rounded">
            <h3 class="text-sm font-semibold mb-1 sticky top-0 bg-gray-800">Requests:</h3>
            {#each logMessages as log (log.id)}
              <p class="font-mono break-all">
                <span class="mr-2">{log.status}</span>{log.text}
              </p>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .cursor-grab {
    cursor: grab;
  }
  .cursor-grab:active {
    cursor: grabbing;
  }
  .iframe-container, .log-container {
    min-height: 50px; /* Ensure they don't collapse completely */
  }
</style>
