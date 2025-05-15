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

  let isResizing = $state(false);
  let resizeStart = $state({ x: 0, y: 0, width: 0, height: 0 });
  const minSize = $state({ width: 200, height: 150 }); // Minimum dimensions

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
    window.removeEventListener('mousemove', handleResizeMouseMove);
    window.removeEventListener('mouseup', handleResizeMouseUp);
  });

  function handleOverlayMouseDown(event: MouseEvent) {
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

  function handleResizeMouseDown(event: MouseEvent) {
    event.stopPropagation(); // Prevent triggering overlay drag
    isResizing = true;
    resizeStart.x = event.clientX;
    resizeStart.y = event.clientY;
    resizeStart.width = size.width;
    resizeStart.height = size.height;
    window.addEventListener('mousemove', handleResizeMouseMove);
    window.addEventListener('mouseup', handleResizeMouseUp);
  }

  function handleResizeMouseMove(event: MouseEvent) {
    if (!isResizing) return;
    event.preventDefault();
    const dx = event.clientX - resizeStart.x;
    const dy = event.clientY - resizeStart.y;
    size.width = Math.max(minSize.width, resizeStart.width + dx);
    size.height = Math.max(minSize.height, resizeStart.height + dy);
  }

  function handleResizeMouseUp() {
    isResizing = false;
    window.removeEventListener('mousemove', handleResizeMouseMove);
    window.removeEventListener('mouseup', handleResizeMouseUp);
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
      onmousedown={handleOverlayMouseDown} role="button" tabindex="0"
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
  .resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
    /* Optional: add a visual indicator for the handle */
    /* background: rgba(255,255,255,0.2); */
    /* border-top: 2px solid transparent;
    border-left: 2px solid transparent;
    border-right: 2px solid #fff;
    border-bottom: 2px solid #fff; */
  }
  .resize-handle:hover {
    /* background: rgba(255,255,255,0.4); */
  }
</style>
