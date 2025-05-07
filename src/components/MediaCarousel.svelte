<script context="module" lang="ts">
  
  // This interface should be kept in sync with CarouselMediaItem in ControlPanel.svelte
  // or ideally defined in a shared types file.
  export interface CarouselMediaItem {
    id: string;
    type: 'file';
    sender: string;
    timestamp: number;
    transfer: FileTransfer & { url: string }; // URL must exist
    cid?: string;
  }
</script>
<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';
  import type { FileTransfer } from '../lib/fileBridge.js';


  export let items: CarouselMediaItem[] = [];
  export let startIndex: number = 0;
  export let show: boolean = false;

  const dispatch = createEventDispatcher();

  let currentIndex = 0;
  let currentItem: CarouselMediaItem | undefined;
  let mediaElement: HTMLImageElement | HTMLVideoElement | null = null;

  // Reactive updates for currentIndex and currentItem
  $: {
    if (show && items.length > 0) {
      currentIndex = Math.max(0, Math.min(startIndex, items.length - 1));
    }
  }
  $: currentItem = items[currentIndex];
  $: if (currentItem && mediaElement && currentItem.transfer.type.startsWith('video/')) {
      // Ensure video reloads and autoplays if it's a video element
      tick().then(() => {
        const video = mediaElement as HTMLVideoElement;
        video.load(); // Reload the source
        video.play().catch(e => console.warn("Autoplay prevented for video:", e));
      });
  }


  function closeCarousel() {
    dispatch('close');
  }

  function nextItem() {
    if (items.length === 0) return;
    currentIndex = (currentIndex + 1) % items.length;
  }

  function prevItem() {
    if (items.length === 0) return;
    currentIndex = (currentIndex - 1 + items.length) % items.length;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!show) return;
    if (event.key === 'Escape') {
      closeCarousel();
    } else if (event.key === 'ArrowRight') {
      nextItem();
    } else if (event.key === 'ArrowLeft') {
      prevItem();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });

  // Helper to get playable type, similar to ControlPanel
  function getPlayableMediaType(fileType: string): 'video' | 'image' | null {
    if (fileType?.startsWith('video/')) return 'video';
    if (fileType?.startsWith('image/')) return 'image';
    return null;
  }
</script>

{#if show && currentItem}
  <div
    class="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[1000] p-4"
    on:click|self={closeCarousel}
    on:keypress|stopPropagation
    role="dialog"
    tabindex="0"
    aria-modal="true"
    aria-labelledby="carousel-sender-name"
  >
    <div class="relative bg-gray-900 p-3 md:p-5 rounded-xl max-w-full max-h-full w-auto h-auto flex flex-col shadow-2xl outline-none" tabindex="-1">
      <!-- Close Button -->
      <button
        on:click={closeCarousel}
        class="absolute top-2 right-2 md:-top-3 md:-right-3 bg-red-600 text-white rounded-full w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-xl md:text-2xl z-10 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
        aria-label="Close media viewer"
      >
        &times;
      </button>

      <!-- Sender Info -->
      <div class="text-center mb-2 md:mb-3">
        <p id="carousel-sender-name" class="text-sm md:text-base text-gray-300">
          From: <span class="font-semibold text-gray-100">{currentItem.sender}</span>
          {#if currentItem.transfer?.name}
            <span class="text-xs text-gray-400 block truncate max-w-xs mx-auto" title={currentItem.transfer.name}>({currentItem.transfer.name})</span>
          {/if}
        </p>
      </div>

      <!-- Media Display Area -->
      <div class="flex-grow flex items-center justify-center overflow-hidden min-h-[200px] md:min-h-[300px]">
        {#if currentItem.transfer && currentItem.transfer.url}
          {@const mediaType = getPlayableMediaType(currentItem.transfer.type)}
          {#if mediaType === 'image'}
            <img
              bind:this={mediaElement}
              src={currentItem.transfer.url}
              alt={currentItem.transfer.name || 'Viewed image'}
              class="max-w-full max-h-[calc(90vh-150px)] md:max-h-[calc(85vh-120px)] object-contain rounded-md"
            />
          {:else if mediaType === 'video'}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={mediaElement}
              src={currentItem.transfer.url}
              controls
              autoplay
              class="max-w-full max-h-[calc(90vh-150px)] md:max-h-[calc(85vh-120px)] rounded-md aspect-video"
              on:error={(e) => console.error('Video playback error:', e)}
            ></video>
          {:else}
            <p class="text-white p-5 bg-gray-700 rounded">Unsupported media type for carousel.</p>
          {/if}
        {:else}
          <p class="text-white p-5 bg-gray-700 rounded">Media URL not available.</p>
        {/if}
      </div>

      <!-- Navigation Buttons -->
      {#if items.length > 1}
        <div class="flex justify-between items-center mt-3 md:mt-4 pt-2 border-t border-gray-700">
          <button
            on:click|stopPropagation={prevItem}
            class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Previous item"
          >
            &larr; <span class="hidden sm:inline">Prev</span>
          </button>
          <p class="text-sm text-gray-400 tabular-nums">
            {currentIndex + 1} / {items.length}
          </p>
          <button
            on:click|stopPropagation={nextItem}
            class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            aria-label="Next item"
          >
            <span class="hidden sm:inline">Next</span> &rarr;
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<svelte:window on:keydown={handleKeydown} />
