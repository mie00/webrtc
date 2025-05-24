<script lang="ts">
  /// <reference path="../../../../types/global.d.ts" />
  import { onMount, onDestroy } from 'svelte';
  import { authStore, type AuthState } from '../stores/authStore.js'; // Import authStore
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
  let currentPath = window.location.pathname;
  let currentAuthState: AuthState; // To hold reactive auth state

  authStore.subscribe(value => {
    currentAuthState = value;
  });
  
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

  const performLoginRedirect = (url: string) => {
    window.location.href = url;
  };

  async function handleLoginClick() {
    const pkJwk = await authStore.ensureKeyPair();
    if (pkJwk) {
      const callbackTarget = `${window.location.origin}/cb`; // cid is not strictly needed for auth callback anymore
      const loginUrl = `http://localhost:5173/login?callback=${encodeURIComponent(callbackTarget)}&payload=${encodeURIComponent(JSON.stringify(pkJwk))}`;
      performLoginRedirect(loginUrl);
    } else {
      console.error("Failed to get public key for login redirect.");
      // Show error to user
    }
  }

  onMount(async () => {
    // webRTCApp.setRequestLoginRedirectCallback(performLoginRedirect); // No longer used from WebRTCApp
    const urlParams = new URLSearchParams(window.location.search);

    if (currentPath === '/cb') {
      // const cid = urlParams.get('cid'); // cid might not be relevant here anymore for auth
      const jwt = urlParams.get('jwt');
      const pubkeyJwkString = urlParams.get('pubkey'); // This is the JWK string

      if (jwt && pubkeyJwkString) {
        const success = authStore.setJwtAndVerifyKey(jwt, pubkeyJwkString);
        if (success) {
          console.log("JWT and public key stored successfully.");
        } else {
          console.error("Failed to store JWT or verify public key.");
          // Potentially show an error to the user
        }
      } else {
        console.error("Missing jwt or pubkey in callback URL for /cb");
      }
      // Always redirect to the main page after processing /cb
      const basePath = window.location.pathname.split('/cb')[0] || '/'; // Handles sub-paths if any
      window.location.href = window.location.origin + basePath; // Clears query params
      return; // Stop further processing for /cb path
    }

    // Regular initialization for non-/cb paths
    // The AppLogicContext will need access to authStore values if Client/ServerLogic need them
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
      if (appLogicInstance && (appLogicInstance as any).context) {
        (appLogicInstance as any).context.config = newConfig;
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
        (appLogicInstance as any).context.config = $configStore;
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

{#if currentPath !== '/cb'}
  {#if !currentAuthState || !currentAuthState.jwt}
    <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex justify-center items-center z-50">
      <div class="p-5 border w-96 shadow-lg rounded-md bg-white">
        <div class="text-center">
          <h3 class="text-lg leading-6 font-medium text-gray-900">Authentication Required</h3>
          <div class="mt-2 px-7 py-3">
            <p class="text-sm text-gray-500">
              Please log in to use the full features of the application.
            </p>
          </div>
          <div class="items-center px-4 py-3">
            <button
              id="login-button"
              class="px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              on:click={handleLoginClick}
            >
              Login
            </button>
          </div>
           <div class="items-center px-4 py-3">
            <button
              class="px-4 py-2 bg-gray-200 text-gray-700 text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300"
              on:click={() => authStore.logout()}
            >
              (Dev) Logout / Clear Auth
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

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
{:else}
  <div>Processing callback...</div>
{/if}
