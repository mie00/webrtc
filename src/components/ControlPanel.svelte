<script lang="ts">
  import { tick } from 'svelte';
  import { connectionStore } from '../stores/connectionStore.js';
  import { getKeysByCid } from '../stores/cidKeyStore.js';
  import { getPeerProfile } from '../stores/peerProfileStore.js';
  import { configStore } from '../stores/configStore.js';
  import { chatStore } from '../lib/chatBridge.js';
  import { fileStore, type FileTransfer } from '../lib/fileBridge.js';
  import { transcriptionDisplayStore, type TranscriptionSegment } from '../lib/media/transcriber.js';
  import MediaCarousel, { type CarouselMediaItem } from './MediaCarousel.svelte';

  import ParticipantsPanel from './ParticipantsPanel.svelte';
  import ActivityFeed, { type FeedItem } from './ActivityFeed.svelte'; // Import FeedItem type from ActivityFeed
  import InputArea from './InputArea.svelte';

  // State for panel toggle
  let isPanelOpen = $state(false);
  let controlsPanel: HTMLDivElement | null = null;

  // --- State for Transcription Display ---
  let showCompletedTranscriptions = $state(true);

  // --- State for Unread Notifications ---
  let unreadCount = $state(0);
  let lastRemoteItemCountSeen = $state(0);

  // Carousel State
  let showMediaCarousel = $state(false);
  let carouselMediaItems = $state<CarouselMediaItem[]>([]); // This will be populated by viewableMediaForCarousel from combinedFeed
  let carouselStartIndex = $state(0);

  // Get local user name directly from the config store
  const localUserName = $derived($configStore['user-name'] || 'You');

  // --- Create Combined Feed ---
  // This logic remains in ControlPanel as it's used by unreadCount logic here
  const combinedFeed = $derived((() => {
    const chatItems: FeedItem[] = ($chatStore.messages || []).map((msg, i) => {
      let senderDisplayName = msg.sender;
      if (msg.cid && msg.sender !== localUserName) {
        const keys = getKeysByCid(msg.cid);
        if (keys?.userPublicKey) {
          const profile = getPeerProfile(keys.userPublicKey);
          senderDisplayName = profile?.userName || msg.cid;
        } else {
          senderDisplayName = msg.cid;
        }
      }
      return {
        id: `chat-${msg.timestamp}-${i}`, type: 'chat', sender: senderDisplayName,
        timestamp: msg.timestamp, text: msg.text, cid: msg.cid,
      };
    });

    const fileItems: FeedItem[] = Object.values($fileStore.transfers || {}).map(transfer => {
      let senderDisplayName: string;
      if (!transfer.senderCid) {
        senderDisplayName = localUserName;
      } else {
        const keys = getKeysByCid(transfer.senderCid);
        if (keys?.userPublicKey) {
          const profile = getPeerProfile(keys.userPublicKey);
          senderDisplayName = profile?.userName || transfer.senderName || transfer.senderCid;
        } else {
          senderDisplayName = transfer.senderName || transfer.senderCid;
        }
        if (!senderDisplayName) senderDisplayName = 'Peer';
      }
      return {
        id: `file-${transfer.id}`, type: 'file', sender: senderDisplayName,
        timestamp: transfer.timestamp, transfer: transfer, cid: transfer.senderCid,
      };
    });

    const transcriptionItems: FeedItem[] = ($transcriptionDisplayStore.segments || []).map((seg, i) => ({
      id: `transcription-${seg.id || `${seg.utteranceId}-${i}`}`, type: 'transcription',
      sender: seg.speakerLabel, timestamp: seg.timestamp, segment: seg,
    }));
    
    const allItems = [...chatItems, ...fileItems, ...transcriptionItems];
    allItems.sort((a, b) => a.timestamp - b.timestamp);
    return allItems;
  })());

  // Helper function to count remote items in the feed
  function countRemoteItems(feed: FeedItem[]): number {
    if (!feed || typeof localUserName !== 'string') return 0;
    return feed.filter(item => {
      const isLocal = item.type === 'chat'
        ? item.sender === localUserName
        : (item.type === 'file' ? !item.cid : false); // Files are local if no senderCid, transcriptions are more complex
      return !isLocal;
    }).length;
  }
  
  // --- Reactive update for unreadCount ---
  let unreadCount = $state(0);
  $effect(() => {
    if (!isPanelOpen && combinedFeed && typeof localUserName === 'string') {
      const currentRemoteCount = countRemoteItems(combinedFeed);
      unreadCount = Math.max(0, currentRemoteCount - lastRemoteItemCountSeen);
    }
  });

  // Event handlers
  function togglePanel() {
    isPanelOpen = !isPanelOpen;
    if (isPanelOpen) {
      // Focus is handled by InputArea now if needed via prop
      unreadCount = 0;
      if (combinedFeed && typeof localUserName === 'string') {
        lastRemoteItemCountSeen = countRemoteItems(combinedFeed);
      }
    } else {
      if (combinedFeed && typeof localUserName === 'string') {
        lastRemoteItemCountSeen = countRemoteItems(combinedFeed);
      }
    }
  }

  function handleSentSomething() {
    if (!isPanelOpen && combinedFeed && typeof localUserName === 'string') {
      lastRemoteItemCountSeen = countRemoteItems(combinedFeed);
      unreadCount = 0;
    }
    // Potentially trigger a tick if focus needs to be managed after send
    tick().then(() => {
      // Focus logic is now primarily within InputArea based on isPanelOpen prop
    });
  }

  function handleToggleShowCompletedTranscriptions() {
    showCompletedTranscriptions = !showCompletedTranscriptions;
  }

  // This function is called by ActivityFeed via prop
  function openMediaCarousel(clickedItem: CarouselMediaItem) {
    // We need viewableMediaForCarousel. ActivityFeed calculates this.
    // For now, let's assume ActivityFeed passes the full list or ControlPanel recalculates it.
    // To keep it simple, ControlPanel can derive its own viewableMediaForCarousel if needed,
    // or ActivityFeed can pass the full list.
    // For this refactor, we'll rely on the fact that openMediaCarousel in the original
    // used a `viewableMediaForCarousel` derived from `combinedFeed`.
    // We'll need to replicate that or adjust.
    // The simplest is to have ActivityFeed pass the list of items for the carousel.
    // However, the original `openMediaCarousel` took a single `clickedItem` and then
    // set `carouselMediaItems = viewableMediaForCarousel`.
    // Let's make `ActivityFeed` pass the `viewableMediaForCarousel` list and the `clickedItem`.
    // For now, let's keep the original `openMediaCarousel` signature and have it compute
    // `viewableMediaForCarousel` from `combinedFeed` here.

    const getPlayableMediaType = (type: string) => { // Local helper for this function
        if (type?.startsWith('image/')) return 'image';
        if (type?.startsWith('video/')) return 'video';
        return null;
    };

    const currentViewableMedia: CarouselMediaItem[] = [];
    for (const item of combinedFeed) {
      if (
        item.type === 'file' &&
        item.transfer?.status === 'complete' &&
        item.transfer.url &&
        (getPlayableMediaType(item.transfer.type) === 'image' ||
         getPlayableMediaType(item.transfer.type) === 'video')
      ) {
        currentViewableMedia.push({
          id: item.id, type: 'file', sender: item.sender, timestamp: item.timestamp,
          transfer: item.transfer as FileTransfer & { url: string }, cid: item.cid,
        });
      }
    }
    carouselMediaItems = currentViewableMedia;
    const clickedItemIndex = carouselMediaItems.findIndex(item => item.id === clickedItem.id);

    if (clickedItemIndex !== -1) {
      carouselStartIndex = clickedItemIndex;
      showMediaCarousel = true;
    } else if (carouselMediaItems.length > 0) {
      carouselStartIndex = 0;
      showMediaCarousel = true;
    } else {
      console.warn("No viewable media items for carousel, or clicked item not found.");
    }
  }
</script>

<div
     bind:this={controlsPanel}
     id="test-control-panel"
     class="w-11/12 lg:w-1/2 xl:w-1/4 2x:w-1/4 flex flex-col fixed bottom-0 top-0"
     class:left-full={!isPanelOpen}
     class:right-0={isPanelOpen}
>
  <div class="absolute top-1/4">
    <button
      id="test-toggle-panel-button"
      onclick={togglePanel}
      class="relative hover:bg-blue-600 w-5 h-16 bg-gray-300 text-black p-0 border-solid rounded-l"
      style="left: -20px;"
      aria-label={isPanelOpen ? "Close panel" : `Open panel (${unreadCount} unread)`}
    >
      {isPanelOpen ? '>' : '<'}
      {#if unreadCount > 0 && !isPanelOpen}
        <span 
          class="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 bg-red-500 text-white text-xs rounded-full h-4 w-4 min-w-[1rem] flex items-center justify-center leading-none p-0.5"
          style="font-size: 0.6rem;"
          aria-hidden="true"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      {/if}
    </button>
  </div>
  <div class="bg-gray-200 p-4 flex flex-col space-y-4 w-full h-full overflow-y-auto">
    <ParticipantsPanel />

    <ActivityFeed
      {combinedFeed}
      {localUserName}
      {showCompletedTranscriptions}
      onOpenMediaCarousel={openMediaCarousel}
    />

    <InputArea
      {isPanelOpen}
      onSentSomething={handleSentSomething}
      {showCompletedTranscriptions}
      onToggleShowCompletedTranscriptions={handleToggleShowCompletedTranscriptions}
    />
  </div>
</div>

<MediaCarousel
  items={carouselMediaItems}
  startIndex={carouselStartIndex}
  show={showMediaCarousel}
  onClose={() => showMediaCarousel = false}
/>
