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
    macOS: `/downloads/${appName}-${appVersion}-arm64.dmg`,
    Linux: `/downloads/${appName}-${appVersion}.AppImage`
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
      isElectron = window.navigator.userAgentData.brands.some(
        (brand: UADataBrand) => brand.brand === 'Electron'
      );
    } else {
      isElectron = navigator.userAgent.toLowerCase().includes('electron/');
    }

    // Detect OS
    const platform = navigator.platform?.toLowerCase() || '';
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

<div class="fixed top-0 left-0 right-0 bg-indigo-600 text-white p-3 shadow-lg z-50">
  <div class="container mx-auto flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
    <p class="text-sm hidden sm:block flex-grow min-w-[200px]">
      For the best experience and more features, download our desktop application.
    </p>

    <div class="flex items-center gap-2 flex-shrink-0">
      {#if detectedOS !== 'Unknown'}
        <a
          href={getDownloadLink(detectedOS)}
          download
          class="bg-green-500 hover:bg-green-600 text-white font-semibold py-1.5 px-3 rounded text-xs sm:text-sm transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75"
        >
          {osIcons[detectedOS]} Download for {detectedOS}
        </a>
        <button
          on:click={() => (showOSSelection = !showOSSelection)}
          class="bg-indigo-500 hover:bg-indigo-400 text-white font-semibold py-1.5 px-2 rounded text-xs sm:text-sm transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-opacity-75"
          aria-label="Select other operating systems"
          aria-expanded={showOSSelection}
          title="Show other OS options"
        >
          <svg class="w-4 h-4 fill-current" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"
            ><path
              fill-rule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clip-rule="evenodd"
            ></path></svg
          >
        </button>
      {:else}
        <span
          class="bg-gray-500 text-white font-semibold py-1.5 px-3 rounded text-xs sm:text-sm cursor-not-allowed"
        >
          {osIcons.Unknown} OS Not Detected
        </span>
      {/if}
      <button
        on:click={handleDismiss}
        class="text-indigo-200 hover:text-white text-2xl sm:text-3xl leading-none p-1 -mr-1 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-opacity-75"
        aria-label="Dismiss download message">&times;</button
      >
    </div>
  </div>

  {#if showOSSelection && detectedOS !== 'Unknown'}
    <div
      class="container mx-auto mt-2 p-3 bg-indigo-700 rounded-b-md shadow-lg border-t border-indigo-500"
    >
      <p class="text-xs text-indigo-200 mb-2">Or download for another platform:</p>
      <ul class="flex flex-wrap gap-x-4 gap-y-1.5">
        {#if detectedOS !== 'Windows'}
          <li>
            <a
              href={downloadLinks.Windows}
              download
              class="text-sm text-indigo-100 hover:text-white hover:underline focus:outline-none focus:ring-1 focus:ring-white rounded px-0.5 py-0.5"
              >{osIcons.Windows} Windows</a
            >
          </li>
        {/if}
        {#if detectedOS !== 'macOS'}
          <li>
            <a
              href={downloadLinks.macOS}
              download
              class="text-sm text-indigo-100 hover:text-white hover:underline focus:outline-none focus:ring-1 focus:ring-white rounded px-0.5 py-0.5"
              >{osIcons.macOS} macOS (.dmg)</a
            >
          </li>
          <!-- If you also provide a .zip for macOS, uncomment below -->
          <!-- <li><a href={downloadLinks.macOSZip} download class="text-sm text-indigo-100 hover:text-white hover:underline">{osIcons.macOS} macOS (.zip)</a></li> -->
        {/if}
        {#if detectedOS !== 'Linux'}
          <li>
            <a
              href={downloadLinks.Linux}
              download
              class="text-sm text-indigo-100 hover:text-white hover:underline focus:outline-none focus:ring-1 focus:ring-white rounded px-0.5 py-0.5"
              >{osIcons.Linux} Linux (.AppImage)</a
            >
          </li>
        {/if}
      </ul>
    </div>
  {/if}
</div>
