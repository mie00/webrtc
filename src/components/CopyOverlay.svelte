<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  // Props
  export let show = false;
  
  const dispatch = createEventDispatcher();
  
  // Event handlers
  function handleClose(event) {
    if (event.target === event.currentTarget) {
      dispatch('close');
    }
  }
  
  function handleOpenConfig() {
    dispatch('openConfig');
  }
  
  function handleReset() {
    dispatch('reset');
  }
  
  async function handleCopy(event) {
    const target = event.target;
    const link = document.getElementById('copy-text') as HTMLInputElement;
    
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(link.value);
        target.innerHTML = "Copied successfully";
      } catch {
        target.innerHTML = "Error copying, please copy manually";
      }
    } else {
      target.innerHTML = "Clipboard unavailable, please copy manually";
    }
  }
  
  function handleAccept() {
    // This will be handled by the parent component
    // The actual implementation is in App.svelte
  }
  
  function handleJoin() {
    // This will be handled by the parent component
    // The actual implementation is in App.svelte
  }
</script>

{#if show}
<div id="copy-overlay" class="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-30" on:click={handleClose}>
  <div class="bg-white p-4 rounded-md shadow-md text-center">
    <button id="open-config" on:click={handleOpenConfig} class="right">⚙️</button>
    <button id="reset" on:click={handleReset}>↺</button>
    <div id="qrcode"></div>
    <p class="text-lg font-semibold mb-2">Copy this:</p>
    <textarea readonly id="copy-text" class="bg-gray-200 px-4 py-2 rounded-md break-all block"></textarea>
    <button id="copy-button" on:click={handleCopy}
      class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mt-2">Copy</button>
    <button id="accept-button" on:click={handleAccept}
      class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mt-2 hidden">Accept</button>
    <textarea id="paste-text" class="bg-gray-200 px-4 py-2 rounded-md break-all block hidden"></textarea>
    <button id="join-button" on:click={handleJoin}
      class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full mt-2 hidden">📞</button>
  </div>
</div>
{/if}
