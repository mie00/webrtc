<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { configStore, updateConfig, type Config } from '../stores/configStore.js'; // Import Config type
  
  // Props
  export let show = false;
  
  // Define event map for type safety
  const dispatch = createEventDispatcher<{
    close: void;
    configUpdated: void;
  }>();
  
  // Event handlers
  function handleClose(event: Event) { // Add type for event
    if (event.target === event.currentTarget) {
      dispatch('close');
    }
  }
  
  function handleSave() {
    // No need to manually collect values - they're already in the store
    // Just close the overlay and notify that config has been updated
    dispatch('configUpdated');
    dispatch('close');
  }
  
  // Handle input changes directly
  // Add types for event and key. Use type assertion for event.target.value
  function handleInputChange(event: Event, key: keyof Config) { 
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    updateConfig(key, target.value);
  }
</script>

{#if show}
<div id="config-overlay" class="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-40" role="button" tabindex="0" on:click={handleClose} on:keypress|stopPropagation>
  <div class="bg-white p-4 rounded-md shadow-md text-center" role="button" tabindex="0" on:click|stopPropagation on:keypress|stopPropagation>
    <div class="flex flex-col space-y-2">
      Loader
      <select 
        id="config-loader" 
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md"
        value={$configStore['config-loader']}
        on:change={(e) => handleInputChange(e, 'config-loader')}
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
        on:input={(e) => handleInputChange(e, 'user-name')}
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
        on:input={(e) => handleInputChange(e, 'config-host')}
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
        on:input={(e) => handleInputChange(e, 'stun-servers')}
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
        on:input={(e) => handleInputChange(e, 'turn-server-v2')}
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
        on:input={(e) => handleInputChange(e, 'turn-username')}
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
        on:input={(e) => handleInputChange(e, 'turn-password')}
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
        on:input={(e) => handleInputChange(e, 'audio-device')}
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
        on:input={(e) => handleInputChange(e, 'video-device')}
      >
    </div>
    
    <div class="flex flex-col space-y-2">
      Blur Video
      <select 
        id="blur-video" 
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md"
        value={$configStore['blur-video']}
        on:change={(e) => handleInputChange(e, 'blur-video')}
      >
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select>
    </div>
    
    <button 
      id="save-button" 
      on:click={handleSave}
      class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mt-2"
    >
      Save
    </button>
  </div>
</div>
{/if}
