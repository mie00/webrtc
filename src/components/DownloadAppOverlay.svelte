<script lang="ts">
  import { onMount } from 'svelte';

  export let onClose: () => void; // Parent function to call to hide this overlay

  let isElectron = false;
  let detectedOS: 'Windows' | 'macOS' | 'Linux' | 'Unknown' = 'Unknown';
  let showOSSelection = false;

  // Values from package.json
  const appVersion = '1.0.0';
  const appName = 'WebRTC Project App';

  const downloadLinks = {
    Windows: `/downloads/${appName} Setup ${appVersion}.exe`,
    macOS: `/downloads/${appName}-${appVersion}.dmg`,
    Linux: `/downloads/${appName}-${appVersion}.AppImage`,
    // electron-builder might also produce a .zip for mac:
    // macOSZip: `/downloads/${appName}-mac-${appVersion}.zip`,
  };

  // Simple text icons; consider using SVGs or an icon library for better visuals
  const osIcons = {
    Windows: '🪟',
    macOS: '',
    Linux: '🐧',
    Unknown: '❓'
  };

  onMount(() => {
    // Check if running in Electron
    if (window.navigator.userAgentData?.brands) {
      isElectron = window.navigator.userAgentData.brands.some(brand => brand.brand === "Electron");
    } else {
      isElectron = navigator.userAgent.toLowerCase().includes('electron/');
    }

    // Detect OS
    const platform = navigator.platform?.toLowerCase() || "";
    if (platform.startsWith('win')) {
      detectedOS = 'Windows';
    } else if (platform.startsWith('mac')) {
      detectedOS = 'macOS';
    } else if (platform.startsWith('linux')) {
      detectedOS = 'Linux';
    }

    // If in Electron or OS is unknown, tell parent to close/hide this overlay.
    if (isElectron || detectedOS === 'Unknown') {
      onClose();
    }
  });

  function handleDismiss() {
    onClose(); // Call parent's close handler
  }

  function getDownloadLink(os: 'Windows' | 'macOS' | 'Linux'): string {
    return downloadLinks[os];
  }
</script>

<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="download-app-title">
  <div class="bg-white p-6 sm:p-8 rounded-lg shadow-xl max-w-md w-full">
    <div class="flex justify-between items-center mb-4">
      <h2 id="download-app-title" class="text-xl font-semibold text-gray-800">Get the Desktop App</h2>
      <button on:click={handleDismiss} class="text-gray-500 hover:text-gray-700 text-3xl leading-none" aria-label="Close download dialog">&times;</button>
    </div>
    <p class="mb-6 text-gray-700">
      For the best experience and more features, download our desktop application.
    </p>
    
    <div class="flex items-stretch mb-2">
      <a
        href={getDownloadLink(detectedOS)}
        download
        class="flex-grow bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-l-md text-center transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
      >
        Download for {osIcons[detectedOS]} {detectedOS}
      </a>
      <button 
        on:click={() => showOSSelection = !showOSSelection}
        class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-3 rounded-r-md border-l border-blue-500 transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        aria-label="Select other operating systems"
        aria-expanded={showOSSelection}
      >
        <svg class="w-5 h-5 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" fill-rule="evenodd"></path></svg>
      </button>
    </div>

    {#if showOSSelection}
      <div class="mt-4 border-t pt-4">
        <p class="text-sm text-gray-600 mb-2">Or download for another platform:</p>
        <ul class="space-y-2">
          {#if detectedOS !== 'Windows'}
            <li><a href={downloadLinks.Windows} download class="text-blue-600 hover:text-blue-700 hover:underline">{osIcons.Windows} Windows</a></li>
          {/if}
          {#if detectedOS !== 'macOS'}
            <li><a href={downloadLinks.macOS} download class="text-blue-600 hover:text-blue-700 hover:underline">{osIcons.macOS} macOS (.dmg)</a></li>
            <!-- If you also provide a .zip for macOS, uncomment below -->
            <!-- <li><a href={downloadLinks.macOSZip} download class="text-blue-600 hover:text-blue-700 hover:underline">{osIcons.macOS} macOS (.zip)</a></li> -->
          {/if}
          {#if detectedOS !== 'Linux'}
            <li><a href={downloadLinks.Linux} download class="text-blue-600 hover:text-blue-700 hover:underline">{osIcons.Linux} Linux (.AppImage)</a></li>
          {/if}
        </ul>
      </div>
    {/if}
    
    <button 
      on:click={handleDismiss} 
      class="mt-6 w-full bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-opacity-50"
    >
      Maybe Later
    </button>
  </div>
</div>
