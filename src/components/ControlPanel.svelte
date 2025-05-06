<script lang="ts">
  import { createEventDispatcher, onDestroy, afterUpdate } from 'svelte'; // Import onDestroy and afterUpdate
  import { connectionStore, type ConnectionState } from '../stores/connectionStore.js';
  import { configStore } from '../stores/configStore.js'; // Import configStore
  import { chatStore, type ChatState } from '../lib/chatBridge.js';
  import { fileStore, type FileState, type FileTransfer } from '../lib/fileBridge.js';

  // --- Types for Combined Feed ---
  interface FeedItem {
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
  let canUpload = true;

  // Subscribe to connection store
  let connectionState: ConnectionState = { directClients: {}, participants: {} }; // Initialize with default structure
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

  onDestroy(() => {
    unsubscribe(); // Unsubscribe from connectionStore
    unsubscribeChat(); // Unsubscribe from chatStore
    unsubscribeFile(); // Unsubscribe from fileStore
  });

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

  // Auto-scroll combined feed
  afterUpdate(() => {
    if (chatOutputContainer) {
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
  
  function handleKeyPress(event: KeyboardEvent) { // Add type annotation
    if (event.key === 'Enter') {
      sendMessage();
    }
  }
  
  async function sendMessage() {
    if (!message.trim()) return;

    // Get sender name from config store
    const senderName = $configStore['user-name'] || 'You';

    // Import the sendChatMessage function from our bridge
    const { sendChatMessage } = await import('../lib/chatBridge.js');
    sendChatMessage(message.trim(), senderName);

    // Clear input
    message = '';
  }
  
  async function handleFileUpload(event: Event) { // Add type annotation
    const file = uploadField.files?.[0]; // Use optional chaining
    if (!file) return;
    // Import the sendFile function from our bridge
    const { sendFile } = await import('../lib/fileBridge.js');
    canUpload = false;
    try{
      sendFile(file);
    } finally {
      canUpload = true;
    }
    uploadField.value = '';
  }
</script>

<div
     bind:this={controlsPanel}
     class="w-11/12 lg:w-1/2 xl:w-1/4 2x:w-1/4 flex flex-col fixed bottom-0 top-0"
     class:left-full={!isPanelOpen}
     class:right-0={isPanelOpen}>
  <div class="absolute top-1/4">
    <button on:click={togglePanel} class="hover:bg-blue-600 w-5 h-16 bg-gray-300 text-black p-0 absolute border-solid rounded-l" style="left: -20px;">
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
             class="rounded-full h-3 w-3 flex-shrink-0 test-indicator"
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
               class="rounded-full h-3 w-3 flex-shrink-0 border border-gray-400"
               class:bg-green-300={isRelayConnected}
               class:bg-red-300={isRelayFailed}
               class:bg-yellow-200={isRelayConnecting}
               class:bg-gray-200={!relayClient || (!isRelayConnected && !isRelayFailed && !isRelayConnecting)}
               title={`Relayed: ${participant.cid}\nVia: ${participant.relayCid}\nRelay State: ${relayState ?? 'N/A'}\nRelay ICE: ${relayIceState ?? 'N/A'}`}
             ></div>
             <p class="text-sm font-medium text-gray-500 truncate" title={`${participant.cid} (via ${participant.relayCid})`}>
               {participant.cid.substring(0, 8)}... (Relayed)
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
            <div class="flex" class:justify-end={isLocalUser} class:justify-start={!isLocalUser}>
              <div
                class="p-3 rounded-lg shadow max-w-xs lg:max-w-md break-words"
                class:bg-blue-100={isLocalUser}
                class:bg-gray-100={!isLocalUser}
                > <!-- Removed title from outer div -->
                <!-- Always display sender name, use title for CID -->
                <p
                  class="text-xs font-semibold mb-1"
                  class:text-blue-800={isLocalUser}
                  class:text-gray-600={!isLocalUser}
                  title={item.cid ? `CID: ${item.cid}` : 'Local Sender'}
                >
                  {item.sender} <!-- Always display sender name (localUserName, Peer, CID, etc.) -->
                </p>

                {#if item.type === 'chat'}
                  <p class="text-sm">{item.text}</p>
                {:else if item.type === 'file' && item.transfer}
                  {@const transfer = item.transfer}
                  <div class="space-y-1">
                     <p class="text-sm font-medium truncate" title={transfer.name}>{transfer.name}</p>
                     {#if transfer.status !== 'complete' && transfer.status !== 'error'}
                       <div class="flex items-center space-x-2">
                         <progress class="w-full h-2 rounded" value={transfer.progress} max="100"></progress>
                         <span class="text-xs font-mono flex-shrink-0">{transfer.progress}%</span>
                       </div>
                     {/if}
                     {#if transfer.status === 'sending'}
                       <p class="text-xs text-blue-600">Sending...</p>
                     {:else if transfer.status === 'receiving'}
                       <p class="text-xs text-blue-600">Receiving...</p>
                     {:else if transfer.status === 'complete'}
                       <p class="text-xs text-green-600">Completed</p>
                       {#if transfer.url}
                         <div class="flex space-x-2 mt-1">
                           <a href={transfer.url} download={transfer.name}
                              class="flex-1 text-center py-1 px-2 bg-green-500 text-white text-xs rounded shadow hover:bg-green-600">
                             Download
                           </a>
                           <a href={transfer.url} target="_blank" rel="noopener noreferrer"
                              class="flex-1 text-center py-1 px-2 bg-blue-500 text-white text-xs rounded shadow hover:bg-blue-600">
                             View
                           </a>
                         </div>
                       {:else}
                         <p class="text-xs text-gray-500 mt-1">(URL not available)</p>
                       {/if}
                     {:else if transfer.status === 'error'}
                       <p class="text-xs text-red-600" title={transfer.error}>Error: {transfer.error || 'Transfer failed'}</p>
                     {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Message Input and Upload Button (Remains at the bottom) -->
      <div class="flex items-center space-x-2 p-4 border-t border-gray-300 mt-2">
        <input type="text" placeholder="Type message..."
          bind:value={message}
          bind:this={chatInput}
          class="flex-1 border border-gray-300 px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          on:keypress={handleKeyPress}>
        <div class="relative"> <!-- Use relative positioning for the button container -->
          <button
            type="button"
            disabled={!canUpload}
            on:click={() => uploadField.click()}
            class="cursor-pointer text-white px-3 py-2 rounded-md text-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            class:bg-blue-500={canUpload}
            class:bg-gray-500={!canUpload}
            title={canUpload ? "Attach file" : "File upload in progress"}
          >📎</button>
          <input id="file-upload" disabled={!canUpload} type="file" class="hidden" on:change={handleFileUpload} bind:this={uploadField}>
        </div>
      </div>
    </div> <!-- End Combined Feed -->

  </div>
</div>
