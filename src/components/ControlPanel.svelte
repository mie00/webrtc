<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  
  // Props
  export let webRTCApp;
  
  const dispatch = createEventDispatcher();
  
  // State
  let isPanelOpen = false;
  
  // Event handlers
  function togglePanel() {
    isPanelOpen = !isPanelOpen;
    const controlsPanel = document.querySelector('#control');
    const tc = document.getElementById('toggle-controls');
    if (controlsPanel && tc) {
      if (controlsPanel.classList.contains('left-full')) {
        controlsPanel.classList.add('right-0');
        controlsPanel.classList.remove('left-full');
        tc.innerHTML = '&gt;';
      } else {
        controlsPanel.classList.remove('right-0');
        controlsPanel.classList.add('left-full');
        tc.innerHTML = '&lt;';
      }
    }
  }
  
  function handleKeyPress(event) {
    if (event.key === 'Enter') {
      sendMessage();
    }
  }
  
  async function sendMessage() {
    const chatInput = document.getElementById('chat') as HTMLInputElement;
    if (!chatInput || !chatInput.value.trim()) return;
    
    const app = webRTCApp.getApp();
    const message = chatInput.value.trim();
    
    // Import the sendChatMessage function from our bridge
    const { sendChatMessage } = await import('../lib/chatBridge');
    sendChatMessage(message, app.config['user-name'] || 'You');
    
    // Clear input
    chatInput.value = '';
  }
  
  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Import the sendFile function from our bridge
    const { sendFile } = await import('../lib/fileBridge');
    sendFile(file);
    
    // Reset file input
    event.target.value = '';
  }
  
  onMount(() => {
    // Initialize file upload listener
    const fileUpload = document.getElementById('file-upload');
    if (fileUpload) {
      fileUpload.addEventListener('change', handleFileUpload);
    }
    
    return () => {
      // Cleanup
      if (fileUpload) {
        fileUpload.removeEventListener('change', handleFileUpload);
      }
    };
  });
</script>

<div id="control" class="w-11/12 lg:w-1/2 xl:w-1/4 2x:w-1/4 flex flex-col fixed bottom-0 top-0 left-full">
  <div id="cc" class="absolute top-1/4">
    <button id="toggle-controls" on:click={togglePanel} class="hover:bg-blue-600 w-5 h-16 bg-gray-300 text-black p-0 absolute border-solid rounded-l" style="left: -20px;">
      &lt; <!-- Toggle Controls -->
    </button>
  </div>
  <div class="bg-gray-200 p-4 flex flex-col space-y-4 w-full h-full">
    <div id="participants" class="">
      <!-- Participants will be dynamically added here -->
    </div>

    <!-- Chat Panel -->
    <div class="flex-1 flex flex-col border-t border-gray-300 pt-4">
      <!-- Messages Area -->
      <div id="output" class="flex-1 overflow-y-auto px-4">
        <!-- Chat messages will appear here -->
      </div>

      <!-- Message Input and Upload Button -->
      <div class="flex items-center space-x-2 p-2">
        <input id="chat" type="text" placeholder="Type your message..."
          class="flex-1 border border-gray-300 px-3 py-2 rounded-md"
          on:keypress={handleKeyPress}>
        <div class="p-2">
          <label for="file-upload"
            class="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md">📎</label>
          <input id="file-upload" type="file" class="hidden">
        </div>
      </div>
    </div>
  </div>
</div>
