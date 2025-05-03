<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  
  // Props
  export let show = false;
  export let copyText = '';
  export let qrCodeUrl = '';
  export let showAcceptButton = false;
  export let showJoinButton = false;
  export let showCopyButton = true;
  export let showPasteText = false;
  
  let pasteValue = '';
  let copyButtonText = 'Copy';
  let qrCodeElement: HTMLElement;
  
  const dispatch = createEventDispatcher();
  
  $: if (show && qrCodeUrl && qrCodeElement) {
    renderQRCode();
  }
  
  function renderQRCode() {
    if (!qrCodeElement || !qrCodeUrl) return;
    
    qrCodeElement.innerHTML = '';
    try {
      new QRCode(qrCodeElement, qrCodeUrl);
    } catch (e) {
      console.log("qr code generation error", e);
    }
  }
  
  // Event handlers
  function handleClose(event: Event) {
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
  
  async function handleCopy() {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(copyText);
        copyButtonText = "Copied successfully";
      } catch {
        copyButtonText = "Error copying, please copy manually";
      }
    } else {
      copyButtonText = "Clipboard unavailable, please copy manually";
    }
  }
  
  function handleAccept() {
    dispatch('accept', { pasteValue, cid: window.app?.bc ? Object.keys(window.app.clients)[0] : null });
  }
  
  function handleJoin() {
    dispatch('join');
  }
</script>

{#if show}
<div id="copy-overlay" class="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-30 cursor-default" on:click={handleClose} role="button" tabindex="0" on:keydown={(e) => e.key === 'Escape' && handleClose(e)} aria-label="Close overlay">
  <div class="bg-white p-4 rounded-md shadow-md text-center">
    <button id="open-config" on:click={handleOpenConfig} class="right">⚙️</button>
    <button id="reset" on:click={handleReset}>↺</button>
    <div bind:this={qrCodeElement}></div>
    <p class="text-lg font-semibold mb-2">Copy this:</p>
    <textarea readonly value={copyText} class="bg-gray-200 px-4 py-2 rounded-md break-all block"></textarea>
    {#if showCopyButton}
      <button on:click={handleCopy}
        class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mt-2">{copyButtonText}</button>
    {/if}
    {#if showAcceptButton}
      <button on:click={handleAccept}
        class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mt-2">Accept</button>
    {/if}
    {#if showPasteText}
      <textarea bind:value={pasteValue} class="bg-gray-200 px-4 py-2 rounded-md break-all block mt-2"></textarea>
    {/if}
    {#if showJoinButton}
      <button on:click={handleJoin}
        class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full mt-2">📞</button>
    {/if}
  </div>
</div>
{/if}
