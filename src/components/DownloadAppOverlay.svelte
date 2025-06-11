<script lang="ts">
  import { onMount } from 'svelte';

  export let onClose: () => void; // Parent function to call to hide this overlay

  // For example, if your repo is https://github.com/my-org/my-cool-app,
  // then githubRepoPath should be 'my-org/my-cool-app'.
  const githubRepoPath = 'mie00/webrtc';
  const releasesPageUrl = `https://github.com/${githubRepoPath}/releases`;

  // Values from package.json (can be kept for display if desired, appName is used)
  // const appVersion = '1.0.0'; // Version display removed from button to avoid staleness
  const appName = 'WebRTC Project App'; // Used in the informational text

  onMount(() => {
    let isElectron = false;
    // Check if running in Electron
    if (window.navigator.userAgentData?.brands) {
      isElectron = window.navigator.userAgentData.brands.some(
        (brand: UADataBrand) => brand.brand === 'Electron'
      );
    } else {
      isElectron = navigator.userAgent.toLowerCase().includes('electron/');
    }

    // If in Electron, tell parent to close/hide this overlay, as it's for web users.
    if (isElectron) {
      onClose();
    }
  });

  function handleDismiss() {
    onClose(); // Call parent's close handler
  }
</script>

<div class="fixed top-0 left-0 right-0 bg-indigo-600 text-white p-3 shadow-lg z-50">
  <div class="container mx-auto flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
    <p class="text-sm hidden sm:block flex-grow min-w-[200px]">
      For the best experience with {appName}, download our desktop application.
    </p>

    <div class="flex items-center gap-2 flex-shrink-0">
      <a
        href={releasesPageUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="bg-green-500 hover:bg-green-600 text-white font-semibold py-1.5 px-3 rounded text-xs sm:text-sm transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75"
        title="View available application releases on GitHub"
      >
        Get Desktop App
      </a>
      <button
        on:click={handleDismiss}
        class="text-indigo-200 hover:text-white text-2xl sm:text-3xl leading-none p-1 -mr-1 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-opacity-75"
        aria-label="Dismiss download message">&times;</button
      >
    </div>
  </div>
</div>
