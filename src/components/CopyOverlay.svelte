<script lang="ts">
  import QRCode from 'qrcode';
  
  // Props
  let {
    show = false,
    copyText = '',
    qrCodeUrl = '',
    showAcceptButton = false,
    showJoinButton = false,
    showCopyButton = true,
    showPasteText = false,
    cid = null, // Receive CID as prop,
    close,
    openConfig,
    reset,
    accept,
    join,
  }: {
    show : boolean;
    copyText : string;
    qrCodeUrl : string;
    showAcceptButton : boolean;
    showJoinButton : boolean;
    showCopyButton : boolean;
    showPasteText : boolean;
    cid: string | null; // Allow null as per the original logic
    close: () => void;
    openConfig: () => void;
    reset: () => void;
    accept: (detail: AcceptEventDetail) => void; // Define the 'accept' prop
    join: () => void;
  } = $props();

  let pasteValue = $state('');
  let copyButtonText = $state('Copy');
  let qrCodeDataURL: string = $state("");

  $inspect(copyButtonText)
  // Define the structure of the detail for the 'accept' event
  interface AcceptEventDetail {
    pasteValue: string;
    cid: string | null; // Allow null as per the original logic
  }

  $effect(() => {
    if (show && qrCodeUrl) {
      renderQRCode();
    }
  });
  
  async function renderQRCode() {
    if (!qrCodeUrl) return;

    try {
      qrCodeDataURL = await QRCode.toDataURL(qrCodeUrl);
    } catch (e) {
      console.log("qr code generation error", e);
    }
  }
  
  // Event handlers
  function handleClose(event: Event) {
    if (event.target === event.currentTarget) {
      close();
    }
  }
  
  function handleOpenConfig() {
    openConfig();
  }
  
  function handleReset() {
    reset();
  }
  
  async function handleCopy() {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(copyText);
        copyButtonText = "Copied successfully";
      } catch (e) {
        console.log("Copying error", e);
        copyButtonText = "Error copying, please copy manually";
      }
    } else {
      copyButtonText = "Clipboard unavailable, please copy manually";
    }
  }
  
  function handleAccept() {
    // Ensure the dispatched object matches the AcceptEventDetail interface
    // Use the cid prop directly
    const detail: AcceptEventDetail = {
      pasteValue,
      cid: cid // Use the passed-in cid
    };
    accept(detail);
    copyButtonText = 'Copy';
    pasteValue = '';
  }

  function handleJoin() {
    join();
    copyButtonText = 'Copy';
  }
</script>

{#if show}
<div id="copy-overlay" class="fixed inset-0 bg-black/75 flex justify-center items-center z-30 cursor-default" onclick={handleClose} role="button" tabindex="0" onkeydown={(e) => e.key === 'Escape' && handleClose(e)} aria-label="Close overlay">
  <div class="bg-white p-4 rounded-md shadow-md text-center">
    <button id="test-open-config-button" onclick={handleOpenConfig}>⚙️</button> {/* Removed class="right" */}
    <button id="test-reset-button" onclick={handleReset}>↺</button>
    <div id="test-qr" class="flex justify-center"><img src={qrCodeDataURL} alt="QR Code" class="max-w-xs" /></div> {/* Added max-w-xs to image */}
    <p class="text-lg font-semibold mb-2">Copy this:</p>
    <textarea readonly value={copyText} id="test-copy" class="bg-gray-200 px-4 py-2 rounded-md break-all block mx-auto w-full max-w-md"></textarea> {/* Added mx-auto, w-full, max-w-md */}
    {#if showCopyButton}
      <button id="test-copy-button" onclick={handleCopy}
        class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mt-2">{copyButtonText}</button>
    {/if}
    {#if showPasteText}
      <textarea id="test-paste" bind:value={pasteValue} class="bg-gray-200 px-4 py-2 rounded-md break-all block mt-2 mx-auto w-full max-w-md"></textarea> {/* Added mx-auto, w-full, max-w-md */}
    {/if}
    {#if showAcceptButton}
      <button id="test-accept" onclick={handleAccept}
        class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md mt-2">Accept</button>
    {/if}
    {#if showJoinButton}
      <button onclick={handleJoin} id="test-join"
        class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-full mt-2">📞</button>
    {/if}
  </div>
</div>
{/if}
