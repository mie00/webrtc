<script lang="ts">
  import DraggableOverlayBase from './DraggableOverlayBase.svelte';
  import { transcriberStore, transcriptionDisplayStore, stopOverallTranscription, type TranscriptionSegment } from '../lib/media/transcriber.js';
  import { onDestroy, onMount } from 'svelte';

  const currentTranscriberStore = $derived(transcriberStore);
  const currentDisplayStore = $derived(transcriptionDisplayStore);
  
  const show = $derived(currentTranscriberStore.isTranscribingOverall);

  let overlayContentElement: HTMLElement | undefined = $state();

  function handleTranscriptionClose() {
    stopOverallTranscription();
  }

  // Auto-scroll logic
  let autoScroll = $state(true);
  let lastScrollHeight = $state(0);

  $effect(() => {
    if (show && overlayContentElement && autoScroll) {
      // Check if we were near the bottom before new content was added
      const isNearBottom = overlayContentElement.scrollHeight - overlayContentElement.scrollTop - overlayContentElement.clientHeight < 50;
      
      if (isNearBottom || overlayContentElement.scrollHeight !== lastScrollHeight) {
        overlayContentElement.scrollTop = overlayContentElement.scrollHeight;
        lastScrollHeight = overlayContentElement.scrollHeight;
      }
    }
  });

  function handleScroll() {
    if (overlayContentElement) {
      // If user scrolls up, disable auto-scroll. If they scroll to bottom, re-enable.
      const isAtBottom = overlayContentElement.scrollHeight - overlayContentElement.scrollTop <= overlayContentElement.clientHeight + 5; // +5 for buffer
      if (isAtBottom) {
        autoScroll = true;
      } else {
        autoScroll = false;
      }
    }
  }

</script>

{#if show}
  <DraggableOverlayBase 
    title="Live Transcription" 
    show={show} 
    onClose={handleTranscriptionClose}
    initialPosition={{ x: 150, y: 150 }}
    initialSize={{ width: 450, height: 300 }}
  >
    <div bind:this={overlayContentElement} class="transcription-content flex-grow overflow-y-auto p-2 text-sm bg-gray-800 rounded h-full" onscroll={handleScroll}>
      {#each currentDisplayStore.segments as segment (segment.id)}
        <div class="mb-1">
          <span class="font-semibold text-blue-300">{segment.speakerLabel}:</span>
          <span class="ml-1 text-gray-100">{segment.text}</span>
        </div>
      {/each}
      {#each Object.values(currentDisplayStore.activeBuffers) as buffer (buffer.sessionId)}
        {#if buffer.text && buffer.text.length > 0}
          <div class="mt-1">
            <span class="font-semibold text-gray-400">{buffer.speakerLabel} (thinking...):</span>
            <span class="ml-1 text-gray-400">{buffer.text}</span>
          </div>
        {/if}
      {/each}
      {#if currentDisplayStore.segments.length === 0 && Object.values(currentDisplayStore.activeBuffers).every(b => !b.text || b.text.length === 0)}
        <p class="text-gray-500 italic">Waiting for transcription...</p>
      {/if}
    </div>
  </DraggableOverlayBase>
{/if}

<style>
  .transcription-content {
    font-family: monospace;
    white-space: pre-wrap; /* Allows text to wrap but respects multiple spaces */
    word-break: break-word; /* Ensures long words break to prevent overflow */
  }
</style>
