<script lang="ts">
  import { createEventDispatcher, onDestroy, afterUpdate, tick } from 'svelte';
  import { connectionStore, type ConnectionState } from '../stores/connectionStore.js';
  import { configStore } from '../stores/configStore.js';
  import { chatStore, type ChatState } from '../lib/chatBridge.js';
  import { fileStore, type FileState, type FileTransfer } from '../lib/fileBridge.js';
  import MediaCarousel, { type CarouselMediaItem } from './MediaCarousel.svelte'; // Import Carousel

  // --- Types for Staged Files ---
  interface StagedFile {
    id: string;
    file: File;
    thumbnailUrl: string | null; // URL for image previews (Data URL)
  }

  // --- Types for Combined Feed ---
  interface FeedItem { // This is for the general feed
    id: string; // Unique ID for the #each block key
    type: 'chat' | 'file';
    sender: string;
    timestamp: number; // For sorting
    text?: string; // For chat
    transfer?: FileTransfer; // For files
    cid?: string; // Added: Original sender CID (if available)
  }

  const dispatch = createEventDispatcher();

  // State for panel toggle, chat, file upload
  let isPanelOpen = false;
  let message = '';
  let chatInput: HTMLInputElement;
  let controlsPanel: HTMLDivElement;
  let uploadField: HTMLInputElement;
  let chatOutputContainer: HTMLDivElement;
  // let canUpload = true; // Replaced by isSending and stagedFiles logic

  // --- New State for Staged Files & Sending ---
  let stagedFiles: StagedFile[] = [];
  let isSending = false; // To disable input/buttons during send operation

  // Carousel State
  let showMediaCarousel = false;
  let carouselMediaItems: CarouselMediaItem[] = [];
  let carouselStartIndex = 0;

  // Subscribe to connection store
  let connectionState: ConnectionState = { directClients: {}, participants: {} };
  const unsubscribe = connectionStore.subscribe(value => {
    connectionState = value;
  });

  // Subscribe to chat store
  let chatState: ChatState = { messages: [] };
  const unsubscribeChat = chatStore.subscribe(value => {
    chatState = value;
  });

  // Subscribe to file store
  let fileState: FileState = { transfers: {} };
  const unsubscribeFile = fileStore.subscribe(value => {
    fileState = value;
  });

  // Helper function to determine if media is playable and its type
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

  onDestroy(() => {
    unsubscribe(); // Unsubscribe from connectionStore
    unsubscribeChat(); // Unsubscribe from chatStore
    unsubscribeFile(); // Unsubscribe from fileStore
    // Data URLs from FileReader (used for thumbnails) don't need explicit revocation.
    // If URL.createObjectURL were used, cleanup would be needed here.
  });

  // --- Helper Functions for Staged Files ---
  function generateThumbnailUrl(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => resolve(null); // Fallback if reading fails
        reader.readAsDataURL(file);
      } else {
        resolve(null); // No thumbnail for non-images, UI can use a generic icon
      }
    });
  }

  function uuidv4(): string {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
      (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
  }

  async function addFilesToStaging(files: FileList | null) {
    if (!files || files.length === 0 || isSending) return;

    const newStagedFileEntries: StagedFile[] = [];
    for (const file of Array.from(files)) {
      const thumbnailUrl = await generateThumbnailUrl(file);
      newStagedFileEntries.push({ id: uuidv4(), file, thumbnailUrl });
    }
    stagedFiles = [...stagedFiles, ...newStagedFileEntries];

    if (chatInput) {
      chatInput.focus();
    }
  }

  function removeStagedFile(fileIdToRemove: string) {
    stagedFiles = stagedFiles.filter(sf => sf.id !== fileIdToRemove);
    // If thumbnails were blob URLs (from URL.createObjectURL), revoke here:
    // const fileToRemove = stagedFiles.find(f => f.id === fileIdToRemove);
    // if (fileToRemove?.thumbnailUrl?.startsWith('blob:')) { URL.revokeObjectURL(fileToRemove.thumbnailUrl); }
  }


  // Get local user name directly from the config store
  $: localUserName = $configStore['user-name'] || 'You';

  // --- Create Combined Feed ---
  $: combinedFeed = (() => {
    const chatItems: FeedItem[] = chatState.messages.map((msg, i) => ({
      id: `chat-${msg.timestamp}-${i}`,
      type: 'chat',
      sender: msg.sender, // Display name
      timestamp: msg.timestamp,
      text: msg.text,
      cid: msg.cid, // Pass CID for chat messages
    }));

    const fileItems: FeedItem[] = Object.values(fileState.transfers).map(transfer => {
      // Determine sender display name:
      let senderDisplayName: string;
      if (!transfer.senderCid) {
        // Local file (sending or completed)
        senderDisplayName = localUserName;
      } else {
        // Remote file: Prioritize senderName, fallback explicitly to senderCid.
        senderDisplayName = transfer.senderName || transfer.senderCid; // Use name or CID
        // If both senderName and senderCid were somehow missing, fallback to 'Peer'
        if (!senderDisplayName) {
            senderDisplayName = 'Peer';
        }
      }

      return {
        id: `file-${transfer.id}`,
        type: 'file',
        sender: senderDisplayName, // Use determined display name
        timestamp: transfer.timestamp, // Use the timestamp from the transfer object
        transfer: transfer,
        cid: transfer.senderCid, // Pass sender CID for files (will be undefined for local sends)
      };
    });

    // Combine and sort by timestamp
    const allItems = [...chatItems, ...fileItems];
    allItems.sort((a, b) => a.timestamp - b.timestamp);
    return allItems;
  })();

  // Filter combinedFeed for items suitable for the carousel
  $: viewableMediaForCarousel = (() => {
    const result: CarouselMediaItem[] = [];
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
          cid: item.cid,
        });
      }
    }
    return result;
  })();

  function openMediaCarousel(clickedItem: CarouselMediaItem) {
    carouselMediaItems = viewableMediaForCarousel; // Use the pre-filtered and typed list
    const clickedItemIndex = carouselMediaItems.findIndex(item => item.id === clickedItem.id);

    if (clickedItemIndex !== -1) {
      carouselStartIndex = clickedItemIndex;
      showMediaCarousel = true;
    } else if (carouselMediaItems.length > 0) {
      // Fallback if somehow the clicked item isn't in the list (should be rare)
      carouselStartIndex = 0;
      showMediaCarousel = true;
    } else {
      console.warn("No viewable media items for carousel, or clicked item not found in the filtered list.");
    }
  }


  // Auto-scroll combined feed
  afterUpdate(() => {
    if (chatOutputContainer && !showMediaCarousel) { // Don't auto-scroll if carousel is open
      // Scroll to the bottom instantly
      chatOutputContainer.scrollTop = chatOutputContainer.scrollHeight;
    }
  });

  // Event handlers
  function togglePanel() {
    isPanelOpen = !isPanelOpen;
    if (isPanelOpen) {
      chatInput.focus();
    }
  }
  
  function handleKeyPress(event: KeyboardEvent) {
    // Send on Enter (if not Shift+Enter for newline), and if not currently sending
    if (event.key === 'Enter' && !event.shiftKey && !isSending) {
      event.preventDefault(); // Prevent default Enter behavior (e.g., adding a newline)
      triggerSend();
    }
  }
  
  async function triggerSend() {
    if (isSending) return; // Prevent concurrent sends
    if (!message.trim() && stagedFiles.length === 0) return; // Nothing to send

    isSending = true;

    try {
      // 1. Send text message if present
      if (message.trim()) {
        const senderName = $configStore['user-name'] || 'You';
        const { sendChatMessage } = await import('../lib/chatBridge.js');
        await sendChatMessage(message.trim(), senderName); // Assuming sendChatMessage is async
        message = ''; // Clear message input after successful send
      }

      // 2. Send all staged files
      if (stagedFiles.length > 0) {
        const { sendFile } = await import('../lib/fileBridge.js');
        // Create a copy of the array to iterate over, as sendFile might be slow
        // and we want to clear the UI staging area optimistically or upon completion.
        const filesToSend = [...stagedFiles];
        stagedFiles = []; // Clear staging area from UI immediately

        for (const stagedFileObj of filesToSend) {
          await sendFile(stagedFileObj.file);
          // Note: Thumbnail DataURLs don't need explicit revocation.
        }
      }
    } catch (error) {
      console.error("Error sending message or files:", error);
      // Potentially re-add files to staging or notify user
      // For now, message remains cleared, stagedFiles remain cleared.
      // User would need to re-add files that failed.
    } finally {
      isSending = false;
      await tick(); // Wait for Svelte to process DOM updates
      if (isPanelOpen && chatInput) {
        chatInput.focus();
      }
    }
  }
  
  // Renamed from handleFileUpload to reflect it now stages files, not sends directly.
  async function stageFilesFromInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      await addFilesToStaging(input.files);
      input.value = ''; // Clear the file input after files are staged
    }
  }

  async function handlePaste(event: ClipboardEvent) {
    if (isSending) return;

    const pastedFiles = event.clipboardData?.files;
    if (pastedFiles && pastedFiles.length > 0) {
      // If files are pasted into the chat input, prevent default text paste and stage them.
      event.preventDefault();
      await addFilesToStaging(pastedFiles);
    }
    // If no files, default paste behavior (text) for chatInput is allowed.
  }
</script>

<div
     bind:this={controlsPanel}
     id="test-control-panel"
     class="w-11/12 lg:w-1/2 xl:w-1/4 2x:w-1/4 flex flex-col fixed bottom-0 top-0"
     class:left-full={!isPanelOpen}
     class:right-0={isPanelOpen}>
  <div class="absolute top-1/4">
    <button id="test-toggle-panel-button" on:click={togglePanel} class="hover:bg-blue-600 w-5 h-16 bg-gray-300 text-black p-0 absolute border-solid rounded-l" style="left: -20px;">
      {isPanelOpen ? '>' : '<'}
    </button>
  </div>
  <div class="bg-gray-200 p-4 flex flex-col space-y-4 w-full h-full overflow-y-auto"> <!-- Added overflow-y-auto -->

     <!-- Participants Panel -->
     <div class="border-b border-gray-300 pb-4 mb-4">
       <h3 class="text-lg font-semibold mb-2">Connections</h3>
       {#if Object.keys(connectionState.directClients).length === 0 && Object.keys(connectionState.participants).length === 0}
         <p class="text-sm text-gray-500">No active connections.</p>
       {/if}

       <!-- Direct Connections -->
       {#each Object.values(connectionState.directClients) as client (client.cid)}
        {@const state = client.connectionState}
        {@const iceState = client.iceConnectionState}
        {@const isConnected = state === 'connected' && iceState === 'connected'}
        {@const isFailed = state === 'failed' || iceState === 'failed' || state === 'closed' || iceState === 'closed' || state === 'disconnected' || iceState === 'disconnected'}
        {@const isConnecting = !isConnected && !isFailed && (state !== null || iceState !== null)} <!-- Show yellow if not connected/failed but trying -->
         <div class="flex items-center space-x-2 mb-1">
           <div
             id="test-indicator-{client.cid}"
             class="rounded-full h-3 w-3 flex-shrink-0 test-indicator"
             class:test-indicator-connected={isConnected}
             class:bg-green-500={isConnected}
             class:bg-red-500={isFailed}
             class:bg-yellow-400={isConnecting}
             class:bg-gray-400={!isConnected && !isFailed && !isConnecting}
             title={`Direct: ${client.cid}\nState: ${state ?? 'N/A'}\nICE: ${iceState ?? 'N/A'}`}
           ></div>
           <p class="text-sm font-medium text-gray-700" title={client.cid}>
             {client.cid}
             {#if client.fingerprint}
               <span class="ml-1" title="Connection Fingerprint">{client.fingerprint}</span>
             {/if}
           </p>
         </div>
       {/each}

       <!-- Relayed Participants (Peers known via other direct connections) -->
       {#each Object.values(connectionState.participants) as participant (participant.cid)}
         <!-- Only show participants that are NOT direct clients -->
         {#if !connectionState.directClients[participant.cid]}
           {@const relayClient = connectionState.directClients[participant.relayCid]}
           {@const relayState = relayClient?.connectionState}
           {@const relayIceState = relayClient?.iceConnectionState}
           {@const isRelayConnected = relayState === 'connected' && relayIceState === 'connected'}
           {@const isRelayFailed = !relayClient || relayState === 'failed' || relayIceState === 'failed' || relayState === 'closed' || relayIceState === 'closed' || relayState === 'disconnected' || relayIceState === 'disconnected'}
           {@const isRelayConnecting = relayClient && !isRelayConnected && !isRelayFailed && (relayState !== null || relayIceState !== null)}
            <div class="flex items-center space-x-2 mb-1 opacity-75">
             <div
               id="test-indicator-relayed-{participant.cid}"
               class="rounded-full h-3 w-3 flex-shrink-0 border border-gray-400"
               class:bg-green-300={isRelayConnected}
               class:bg-red-300={isRelayFailed}
               class:bg-yellow-200={isRelayConnecting}
               class:bg-gray-200={!relayClient || (!isRelayConnected && !isRelayFailed && !isRelayConnecting)}
               title={`Relayed: ${participant.cid}\nVia: ${participant.relayCid}\nRelay State: ${relayState ?? 'N/A'}\nRelay ICE: ${relayIceState ?? 'N/A'}`}
             ></div>
             <p class="text-sm font-medium text-gray-500 truncate" title={`${participant.cid} (via ${participant.relayCid})`}>
               {participant.cid}... (Relayed)
             </p>
           </div>
         {/if}
       {/each}
     </div>

    <!-- Combined Chat and File Transfer Feed -->
    <div class="flex-1 flex flex-col min-h-0 border-t border-gray-300 pt-4 mt-4">
      <h3 class="text-lg font-semibold mb-2 px-4">Activity Feed</h3>
      <!-- Feed Area -->
      <div bind:this={chatOutputContainer} id="test-chat-container" class="flex-1 overflow-y-auto px-4 py-2 space-y-4">
        {#if combinedFeed.length === 0}
          <p class="text-sm text-gray-500 italic">Messages and file transfers will appear here...</p>
        {:else}
          {#each combinedFeed as item (item.id)}
            <!-- Determine if the item is from the local user -->
            {@const isLocalUser = item.type === 'chat'
              ? item.sender === localUserName // Local chat message if sender matches
              : !item.cid // Local file transfer if senderCid is missing
            }
            <!-- Add data-filename for file transfers to help test selectors -->
            <div class="flex" class:justify-end={isLocalUser} class:justify-start={!isLocalUser} data-filename={item.type === 'file' ? item.transfer?.name : null}>
              <div
                class="p-3 rounded-lg shadow max-w-[90%] break-words"
                class:bg-blue-100={isLocalUser}
                class:bg-gray-100={!isLocalUser}
                > <!-- Removed title from outer div -->
                <!-- Always display sender name, use title for CID -->
                <p
                  data-testid="sender-name"
                  class="text-xs font-semibold mb-1"
                  class:text-blue-800={isLocalUser}
                  class:text-gray-600={!isLocalUser}
                  title={item.cid ? `CID: ${item.cid}` : 'Local Sender'}
                >
                  {item.sender} <!-- Always display sender name (localUserName, Peer, CID, etc.) -->
                </p>

                {#if item.type === 'chat'}
                  <p data-testid="chat-message" class="text-sm">{item.text}</p>
                {:else if item.type === 'file' && item.transfer}
                  {@const transfer = item.transfer}
                  {@const playableMediaType = getPlayableMediaType(transfer.type)}

                  <!-- Standard File Info View -->
                  <div class="space-y-1">
                    <p data-testid="filename" class="text-sm font-medium truncate" title={transfer.name}>{transfer.name}</p>

                    {#if transfer.status === 'complete' && playableMediaType && transfer.url}
                      <!-- Inline Player View - Always shown for completed playable media -->
                      <div class="my-2">
                        {#if playableMediaType === 'video'}
                          <div
                            class="cursor-pointer"
                            role="button"
                            tabindex="0"
                            on:click={() => {
                              const cItem = viewableMediaForCarousel.find(mi => mi.id === item.id);
                              if (cItem) openMediaCarousel(cItem);
                            }}
                            on:keydown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                const cItem = viewableMediaForCarousel.find(mi => mi.id === item.id);
                                if (cItem) openMediaCarousel(cItem);
                                e.preventDefault();
                              }
                            }}
                            aria-label={`View video: ${transfer.name}`}
                          >
                            <!-- svelte-ignore a11y_media_has_caption -->
                            <video src={transfer.url} controls class="w-full rounded aspect-video min-w-md pointer-events-none"></video>
                          </div>
                        {:else if playableMediaType === 'image'}
                          <div
                            class="cursor-pointer"
                            role="button"
                            tabindex="0"
                            on:click={() => {
                              const cItem = viewableMediaForCarousel.find(mi => mi.id === item.id);
                              if (cItem) openMediaCarousel(cItem);
                            }}
                            on:keydown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                const cItem = viewableMediaForCarousel.find(mi => mi.id === item.id);
                                if (cItem) openMediaCarousel(cItem);
                                e.preventDefault();
                              }
                            }}
                            aria-label={`View image: ${transfer.name}`}
                          >
                            <img
                              src={transfer.url}
                              alt={transfer.name}
                              class="w-full rounded max-h-60 object-contain my-2 pointer-events-none"
                              on:error={(e) => {
                                console.error('Image failed to load. URL:', transfer.url, 'Transfer object:', JSON.stringify(transfer));
                              }}
                            />
                          </div>
                        {:else if playableMediaType === 'audio'}
                          <audio src={transfer.url} controls class="w-full min-w-md"></audio>
                        {/if}
                      </div>
                    {/if}

                    {#if transfer.status !== 'complete' && transfer.status !== 'error'}
                      <div class="flex items-center space-x-2">
                        <progress data-testid="progress-bar" class="w-full h-2 rounded" value={transfer.progress} max="100"></progress>
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
                          <a data-testid="download-link" href={transfer.url} download={transfer.name}
                             class="flex-1 text-center py-1 px-2 bg-green-500 text-white text-xs rounded shadow hover:bg-green-600 min-w-[calc(50%-0.25rem)]">
                            Download
                          </a>
                          <a data-testid="view-link" href={transfer.url} target="_blank" rel="noopener noreferrer"
                             class="flex-1 text-center py-1 px-2 bg-blue-500 text-white text-xs rounded shadow hover:bg-blue-600 min-w-[calc(50%-0.25rem)]">
                            View
                          </a>
                        </div>
                      {:else}
                        <p data-testid="status" class="text-xs text-gray-500 mt-1">(URL not available)</p>
                      {/if}
                    {:else if transfer.status === 'error'}
                      <p data-testid="status" class="text-xs text-red-600" title={transfer.error}>Error: {transfer.error || 'Transfer failed'}</p>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Staging Area for Files -->
      {#if stagedFiles.length > 0}
        <div class="px-4 pt-2 space-y-2 max-h-48 overflow-y-auto border-t border-b border-gray-300">
          <h4 class="text-xs font-semibold text-gray-600 uppercase">Files to send:</h4>
          {#each stagedFiles as stagedFile (stagedFile.id)}
            <div class="flex items-center justify-between p-1.5 bg-gray-50 rounded shadow-sm text-sm">
              <div class="flex items-center space-x-2 overflow-hidden min-w-0">
                {#if stagedFile.thumbnailUrl}
                  <img src={stagedFile.thumbnailUrl} alt="Preview" class="w-10 h-10 object-cover rounded border border-gray-200">
                {:else}
                  <!-- Generic file icon placeholder -->
                  <div class="w-10 h-10 flex items-center justify-center bg-gray-200 rounded border border-gray-300">
                    <svg class="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a2 2 0 00-2 2v8l-3 3v2h12v-2l-3-3V4a2 2 0 00-2-2H9zm7 11h-2v2h2v-2zm-4 0H8v2h4v-2zM7 2H5v2h2V2z"></path></svg>
                  </div>
                {/if}
                <span class="truncate text-gray-700" title={stagedFile.file.name}>{stagedFile.file.name}</span>
              </div>
              <button
                type="button"
                disabled={isSending}
                aria-label="remove file"
                on:click={() => removeStagedFile(stagedFile.id)}
                class="text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed p-1 ml-2 flex-shrink-0"
                title="Remove file"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Message Input and Upload Button (Remains at the bottom) -->
      <div class="flex items-center space-x-2 p-4 border-t border-gray-300 mt-auto">
        <input id="test-chat-input" type="text" placeholder="Type message..."
          bind:value={message}
          bind:this={chatInput}
          disabled={isSending}
          class="flex-1 border border-gray-300 px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
          on:keypress={handleKeyPress}
          on:paste={handlePaste}>
        <div class="relative"> <!-- Use relative positioning for the button container -->
          <button
            id="test-attach-file-button"
            type="button"
            disabled={isSending}
            on:click={() => uploadField.click()}
            class="cursor-pointer text-white px-3 py-2 rounded-md text-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            class:bg-blue-500={!isSending}
            class:bg-gray-500={isSending}
            title={!isSending ? "Attach file" : "Sending..."}
          >📎</button>
          <input
            id="test-file-upload"
            type="file"
            multiple
            disabled={isSending}
            class="hidden"
            on:change={stageFilesFromInput}
            bind:this={uploadField}
          >
        </div>
      </div>
    </div> <!-- End Combined Feed -->

  </div>
</div>

<MediaCarousel
  items={carouselMediaItems}
  startIndex={carouselStartIndex}
  show={showMediaCarousel}
  on:close={() => showMediaCarousel = false}
/>
