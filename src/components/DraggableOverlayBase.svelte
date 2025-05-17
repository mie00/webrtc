<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  let { 
    title = "Overlay", 
    show = false, 
    initialPosition = { x: 50, y: 50 }, 
    initialSize = { width: 350, height: 250 },
    onClose = () => {}
  }: {
    title?: string;
    show?: boolean;
    initialPosition?: { x: number, y: number };
    initialSize?: { width: number, height: number };
    onClose?: () => void;
  } = $props();

  let isMinimized = $state(false);
  let position = $state({ ...initialPosition });
  let size = $state({ ...initialSize });

  let isDragging = $state(false);
  let dragStart = $state({ x: 0, y: 0 });
  let overlayElement: HTMLElement | undefined = $state();

  let isResizing = $state(false);
  let resizeStart = $state({ x: 0, y: 0, width: 0, height: 0 });
  const minSize = $state({ width: 200, height: 100 }); // Minimum dimensions for overlay

  function handleOverlayMouseDown(event: MouseEvent) {
    if (event.target !== overlayElement && !(event.target as HTMLElement).closest('.overlay-header-draggable-area')) {
      return;
    }
    isDragging = true;
    dragStart.x = event.clientX - position.x;
    dragStart.y = event.clientY - position.y;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isDragging) return;
    event.preventDefault();
    position.x = event.clientX - dragStart.x;
    position.y = event.clientY - dragStart.y;
  }

  function handleMouseUp() {
    if (isDragging) {
      isDragging = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
  }

  function handleResizeMouseDown(event: MouseEvent) {
    event.stopPropagation(); 
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
    if (isResizing) {
      isResizing = false;
      window.removeEventListener('mousemove', handleResizeMouseMove);
      window.removeEventListener('mouseup', handleResizeMouseUp);
    }
  }

  function toggleMinimize() {
    isMinimized = !isMinimized;
    if (!isMinimized) {
      // Ensure size is reasonable when un-minimizing
      size.height = Math.max(size.height, minSize.height);
      size.width = Math.max(size.width, minSize.width);
    }
  }
  
  // Ensure event listeners are cleaned up
  onMount(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleResizeMouseMove);
      window.removeEventListener('mouseup', handleResizeMouseUp);
    };
  });

</script>

{#if show}
  <div
    bind:this={overlayElement}
    class="fixed bg-gray-700 border border-gray-500 rounded-lg shadow-xl text-white z-50 flex flex-col"
    style="left: {position.x}px; top: {position.y}px; width: {size.width}px; {isMinimized ? 'height: 3rem;' : `height: ${size.height}px;`}"
  >
    <div
      class="overlay-header-draggable-area bg-gray-800 p-2 rounded-t-lg cursor-grab flex justify-between items-center"
      onmousedown={handleOverlayMouseDown} role="button" tabindex="0"
    >
      <span class="font-semibold select-none">{title}</span>
      <div class="flex space-x-2">
        <button onclick={toggleMinimize} class="hover:bg-gray-600 p-1 rounded text-xs w-6 h-6 flex items-center justify-center" aria-label={isMinimized ? 'Maximize' : 'Minimize'}>
          {isMinimized ? '🗖' : '🗕'}
        </button>
        <button onclick={onClose} class="hover:bg-red-500 p-1 rounded text-xs w-6 h-6 flex items-center justify-center" aria-label="Close">
          ✕
        </button>
      </div>
    </div>

    {#if !isMinimized}
      <div class="flex-grow flex flex-col overflow-hidden p-1">
        <slot></slot> <!-- Content goes here -->
      </div>
      <div
        class="resize-handle"
        onmousedown={handleResizeMouseDown}
        role="slider"
        aria-valuenow="0"
        aria-label="Resize overlay"
        tabindex="0"
      ></div>
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
  .resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
    background: rgba(255,255,255,0.1);
    border-top: 1px solid transparent;
    border-left: 1px solid transparent;
    border-right: 1px solid #fff;
    border-bottom: 1px solid #fff;
    opacity: 0.5;
  }
  .resize-handle:hover {
    opacity: 1;
    background: rgba(255,255,255,0.3);
  }
</style>
