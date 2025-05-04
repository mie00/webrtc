<script lang="ts">
  import { createEventDispatcher, onDestroy, afterUpdate } from 'svelte'; // Import onDestroy and afterUpdate
  import { tweened } from 'svelte/motion';
  import type { WebRTCApp } from '../lib/webrtc/WebRTCApp.js'; // Import the type
  import { connectionStore, type DirectClientState, type ParticipantState, type ConnectionState } from '../stores/connectionStore.js'; // Adjust path if needed
  import { chatStore, type ChatState } from '../lib/chatBridge.js'; // Adjust path if needed

  // Props
  export let webRTCApp: WebRTCApp; // Still needed for sending messages/files

  const dispatch = createEventDispatcher();

  // State for panel toggle, chat, file upload
  let isPanelOpen = false;
  let message = '';
  let chatInput: HTMLInputElement;
  let controlsPanel: HTMLDivElement;
  let uploadField: HTMLInputElement;
  let chatOutputContainer: HTMLDivElement; // Reference for chat output div

  // Subscribe to connection store
  let connectionState: ConnectionState = { directClients: {}, participants: {} }; // Initialize with default structure
  const unsubscribe = connectionStore.subscribe(value => {
    connectionState = value;
  });

  // Subscribe to chat store
  let chatState: ChatState = { messages: [] }; // Initialize
  const unsubscribeChat = chatStore.subscribe(value => {
    chatState = value;
  });

  onDestroy(() => {
    unsubscribe(); // Unsubscribe from connectionStore
    unsubscribeChat(); // Unsubscribe from chatStore
  });

  // Get local user name for chat display comparison
  $: localUserName = webRTCApp?.getApp()?.config?.['user-name'] || 'You';

  // Auto-scroll chat
  afterUpdate(() => {
    if (chatOutputContainer) {
      // Scroll to the bottom instantly
      chatOutputContainer.scrollTop = chatOutputContainer.scrollHeight;
    }
  });

  // Event handlers
  function togglePanel() {
    isPanelOpen = !isPanelOpen;
  }
  
  function handleKeyPress(event: KeyboardEvent) { // Add type annotation
    if (event.key === 'Enter') {
      sendMessage();
    }
  }
  
  async function sendMessage() {
    if (!message.trim()) return;
    
    const app = webRTCApp.getApp();
    
    // Import the sendChatMessage function from our bridge
    const { sendChatMessage } = await import('../lib/chatBridge.js');
    sendChatMessage(message.trim(), app.config['user-name'] || 'You');
    
    // Clear input
    message = '';
  }
  
  async function handleFileUpload(event: Event) { // Add type annotation
    const file = uploadField.files?.[0]; // Use optional chaining
    if (!file) return;
    // Import the sendFile function from our bridge
    const { sendFile } = await import('../lib/fileBridge.js');
    sendFile(file);

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

    <!-- Chat Panel -->
    <!-- Make chat panel take remaining space, ensure outer div allows scrolling -->
    <div class="flex-1 flex flex-col min-h-0"> <!-- Added min-h-0 for flex child height calculation -->
      <!-- Messages Area -->
      <div bind:this={chatOutputContainer} class="flex-1 overflow-y-auto px-4 py-2 border border-gray-300 rounded mb-2 bg-white shadow-inner"> <!-- Added styling and bind:this -->
        {#if chatState.messages.length === 0}
          <p class="text-sm text-gray-500 italic">Chat messages will appear here...</p>
        {:else}
          {#each chatState.messages as message, i (message.timestamp + '-' + i)} <!-- Unique key using timestamp + index -->
            {@const displayName = message.sender === localUserName ? 'You' : message.sender}
            <div class="mb-2 chat-message break-words"> <!-- Added break-words -->
              <span class="font-bold">{displayName}:</span> {message.text} <!-- Render conditional name -->
            </div>
          {/each}
        {/if}
      </div>

      <!-- Message Input and Upload Button -->
      <div class="flex items-center space-x-2 p-2">
        <input id="chat" type="text" placeholder="Type your message..."
          bind:value={message}
          bind:this={chatInput}
          class="flex-1 border border-gray-300 px-3 py-2 rounded-md"
          on:keypress={handleKeyPress}>
        <div class="p-2">
          <label for="file-upload"
            class="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md">📎</label>
          <input id="file-upload" type="file" class="hidden" on:change={handleFileUpload} bind:this={uploadField}>
        </div>
      </div>
    </div>
  </div>
</div>
