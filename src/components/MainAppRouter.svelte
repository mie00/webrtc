<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import MediaArea from './MediaArea.svelte';
  import ControlPanel from './ControlPanel.svelte';
  import CopyOverlay from './CopyOverlay.svelte';
  import ConfigOverlay from './ConfigOverlay.svelte';
  import ForwardOverlay from './ForwardOverlay.svelte';
  import { configStore, getAllConfig } from '../lib/stores/configStore';
  import { connectionStore, getDirectClient } from '../lib/stores/connectionStore';
  import DownloadAppOverlay from './DownloadAppOverlay.svelte';
  import type { WebRTCApp } from '../lib/webrtc/WebRTCApp';
  import { appLogicModuleStore } from '../lib/stores/appLogicStore';

  import type { AppLogic, AppLogicContext } from '../lib/appLogic';
  import { ClientLogic } from '../lib/clientLogic';
  import { ServerLogic } from '../lib/serverLogic';

  // Props
  let { webRTCApp }: { webRTCApp: WebRTCApp } = $props();

  // Other component specific state
  let showConfigOverlay = $state(false);
  let showDownloadAppOverlay = $state(true); // Controls rendering of DownloadAppOverlay
  let previousShowCopyOverlay = $state(get(appLogicModuleStore).showCopyOverlay);

  let appLogicInstance: AppLogic | null = null;

  function handleCloseDownloadOverlay() {
    showDownloadAppOverlay = false;
  }

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

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);

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

  // Reactive statement to hide copy overlay, converted to $effect
  $effect(() => {
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
  });

  // Effect to destroy client when CopyOverlay is dismissed, unless the client itself connected
  $effect(() => {
    const currentShowCopyOverlay = $appLogicModuleStore.showCopyOverlay;
    const currentCid = $appLogicModuleStore.currentOfferCid;

    if (previousShowCopyOverlay && !currentShowCopyOverlay && currentCid) {
      const client = getDirectClient(currentCid);
      if (client && client.state === 'connected' && client.iceState === 'connected') {
        // currentOfferCid itself is connected. Do NOT destroy it.
        console.log(
          `CopyOverlay for ${currentCid} dismissed, but client is connected. Not destroying.`
        );
      } else {
        console.log(
          `CopyOverlay for ${currentCid} dismissed, client not (yet) connected. Destroying client.`
        );
        webRTCApp.destroyClient(currentCid);
        appLogicModuleStore.update((s) => ({ ...s, currentOfferCid: null }));
      }
    }
    previousShowCopyOverlay = currentShowCopyOverlay;
  });
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
