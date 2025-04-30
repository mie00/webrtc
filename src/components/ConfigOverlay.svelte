<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { getConfig, setConfig } from '../../js/config.js';
  
  // Props
  export let show = false;
  
  const dispatch = createEventDispatcher();
  
  // State
  let config = getConfig();
  
  // Event handlers
  function handleClose(event) {
    if (event.target === event.currentTarget) {
      dispatch('close');
    }
  }
  
  function handleSave() {
    // Save all config values
    const configLoader = document.getElementById('config-loader') as HTMLSelectElement;
    const userName = document.getElementById('user-name') as HTMLInputElement;
    const configHost = document.getElementById('config-host') as HTMLInputElement;
    const stunServers = document.getElementById('stun-servers') as HTMLInputElement;
    const turnServer = document.getElementById('turn-server-v2') as HTMLInputElement;
    const turnUsername = document.getElementById('turn-username') as HTMLInputElement;
    const turnPassword = document.getElementById('turn-password') as HTMLInputElement;
    const blurVideo = document.getElementById('blur-video') as HTMLSelectElement;
    
    if (configLoader) setConfig('config-loader', configLoader.value);
    if (userName) setConfig('user-name', userName.value);
    if (configHost) setConfig('config-host', configHost.value);
    if (stunServers) setConfig('stun-servers', stunServers.value);
    if (turnServer) setConfig('turn-server-v2', turnServer.value);
    if (turnUsername) setConfig('turn-username', turnUsername.value);
    if (turnPassword) setConfig('turn-password', turnPassword.value);
    if (blurVideo) setConfig('blur-video', blurVideo.value);
    
    // Close the overlay
    dispatch('close');
  }
  
  onMount(() => {
    // Initialize config values from localStorage
    config = getConfig();
  });
</script>

{#if show}
<div id="config-overlay" class="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-40" on:click={handleClose}>
  <div class="bg-white p-4 rounded-md shadow-md text-center">
    <div class="flex flex-col space-y-2">
      Loader
      <select id="config-loader" class="flex-1 border border-gray-300 px-3 py-2 rounded-md">
        <option value="server" selected={config['config-loader'] === 'server'}>Server</option>
        <option value="client" selected={config['config-loader'] === 'client'}>Client</option>
      </select>
    </div>
    <div class="flex flex-col space-y-2">
      Username <input id="user-name" type="text" placeholder="Username"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" value={config['user-name'] || ''}>
    </div>
    <div class="flex flex-col space-y-2">
      Host <input id="config-host" type="text" placeholder="Host"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" value={config['config-host'] || ''}>
    </div>
    <div class="flex flex-col space-y-2">
      Stun servers <input id="stun-servers" type="text" placeholder="Stun servers"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" value={config['stun-servers'] || 'dealer.mie00.com:3478'}>
    </div>
    <div class="flex flex-col space-y-2">
      Turn server <input id="turn-server-v2" type="text" placeholder="Turn server"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" value={config['turn-server-v2'] || 'dealer.mie00.com:5349'}>
    </div>
    <div class="flex flex-col space-y-2">
      Turn username <input id="turn-username" type="text" placeholder="Turn username"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" value={config['turn-username'] || 'mie'}>
    </div>
    <div class="flex flex-col space-y-2">
      Turn password <input id="turn-password" type="text" placeholder="Turn password"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" value={config['turn-password'] || ''}>
    </div>
    <div class="flex flex-col space-y-2 hidden">
      Audio device <input id="audio-device" type="text" placeholder="Audio device"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" value={config['audio-device'] || 'default|default'}>
    </div>
    <div class="flex flex-col space-y-2 hidden">
      Video device <input id="video-device" type="text" placeholder="Video device"
        class="flex-1 border border-gray-300 px-3 py-2 rounded-md" value={config['video-device'] || 'default|default'}>
    </div>
    <div class="flex flex-col space-y-2">
      Blur Video
      <select id="blur-video" class="flex-1 border border-gray-300 px-3 py-2 rounded-md">
        <option value="no" selected={config['blur-video'] === 'no'}>No</option>
        <option value="yes" selected={config['blur-video'] === 'yes'}>Yes</option>
      </select>
    </div>
    <button id="save-button" on:click={handleSave}
      class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mt-2">Save</button>
  </div>
</div>
{/if}
