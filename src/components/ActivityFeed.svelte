<script lang="ts">
  import type { FileTransfer } from '../lib/fileBridge';
  import type { TranscriptionSegment } from '../lib/media/transcriber';
  import type { CarouselMediaItem } from './MediaCarousel.svelte';

  // --- Types for Combined Feed Item (Prop) ---
  // This definition is moved from ControlPanel.svelte
  export type FeedItem = {
    id: string;
    type: 'chat' | 'file' | 'transcription';
    sender: string;
    timestamp: number;
    text?: string;
    transfer?: FileTransfer & { url?: string }; // Ensure url is part of transfer for direct use
    segment?: TranscriptionSegment;
    cid?: string;
  };

  let { combinedFeed, localUserName, showCompletedTranscriptions, onOpenMediaCarousel } = $props<{
    combinedFeed: FeedItem[];
    localUserName: string;
    showCompletedTranscriptions: boolean;
    onOpenMediaCarousel: (item: CarouselMediaItem) => void;
  }>();

  let chatOutputContainer: HTMLDivElement | null = $state(null);

  // Helper function to determine if media is playable and its type
  // Moved from ControlPanel.svelte
  function getPlayableMediaType(fileType: string): 'audio' | 'video' | 'image' | null {
    if (fileType?.startsWith('audio/')) {
      return 'audio';
    }
    if (fileType?.startsWith('video/')) {
      return 'video';
    }
    if (fileType?.startsWith('image/')) {
      return 'image';
    }
    return null;
  }

  // Filter combinedFeed for items suitable for the carousel
  // Moved and adapted from ControlPanel.svelte
  const viewableMediaForCarousel = $derived.by(() => {
    const result: CarouselMediaItem[] = [];
    if (!combinedFeed) return result; // Guard against undefined combinedFeed

    for (const item of combinedFeed) {
      if (
        item.type === 'file' &&
        item.transfer?.status === 'complete' &&
        item.transfer.url && // Ensure URL exists
        (getPlayableMediaType(item.transfer.type) === 'image' ||
          getPlayableMediaType(item.transfer.type) === 'video')
      ) {
        // Type assertion: we've checked all necessary conditions for CarouselMediaItem
        result.push({
          id: item.id,
          type: 'file', // Known
          sender: item.sender,
          timestamp: item.timestamp,
          transfer: item.transfer as FileTransfer & { url: string }, // Cast here
          cid: item.cid
        });
      }
    }
    return result;
  });

  // Auto-scroll combined feed
  // Moved from ControlPanel.svelte
  $effect(() => {
    if (chatOutputContainer) {
      // Scroll to the bottom instantly
      chatOutputContainer.scrollTop = chatOutputContainer.scrollHeight;
    }
  });
</script>

<!-- Combined Chat and File Transfer Feed -->
<div class="flex-1 flex flex-col min-h-0 border-t border-gray-300 pt-4 mt-4">
  <h3 class="text-lg font-semibold mb-2 px-4">Activity Feed</h3>
  <!-- Feed Area -->
  <div
    bind:this={chatOutputContainer}
    id="test-chat-container"
    class="flex-1 overflow-y-auto px-4 py-2 space-y-4"
  >
    {#if combinedFeed.length === 0}
      <p class="text-sm text-gray-500 italic">Messages and file transfers will appear here...</p>
    {:else}
      {#each combinedFeed as item (item.id)}
        <!-- Determine if the item is from the local user -->
        {@const isLocalUser =
          item.type === 'chat'
            ? item.sender === localUserName // Local chat message if sender matches
            : item.type === 'file'
              ? !item.cid // Local file transfer if senderCid is missing
              : item.type === 'transcription' && item.segment
                ? item.segment.sessionId.startsWith('local|') // Local transcription segment
                : false}

        {#if item.type === 'transcription' ? showCompletedTranscriptions : true}
          <!-- Add data-filename for file transfers to help test selectors -->
          <div
            class="flex"
            class:justify-end={isLocalUser}
            class:justify-start={!isLocalUser}
            data-filename={item.type === 'file' ? item.transfer?.name : null}
          >
            <div
              class="p-3 rounded-lg shadow max-w-[90%] break-words"
              class:bg-blue-100={isLocalUser && item.type !== 'transcription'}
              class:bg-gray-100={!isLocalUser && item.type !== 'transcription'}
              class:bg-gray-50={item.type === 'transcription'}
              class:dark:bg-gray-700={item.type === 'transcription'}
            >
              <!-- Always display sender name, use title for CID -->
              <p
                data-testid="sender-name"
                class="text-xs font-semibold mb-1"
                class:text-blue-800={isLocalUser && item.type !== 'transcription'}
                class:dark:text-blue-300={isLocalUser && item.type !== 'transcription'}
                class:text-gray-600={!isLocalUser && item.type !== 'transcription'}
                class:dark:text-gray-400={!isLocalUser && item.type !== 'transcription'}
                class:text-teal-700={item.type === 'transcription'}
                class:dark:text-teal-300={item.type === 'transcription'}
                title={item.type === 'transcription' && item.segment
                  ? `Transcribed from: ${item.segment.sessionId}`
                  : item.cid
                    ? `CID: ${item.cid}`
                    : 'Local Sender'}
              >
                {item.sender}
                <!-- Always display sender name (localUserName, Peer, CID, etc.) -->
              </p>

              {#if item.type === 'chat'}
                <p data-testid="chat-message" class="text-sm">{item.text}</p>
              {:else if item.type === 'file' && item.transfer}
                {@const transfer = item.transfer}
                {@const playableMediaType = getPlayableMediaType(transfer.type)}

                <!-- Standard File Info View -->
                <div class="space-y-1">
                  <p
                    data-testid="filename"
                    class="text-sm font-medium truncate"
                    title={transfer.name}
                  >
                    {transfer.name}
                  </p>

                  {#if transfer.status === 'complete' && playableMediaType && transfer.url}
                    <!-- Inline Player View - Always shown for completed playable media -->
                    <div class="my-2">
                      {#if playableMediaType === 'video'}
                        <div
                          class="cursor-pointer"
                          role="button"
                          tabindex="0"
                          onclick={() => {
                            const cItem = viewableMediaForCarousel.find((mi) => mi.id === item.id);
                            if (cItem) onOpenMediaCarousel(cItem);
                          }}
                          onkeydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              const cItem = viewableMediaForCarousel.find(
                                (mi) => mi.id === item.id
                              );
                              if (cItem) onOpenMediaCarousel(cItem);
                              e.preventDefault();
                            }
                          }}
                          aria-label={`View video: ${transfer.name}`}
                        >
                          <!-- svelte-ignore a11y_media_has_caption -->
                          <video
                            src={transfer.url}
                            controls
                            class="w-full rounded aspect-video pointer-events-none"
                          ></video>
                        </div>
                      {:else if playableMediaType === 'image'}
                        <div
                          class="cursor-pointer"
                          role="button"
                          tabindex="0"
                          onclick={() => {
                            const cItem = viewableMediaForCarousel.find((mi) => mi.id === item.id);
                            if (cItem) onOpenMediaCarousel(cItem);
                          }}
                          onkeydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              const cItem = viewableMediaForCarousel.find(
                                (mi) => mi.id === item.id
                              );
                              if (cItem) onOpenMediaCarousel(cItem);
                              e.preventDefault();
                            }
                          }}
                          aria-label={`View image: ${transfer.name}`}
                        >
                          <img
                            src={transfer.url}
                            alt={transfer.name}
                            class="w-full rounded max-h-60 object-contain my-2 pointer-events-none"
                            onerror={(e) => {
                              console.error(
                                'Image failed to load. URL:',
                                transfer.url,
                                'Transfer object:',
                                JSON.stringify(transfer)
                              );
                            }}
                          />
                        </div>
                      {:else if playableMediaType === 'audio'}
                        <audio src={transfer.url} controls class="w-full"></audio>
                      {/if}
                    </div>
                  {/if}

                  {#if transfer.status !== 'complete' && transfer.status !== 'error'}
                    <div class="flex items-center space-x-2">
                      <progress
                        data-testid="progress-bar"
                        class="w-full h-2 rounded"
                        value={transfer.progress}
                        max="100"
                      ></progress>
                      <span class="text-xs font-mono flex-shrink-0">{transfer.progress}%</span>
                    </div>
                  {/if}

                  {#if transfer.status === 'sending'}
                    <p data-testid="status" class="text-xs text-blue-600">Sending...</p>
                  {:else if transfer.status === 'receiving'}
                    <p data-testid="status" class="text-xs text-blue-600">Receiving...</p>
                  {:else if transfer.status === 'complete'}
                    <p data-testid="status" class="text-xs text-green-600">Completed</p>
                    {#if transfer.url}
                      <div class="flex flex-wrap gap-2 mt-1">
                        <a
                          data-testid="download-link"
                          href={transfer.url}
                          download={transfer.name}
                          class="flex-1 text-center py-1 px-2 bg-green-500 text-white text-xs rounded shadow hover:bg-green-600 min-w-[calc(50%-0.25rem)]"
                        >
                          Download
                        </a>
                        <a
                          data-testid="view-link"
                          href={transfer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="flex-1 text-center py-1 px-2 bg-blue-500 text-white text-xs rounded shadow hover:bg-blue-600 min-w-[calc(50%-0.25rem)]"
                        >
                          View
                        </a>
                      </div>
                    {:else}
                      <p data-testid="status" class="text-xs text-gray-500 mt-1">
                        (URL not available)
                      </p>
                    {/if}
                  {:else if transfer.status === 'error'}
                    <p data-testid="status" class="text-xs text-red-600" title={transfer.error}>
                      Error: {transfer.error || 'Transfer failed'}
                    </p>
                  {/if}
                </div>
              {:else if item.type === 'transcription' && item.segment}
                {@const segment = item.segment}
                <div class="transcription-segment text-sm" data-testid="transcription-segment">
                  <p class="text-gray-700 dark:text-gray-100">{segment.text}</p>
                  <!-- Optionally, display beg/end times or other segment details if needed -->
                  <!-- <p class="text-xs text-gray-400">{segment.beg} - {segment.end}</p> -->
                </div>
              {/if}
            </div>
          </div>
        {/if}
        <!-- End of #if for showCompletedTranscriptions -->
      {/each}
    {/if}
  </div>
</div>
