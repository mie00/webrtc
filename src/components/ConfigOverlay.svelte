<script lang="ts">
  import { configStore, updateConfig, type Config } from '../stores/configStore.js'; // Import Config type
  
  // Props
  let { 
    show = false, 
    onclose, 
    onconfigUpdated 
  } = $props<{ 
    show?: boolean; 
    onclose?: () => void; 
    onconfigUpdated?: () => void; 
  }>();
  
  // Event handlers
  function handleClose(event: Event) { // Add type for event
    if (event.target === event.currentTarget) {
      if (onclose) onclose();
    }
  }
  
  function handleSave() {
    // No need to manually collect values - they're already in the store
    // Just close the overlay and notify that config has been updated
    if (onconfigUpdated) onconfigUpdated();
    if (onclose) onclose();
  }
  
  // Handle input changes directly
  // Add types for event and key. Use type assertion for event.target.value
  function handleInputChange(event: Event, key: keyof Config) { 
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    updateConfig(key, target.value);
  }
</script>

{#if show}
<div id="config-overlay" class="fixed inset-0 bg-black/75 flex justify-center items-center z-40" role="button" tabindex="0" onclick={handleClose} onkeypress={(e) => e.stopPropagation()}>
  <div class="bg-white p-4 rounded-md shadow-md text-center" role="button" tabindex="0" onclick={(e) => e.stopPropagation()} onkeypress={(e) => e.stopPropagation()}>
    <div class="flex flex-col space-y-2">
      Loader
      <select 
        id="config-loader" 
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md"
        value={$configStore['config-loader']}
        onchange={(e) => handleInputChange(e, 'config-loader')}
      >
        <option value="server">Server</option>
        <option value="client">Client</option>
      </select>
    </div>
    
    <div class="flex flex-col space-y-2">
      Username 
      <input 
        id="user-name" 
        type="text" 
        placeholder="Username"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" 
        value={$configStore['user-name']}
        oninput={(e) => handleInputChange(e, 'user-name')}
      >
    </div>
    
    <div class="flex flex-col space-y-2">
      Host 
      <input 
        id="config-host" 
        type="text" 
        placeholder="Host"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" 
        value={$configStore['config-host']}
        oninput={(e) => handleInputChange(e, 'config-host')}
      >
    </div>
    
    <div class="flex flex-col space-y-2">
      Stun servers 
      <input 
        id="stun-servers" 
        type="text" 
        placeholder="Stun servers"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" 
        value={$configStore['stun-servers']}
        oninput={(e) => handleInputChange(e, 'stun-servers')}
      >
    </div>
    
    <div class="flex flex-col space-y-2">
      Turn server 
      <input 
        id="turn-server-v2" 
        type="text" 
        placeholder="Turn server"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" 
        value={$configStore['turn-server-v2']}
        oninput={(e) => handleInputChange(e, 'turn-server-v2')}
      >
    </div>
    
    <div class="flex flex-col space-y-2">
      Turn username 
      <input 
        id="turn-username" 
        type="text" 
        placeholder="Turn username"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" 
        value={$configStore['turn-username']}
        oninput={(e) => handleInputChange(e, 'turn-username')}
      >
    </div>
    
    <div class="flex flex-col space-y-2">
      Turn password 
      <input 
        id="turn-password" 
        type="text" 
        placeholder="Turn password"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" 
        value={$configStore['turn-password']}
        oninput={(e) => handleInputChange(e, 'turn-password')}
      >
    </div>

    <div class="flex flex-col space-y-2">
      Coordinator URL
      <input 
        id="coordinator-url" 
        type="text" 
        placeholder="Coordinator URL"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" 
        value={$configStore['coordinator-url']}
        oninput={(e) => handleInputChange(e, 'coordinator-url')}
      >
    </div>
    
    <div class="flex flex-col space-y-2 hidden">
      Audio device 
      <input 
        id="audio-device" 
        type="text" 
        placeholder="Audio device"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" 
        value={$configStore['audio-device']}
        oninput={(e) => handleInputChange(e, 'audio-device')}
      >
    </div>
    
    <div class="flex flex-col space-y-2 hidden">
      Video device 
      <input 
        id="video-device" 
        type="text" 
        placeholder="Video device"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" 
        value={$configStore['video-device']}
        oninput={(e) => handleInputChange(e, 'video-device')}
      >
    </div>
    
    <div class="flex flex-col space-y-2">
      Blur Video
      <select 
        id="blur-video" 
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md"
        value={$configStore['blur-video']}
        onchange={(e) => handleInputChange(e, 'blur-video')}
      >
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select>
    </div>
    
    <button 
      id="save-button" 
      onclick={handleSave}
      class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mt-2"
    >
      Save
    </button>
  </div>
</div>
{/if}
