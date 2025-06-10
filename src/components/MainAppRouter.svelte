<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  // import { authStore, type AuthState } from '../lib/stores/authStore'; // No longer directly needed for UI
  import MediaArea from './MediaArea.svelte';
  import ControlPanel from './ControlPanel.svelte';
  import CopyOverlay from './CopyOverlay.svelte';
  import ConfigOverlay from './ConfigOverlay.svelte';
  import ForwardOverlay from './ForwardOverlay.svelte';
  import { configStore, getAllConfig, type Config } from '../lib/stores/configStore';
  import { connectionStore } from '../lib/stores/connectionStore'; // getDirectClient not used here
  // import { compress, decompress } from '../lib/utils/sdpCompress'; // Not used directly here
  import DownloadAppOverlay from './DownloadAppOverlay.svelte';
  import type { WebRTCApp } from '../lib/webrtc/WebRTCApp';
  import { appLogicModuleStore, type AppLogicState } from '../lib/stores/appLogicStore'; // Import the store

  import type { AppLogic, AppLogicContext } from '../lib/appLogic';
  import { ClientLogic } from '../lib/clientLogic';
  import { ServerLogic } from '../lib/serverLogic';

  // Props
  export let webRTCApp: WebRTCApp;

  // appLogicModuleStore is now imported

  // Other component specific state
  let showConfigOverlay = false;
  // currentPath is still used by onMount logic for parameter parsing, but not for /cb routing
  let currentPath = window.location.pathname; // This seems fine as it's only used in onMount before logic init
  let showDownloadAppOverlay = true; // Controls rendering of DownloadAppOverlay
  // let currentAuthState: AuthState; // No longer needed for UI logic here

  // authStore.subscribe(value => { // No longer needed for UI logic here
  //   currentAuthState = value;
  // });

  let appLogicInstance: AppLogic | null = null;

  function handleCloseDownloadOverlay() {
    showDownloadAppOverlay = false;
    // To make dismissal persistent across sessions, you could use localStorage:
    // localStorage.setItem('downloadOverlayDismissed_v1', 'true');
  }

  // setState and getState are removed, logic modules will use the store directly.

  const appOnId = () => {
    const config = getAllConfig();
    const newUrl =
      (config.general.configHost || window.location.origin) +
      window.location.pathname +
      window.location.search;
    appLogicModuleStore.update((s) => ({
      ...s,
      showCopyOverlay: true,
      copyText: newUrl,
      qrCodeUrl: newUrl
    }));
  };

  const broadcastManuallyEnteredAnswer = async (offer: string, answer: string) => {
    const bc = new BroadcastChannel('manual_rtc');
    const offerCid = get(appLogicModuleStore).currentOfferCid;
    await bc.postMessage({ offer, answer, offerCid });
    bc.close();
  };

  const reportCriticalError = async (type: string, error?: any) => {
    console.error(`Critical error reported to MainAppRouter.svelte: ${type}`, error);
    if (type === 'socket') {
      history.replaceState(
        null,
        '',
        window.location.origin + window.location.pathname.split('/cb')[0]
      ); // Ensure path is clean

      const urlParams = new URLSearchParams(window.location.search);
      let reinitMode: 'client' | 'server';
      if ($configStore.general.configLoader === 'client') reinitMode = 'client';
      else reinitMode = 'server';

      if (appLogicInstance && appLogicInstance.destroy) {
        appLogicInstance.destroy();
      }

      const newContext: AppLogicContext = {
        webRTCApp,
        // config, getDirectClient, compress, decompress removed
        // appStateStore removed from context
        appOnId,
        broadcastManuallyEnteredAnswer,
        reportCriticalError
      };

      if (reinitMode === 'client') {
        appLogicInstance = new ClientLogic(newContext);
      } else {
        appLogicInstance = new ServerLogic(newContext);
      }
      try {
        await appLogicInstance.initialize(urlParams);
        console.log('MainAppRouter.svelte: Re-initialized logic module after critical error.');
      } catch (e) {
        console.error(
          'MainAppRouter.svelte: Failed to re-initialize logic module after critical error:',
          e
        );
      }
    }
  };

  // performLoginRedirect and handleLoginClick moved to AuthHandler.svelte

  onMount(async () => {
    // If using localStorage for persistent dismissal, check it here:
    // if (localStorage.getItem('downloadOverlayDismissed_v1') === 'true') {
    //   showDownloadAppOverlay = false;
    // }

    const urlParams = new URLSearchParams(window.location.search);

    // The /cb path is handled by AuthHandler.svelte and App.svelte ensures
    // this component is not rendered on /cb.
    // So, the if (currentPath === '/cb') block is removed.

    // Regular initialization for non-/cb paths.
    // This component now assumes it's only mounted when authenticated and not on /cb.
    let mode: 'client' | 'server';
    if (!$configStore.general.coordinatorUrl) {
      mode = 'client';
    } else {
      if (urlParams.get('mode') === 'server') mode = 'server';
      else if (urlParams.get('mode') === 'client') mode = 'client';
      else if (urlParams.has('r')) mode = 'server';
      else if (urlParams.has('offer')) mode = 'client';
      else if ($configStore.general.configLoader === 'client') mode = 'client';
      else mode = 'server';
    }

    const context: AppLogicContext = {
      webRTCApp,
      // config, getDirectClient, compress, decompress removed
      // appStateStore removed from context
      appOnId,
      broadcastManuallyEnteredAnswer,
      reportCriticalError
    };

    if (mode === 'client') {
      appLogicInstance = new ClientLogic(context);
    } else {
      appLogicInstance = new ServerLogic(context);
    }

    await appLogicInstance.initialize(urlParams);
  });

  onDestroy(() => {
    if (appLogicInstance && appLogicInstance.destroy) {
      appLogicInstance.destroy();
    }
  });

  function handleJoin() {
    if (
      appLogicInstance &&
      'handleJoin' in appLogicInstance &&
      typeof appLogicInstance.handleJoin === 'function'
    ) {
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get('r');
      if (id) {
        appLogicInstance.handleJoin(id);
      }
    } else {
      console.warn(
        'handleJoin called, but not available on current appLogicInstance or instance is null'
      );
    }
  }

  function toggleConfigOverlay() {
    showConfigOverlay = !showConfigOverlay;
  }

  async function handleHangup() {
    webRTCApp.destroy();
    appLogicModuleStore.update((s) => ({
      ...s,
      showCopyOverlay: false,
      initialOverlayShown: false,
      currentOfferCid: null
    }));
  }

  async function handleReset() {
    webRTCApp.reset();
    console.log('Handling reset, re-initializing logic module.');
    const urlParams = new URLSearchParams(window.location.search);
    if (appLogicInstance) {
      try {
        await appLogicInstance.initialize(urlParams);
      } catch (err) {
        console.error('Error re-initializing after reset:', err);
      }
    } else {
      console.error('Cannot re-initialize after reset: appLogicInstance is null.');
    }
  }

  async function handleOpenQrRequest() {
    if (appLogicInstance) {
      const urlParams = new URLSearchParams(window.location.search);
      await appLogicInstance.handleOpenQrRequest(urlParams);
    } else {
      console.warn('handleOpenQrRequest called, but appLogicInstance is null.');
    }
  }

  // Reactive statement to hide copy overlay
  $: {
    if ($appLogicModuleStore.showCopyOverlay && $appLogicModuleStore.initialOverlayShown) {
      const clients = Object.values($connectionStore.directClients);
      const isAnyClientConnected = clients.some(
        (client) => client && client.state === 'connected' && client.iceState === 'connected'
      );

      if (isAnyClientConnected) {
        console.log('A client connected while initial overlay was visible, hiding copy overlay.');
        appLogicModuleStore.update((s) => ({
          ...s,
          showCopyOverlay: false,
          initialOverlayShown: false
        }));
      }
    }
  }
</script>

<!-- 
  The outer {#if currentPath !== '/cb'} and the login modal UI 
  have been removed. App.svelte now controls when this component is rendered,
  ensuring it's only active when authenticated and not on the /cb path.
-->
<main class="flex-1 flex">
  <MediaArea hangup={handleHangup} openQr={handleOpenQrRequest} />
  <ControlPanel />
</main>

<CopyOverlay
  show={$appLogicModuleStore.showCopyOverlay}
  copyText={$appLogicModuleStore.copyText}
  qrCodeUrl={$appLogicModuleStore.qrCodeUrl}
  cid={$appLogicModuleStore.currentOfferCid}
  showAcceptButton={$appLogicModuleStore.showAcceptButton}
  showJoinButton={$appLogicModuleStore.showJoinButton}
  showCopyButton={$appLogicModuleStore.showCopyButton}
  showPasteText={$appLogicModuleStore.showPasteText}
  close={() => appLogicModuleStore.update((s) => ({ ...s, showCopyOverlay: false }))}
  openConfig={toggleConfigOverlay}
  reset={handleReset}
  accept={(e) => {
    if (
      appLogicInstance &&
      'acceptHandler' in appLogicInstance &&
      typeof appLogicInstance.acceptHandler === 'function'
    ) {
      appLogicInstance.acceptHandler(e.cid, e.pasteValue);
    } else {
      console.warn(
        'acceptHandler called, but not available on current appLogicInstance or instance is null'
      );
    }
  }}
  join={handleJoin}
/>

<ConfigOverlay
  show={showConfigOverlay}
  onclose={() => (showConfigOverlay = false)}
  onconfigUpdated={handleReset}
/>

{#if showDownloadAppOverlay}
  <DownloadAppOverlay onClose={handleCloseDownloadOverlay} />
{/if}

<ForwardOverlay />

<div id="diffs" class="whitespace-pre-line hidden"></div>
<!-- Removed {:else} block for /cb path -->
