<script lang="ts">
/// <reference path="../../../types/global.d.ts" />
  import { onMount, onDestroy } from 'svelte';
  import MediaArea from './components/MediaArea.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import CopyOverlay from './components/CopyOverlay.svelte';
  import ConfigOverlay from './components/ConfigOverlay.svelte';
  // import { io, Socket } from 'socket.io-client'; // Socket handled by ServerLogic
  import ForwardOverlay from './components/ForwardOverlay.svelte';
  import { configStore, getAllConfig, type Config } from './stores/configStore.js';
  import { connectionStore, getDirectClient } from './stores/connectionStore.js';
  import { compress, decompress } from './lib/utils/sdpCompress.js';
  import type { WebRTCApp } from './lib/webrtc/WebRTCApp.js';
  
  import type { AppLogic, AppLogicContext, AppLogicState } from './lib/appLogic.js';
  import { ClientLogic } from './lib/clientLogic.js';
  import { ServerLogic } from './lib/serverLogic.js';


  // Props
  export let webRTCApp: WebRTCApp;
  
  // State managed by App.svelte, accessible/modifiable by logic modules via context
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

  // Other App.svelte specific state
  let showConfigOverlay = false;
  
  // Socket.io connection is now managed by ServerLogic
  // let socket: Socket; 
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
    const urlParams = new URLSearchParams(window.location.search);
    const newUrl = ($configStore['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
    setState({
      showCopyOverlay: true,
      copyText: newUrl,
      qrCodeUrl: newUrl,
    });
  };

  const broadcastManuallyEnteredAnswer = async (offer: string, answer: string) => {
    const bc = new BroadcastChannel("manual_rtc");
    // Include offerCid if available and relevant for matching
    const offerCid = appLogicModuleState.currentOfferCid; // Or pass it if known from elsewhere
    await bc.postMessage({ offer, answer, offerCid }); // Add offerCid
    bc.close();
  };

  const reportCriticalError = async (type: string, error?: any) => {
    console.error(`Critical error reported to App.svelte: ${type}`, error);
    if (type === 'socket') {
      // This logic was previously in the socket.on('error') handler in App.svelte
      history.replaceState(null, '', window.location.origin + window.location.pathname);
      
      const urlParams = new URLSearchParams(window.location.search);
      let reinitMode: 'client' | 'server';
      // Determine mode for re-initialization
      if ($configStore['config-loader'] === 'client') reinitMode = 'client';
      else reinitMode = 'server';

      // Destroy current logic instance if it exists and has a destroy method
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
        reportCriticalError // Pass self for future critical errors from the new instance
      };

      if (reinitMode === 'client') {
        appLogicInstance = new ClientLogic(newContext);
      } else {
        appLogicInstance = new ServerLogic(newContext);
      }
      try {
        await appLogicInstance.initialize(urlParams);
        console.log("App.svelte: Re-initialized logic module after critical error.");
      } catch (e) {
        console.error("App.svelte: Failed to re-initialize logic module after critical error:", e);
        // Consider a more drastic recovery like window.location.reload(); if re-init fails
      }
    }
  };

  onMount(async () => {
    // Socket initialization and handler setup moved to ServerLogic
    // socket = io('ws://127.0.0.1:5001', { autoConnect: false }); 
    // setupSocketHandlers();
    
    const urlParams = new URLSearchParams(window.location.search);
    let mode: 'client' | 'server';

    // If coordinator-url is not defined, default to client mode
    if (!$configStore['coordinator-url']) {
      mode = 'client';
    } else {
      // Original mode selection logic
      if (urlParams.get('mode') === 'server') mode = 'server';
      else if (urlParams.get('mode') === 'client') mode = 'client';
      else if (urlParams.has('r')) mode = 'server';
      else if (urlParams.has('offer')) mode = 'client';
      else if ($configStore['config-loader'] === 'client') mode = 'client';
      else mode = 'server';
    }

    const context: AppLogicContext = {
      webRTCApp,
      // socket, // Removed from context
      config: $configStore, // Pass reactive store value, will be a snapshot
      getDirectClient,
      compress,
      decompress,
      setState,
      getState,
      appOnId,
      broadcastManuallyEnteredAnswer,
      reportCriticalError, // Add the error reporter function to the context
    };
    
    // Socket connection is now handled by ServerLogic internally
    // if (!socket.connected) {
    //     socket.connect(); 
    // }

    if (mode === 'client') {
      appLogicInstance = new ClientLogic(context);
    } else {
      appLogicInstance = new ServerLogic(context);
    }
    
    await appLogicInstance.initialize(urlParams);

    configUnsubscribe = configStore.subscribe(newConfig => {
      if (appLogicInstance && (appLogicInstance as any).context) {
        // Update the config snapshot in the context if it changes
        (appLogicInstance as any).context.config = newConfig;
      }
    });
  });
  
  onDestroy(() => {
    // Socket disconnection is now handled by ServerLogic's destroy method (if appLogicInstance is ServerLogic)
    // if (socket && socket.connected) {
    //   socket.disconnect();
    // }
    if (appLogicInstance && appLogicInstance.destroy) {
      appLogicInstance.destroy(); // This will call ServerLogic.destroy() or ClientLogic.destroy() if they exist
    }
    if (configUnsubscribe) {
      configUnsubscribe();
    }
  });
  
  // function setupSocketHandlers() { ... } // This entire function has been removed as its logic is now in ServerLogic.ts
  
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
  
  async function handleHangup() { // Make async if re-init is async
    webRTCApp.destroy();
    setState({
        showCopyOverlay: false,
        initialOverlayShown: false,
        currentOfferCid: null, // Clear current offer context
        // Reset other relevant states if needed
    });
    // Optionally, re-initialize to a clean state.
    // This might involve re-running the onMount logic to pick client/server mode.
    // For now, just clears overlay and offer CID.
    // Consider if a full re-init is needed:
    // if (appLogicInstance) {
    //   const urlParams = new URLSearchParams(window.location.search);
    //   (appLogicInstance as any).context.config = $configStore; // Update config
    //   await appLogicInstance.initialize(urlParams);
    // }
  }
  
  async function handleReset() {
    webRTCApp.reset(); // Resets WebRTCApp state
    // After reset, re-initialize the logic module to reflect a clean state.
    console.log("Handling reset, re-initializing logic module.");
    const urlParams = new URLSearchParams(window.location.search); // Get current URL state
    if (appLogicInstance) {
        (appLogicInstance as any).context.config = $configStore; // Ensure context has latest config
        try {
            await appLogicInstance.initialize(urlParams);
        } catch (err) {
            console.error("Error re-initializing after reset:", err);
        }
    } else {
        console.error("Cannot re-initialize after reset: appLogicInstance is null. This may require a page reload.");
        // Fallback: attempt to run the main onMount logic again if instance is lost
        // This is a heavy-handed recovery.
        // await onMount(); // This is not how Svelte's onMount works for re-triggering.
        // A page reload might be the most robust solution if appLogicInstance is unexpectedly null.
        // window.location.reload(); 
    }
  }

  async function handleOpenQrRequest() {
    if (appLogicInstance) {
      const urlParams = new URLSearchParams(window.location.search);
      await appLogicInstance.handleOpenQrRequest(urlParams);
    } else {
      console.warn("handleOpenQrRequest called, but appLogicInstance is null.");
      // Potentially try to re-initialize or alert user
    }
  }

  // Reactive statement to hide copy overlay
  $: {
    if (appLogicModuleState.showCopyOverlay && appLogicModuleState.initialOverlayShown) { 
      const clients = Object.values($connectionStore.directClients);
      const isAnyClientConnected = clients.some(
        client => client && client.connectionState === 'connected' && client.iceConnectionState === 'connected'
      );

      // TODO: fix for rejoins for client mode (ensure this logic is still valid)
      // This auto-hiding is primarily for the initial connection.
      // If a client is already connected when the overlay is shown (e.g. manual QR open), it shouldn't auto-hide.

      if (isAnyClientConnected) {
        console.log("A client connected while initial overlay was visible, hiding copy overlay.");
        setState({ showCopyOverlay: false, initialOverlayShown: false });
      }
    }
  }

</script>

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
