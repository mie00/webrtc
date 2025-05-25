<script lang="ts">
  /// <reference path="../../../../types/global.d.ts" />
  import { onMount, onDestroy } from 'svelte';
  // import { authStore, type AuthState } from '../stores/authStore.js'; // No longer directly needed for UI
  import MediaArea from './MediaArea.svelte';
  import ControlPanel from './ControlPanel.svelte';
  import CopyOverlay from './CopyOverlay.svelte';
  import ConfigOverlay from './ConfigOverlay.svelte';
  import ForwardOverlay from './ForwardOverlay.svelte';
  import { configStore, getAllConfig, type Config } from '../stores/configStore.js';
  import { connectionStore, getDirectClient } from '../stores/connectionStore.js';
  import { compress, decompress } from '../lib/utils/sdpCompress.js';
  import type { WebRTCApp } from '../lib/webrtc/WebRTCApp.js';
  
  import type { AppLogic, AppLogicContext, AppLogicState } from '../lib/appLogic.js';
  import { ClientLogic } from '../lib/clientLogic.js';
  import { ServerLogic } from '../lib/serverLogic.js';

  // Props
  export let webRTCApp: WebRTCApp;
  
  // State managed by this component, accessible/modifiable by logic modules via context
  let appLogicModuleState: AppLogicState = {
    showCopyOverlay: false,
    initialOverlayShown: false,
    copyText: '',
    qrCodeUrl: '',
    showAcceptButton: false,
    showJoinButton: false,
    showCopyButton: true,
    showPasteText: false,
    currentOfferCid: null,
    isDuringInitialServerLoad: false,
  };

  // Other component specific state
  let showConfigOverlay = false;
  // currentPath is still used by onMount logic for parameter parsing, but not for /cb routing
  let currentPath = window.location.pathname; 
  // let currentAuthState: AuthState; // No longer needed for UI logic here

  // authStore.subscribe(value => { // No longer needed for UI logic here
  //   currentAuthState = value;
  // });
  
  let appLogicInstance: AppLogic | null = null;
  let configUnsubscribe: (() => void) | null = null;
  
  const setState = (updater: Partial<AppLogicState> | ((prevState: AppLogicState) => Partial<AppLogicState>)) => {
    if (typeof updater === 'function') {
      appLogicModuleState = { ...appLogicModuleState, ...updater(appLogicModuleState) };
    } else {
      appLogicModuleState = { ...appLogicModuleState, ...updater };
    }
  };

  const getState = (): AppLogicState => {
    return appLogicModuleState;
  };

  const appOnId = () => {
    const newUrl = ($configStore['config-host'] || window.location.origin) + window.location.pathname + window.location.search;
    setState({
      showCopyOverlay: true,
      copyText: newUrl,
      qrCodeUrl: newUrl,
    });
  };

  const broadcastManuallyEnteredAnswer = async (offer: string, answer: string) => {
    const bc = new BroadcastChannel("manual_rtc");
    const offerCid = appLogicModuleState.currentOfferCid;
    await bc.postMessage({ offer, answer, offerCid });
    bc.close();
  };

  const reportCriticalError = async (type: string, error?: any) => {
    console.error(`Critical error reported to MainAppRouter.svelte: ${type}`, error);
    if (type === 'socket') {
      history.replaceState(null, '', window.location.origin + window.location.pathname.split('/cb')[0]); // Ensure path is clean
      
      const urlParams = new URLSearchParams(window.location.search);
      let reinitMode: 'client' | 'server';
      if ($configStore['config-loader'] === 'client') reinitMode = 'client';
      else reinitMode = 'server';

      if (appLogicInstance && appLogicInstance.destroy) {
        appLogicInstance.destroy();
      }

      const newContext: AppLogicContext = { 
        webRTCApp, 
        config: $configStore, 
        getDirectClient, 
        compress, 
        decompress, 
        setState, 
        getState, 
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
        console.log("MainAppRouter.svelte: Re-initialized logic module after critical error.");
      } catch (e) {
        console.error("MainAppRouter.svelte: Failed to re-initialize logic module after critical error:", e);
      }
    }
  };

  // performLoginRedirect and handleLoginClick moved to AuthHandler.svelte

  onMount(async () => {
    const urlParams = new URLSearchParams(window.location.search);

    // The /cb path is handled by AuthHandler.svelte and App.svelte ensures
    // this component is not rendered on /cb.
    // So, the if (currentPath === '/cb') block is removed.

    // Regular initialization for non-/cb paths.
    // This component now assumes it's only mounted when authenticated and not on /cb.
    let mode: 'client' | 'server';
    if (!$configStore['coordinator-url']) {
      mode = 'client';
    } else {
      if (urlParams.get('mode') === 'server') mode = 'server';
      else if (urlParams.get('mode') === 'client') mode = 'client';
      else if (urlParams.has('r')) mode = 'server';
      else if (urlParams.has('offer')) mode = 'client';
      else if ($configStore['config-loader'] === 'client') mode = 'client';
      else mode = 'server';
    }

    const context: AppLogicContext = {
      webRTCApp,
      config: $configStore,
      getDirectClient,
      compress,
      decompress,
      setState,
      getState,
      appOnId,
      broadcastManuallyEnteredAnswer,
      reportCriticalError,
    };
    
    if (mode === 'client') {
      appLogicInstance = new ClientLogic(context);
    } else {
      appLogicInstance = new ServerLogic(context);
    }
    
    await appLogicInstance.initialize(urlParams);

    configUnsubscribe = configStore.subscribe(newConfig => {
      if (appLogicInstance && appLogicInstance.setConfig) {
        appLogicInstance.setConfig(newConfig);
      }
    });
  });
  
  onDestroy(() => {
    if (appLogicInstance && appLogicInstance.destroy) {
      appLogicInstance.destroy();
    }
    if (configUnsubscribe) {
      configUnsubscribe();
    }
  });
  
  function handleJoin() {
    if (appLogicInstance && 'handleJoin' in appLogicInstance && typeof appLogicInstance.handleJoin === 'function') {
      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get('r');
      if (id) {
        appLogicInstance.handleJoin(id);
      }
    } else {
      console.warn("handleJoin called, but not available on current appLogicInstance or instance is null");
    }
  }
  
  function toggleConfigOverlay() {
    showConfigOverlay = !showConfigOverlay;
  }
  
  async function handleHangup() {
    webRTCApp.destroy();
    setState({
        showCopyOverlay: false,
        initialOverlayShown: false,
        currentOfferCid: null,
    });
  }
  
  async function handleReset() {
    webRTCApp.reset(); 
    console.log("Handling reset, re-initializing logic module.");
    const urlParams = new URLSearchParams(window.location.search);
    if (appLogicInstance) {
        if (appLogicInstance.setConfig) {
          appLogicInstance.setConfig($configStore);
        }
        try {
            await appLogicInstance.initialize(urlParams);
        } catch (err) {
            console.error("Error re-initializing after reset:", err);
        }
    } else {
        console.error("Cannot re-initialize after reset: appLogicInstance is null.");
    }
  }

  async function handleOpenQrRequest() {
    if (appLogicInstance) {
      const urlParams = new URLSearchParams(window.location.search);
      await appLogicInstance.handleOpenQrRequest(urlParams);
    } else {
      console.warn("handleOpenQrRequest called, but appLogicInstance is null.");
    }
  }

  // Reactive statement to hide copy overlay
  $: {
    if (appLogicModuleState.showCopyOverlay && appLogicModuleState.initialOverlayShown) { 
      const clients = Object.values($connectionStore.directClients);
      const isAnyClientConnected = clients.some(
        client => client && client.connectionState === 'connected' && client.iceConnectionState === 'connected'
      );

      if (isAnyClientConnected) {
        console.log("A client connected while initial overlay was visible, hiding copy overlay.");
        setState({ showCopyOverlay: false, initialOverlayShown: false });
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
    show={appLogicModuleState.showCopyOverlay} 
    copyText={appLogicModuleState.copyText}
    qrCodeUrl={appLogicModuleState.qrCodeUrl}
    cid={appLogicModuleState.currentOfferCid}
    showAcceptButton={appLogicModuleState.showAcceptButton}
    showJoinButton={appLogicModuleState.showJoinButton}
    showCopyButton={appLogicModuleState.showCopyButton}
    showPasteText={appLogicModuleState.showPasteText}
    close={() => setState({ showCopyOverlay: false })}
    openConfig={toggleConfigOverlay}
    reset={handleReset}
    accept={(e) => {
      if (appLogicInstance && 'acceptHandler' in appLogicInstance && typeof appLogicInstance.acceptHandler === 'function') {
        appLogicInstance.acceptHandler(e.cid, e.pasteValue);
      } else {
        console.warn("acceptHandler called, but not available on current appLogicInstance or instance is null");
      }
    }}
    join={handleJoin}
  />

  <ConfigOverlay 
    show={showConfigOverlay} 
    onclose={() => showConfigOverlay = false}
    onconfigUpdated={handleReset}
  />

  <ForwardOverlay />

  <div id="diffs" class="whitespace-pre-line hidden"></div>
<!-- Removed {:else} block for /cb path -->
