<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import MediaArea from './components/MediaArea.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import CopyOverlay from './components/CopyOverlay.svelte';
  import ConfigOverlay from './components/ConfigOverlay.svelte';
  import { io, Socket } from 'socket.io-client';
  import ForwardOverlay from './components/ForwardOverlay.svelte';
  import { configStore, getAllConfig, type Config } from './stores/configStore.js';
  import { connectionStore, getDirectClient } from './stores/connectionStore.js';
  import { compress, decompress } from './lib/utils/sdpCompress.js';
  import type { WebRTCApp } from './lib/webrtc/WebRTCApp.js';
  
  import type { AppLogic, AppLogicContext, AppLogicState } from './lib/appLogic';
  import { ClientLogic } from './lib/clientLogic';
  import { ServerLogic } from './lib/serverLogic';
  import type { RTCIceCandidateInit } from './types/global'; // For socket handler candidate types


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
  
  // Socket.io connection
  let socket: Socket;
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

  onMount(async () => {
    socket = io('ws://127.0.0.1:5001', { autoConnect: false }); // autoConnect false, connect manually
    setupSocketHandlers();
    
    const urlParams = new URLSearchParams(window.location.search);
    let mode: 'client' | 'server';

    if (urlParams.get('mode') === 'server') mode = 'server';
    else if (urlParams.get('mode') === 'client') mode = 'client';
    else if (urlParams.has('r')) mode = 'server';
    else if (urlParams.has('offer')) mode = 'client';
    else if ($configStore['config-loader'] === 'client') mode = 'client';
    else mode = 'server';

    const context: AppLogicContext = {
      webRTCApp,
      socket,
      config: $configStore, // Pass reactive store value, will be a snapshot
      getDirectClient,
      compress,
      decompress,
      setState,
      getState,
      appOnId,
      broadcastManuallyEnteredAnswer,
    };
    
    if (!socket.connected) {
        socket.connect(); // Connect socket before initializing logic that might use it
    }

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
    if (socket && socket.connected) {
      socket.disconnect();
    }
    if (configUnsubscribe) {
      configUnsubscribe();
    }
  });
  
  function setupSocketHandlers() {
    socket.on('init', async (id: string) => {
      console.log("init", id);
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('r', id);
      history.replaceState(null, '', '?' + urlParams.toString());
      appOnId(); 

      if ($configStore['config-loader'] === 'server') {
        setState(current => ({
          ...current,
          showCopyButton: true,
          showAcceptButton: false, 
          showJoinButton: false, // Room ID now available
        }));
      }

      if (appLogicModuleState.isDuringInitialServerLoad) {
        setState({
          initialOverlayShown: true,
          isDuringInitialServerLoad: false,
        });
      }
    });
    
    socket.on('subscribed', async (sid: string) => {
      console.log('got subscribed', sid);
      const cid = await webRTCApp.getOffer(async (candidate: RTCIceCandidateInit | null) => {
        if (!candidate) return;
        console.log("got a candidate for subscribed", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
      }, {sid});
      const client = getDirectClient(cid);
      const sdp = client?.pc?.localDescription?.sdp;
      if (sdp) {
        console.log("sending an offer for subscribed", sid, sdp);
        socket.emit('offer', sid, sdp);
      }
    });

    socket.on('answer', async (sid: string, sdp: string) => {
      console.log('got an answer from socket', sid, sdp);
      const cid = webRTCApp.getCid(sid);
      if (cid) {
        const client = getDirectClient(cid);
        if (client?.pc) {
          try {
            await client.pc.setRemoteDescription({ type: "answer", sdp: sdp.trim() + '\n' });
          } catch (e) {
            console.error("Error setting remote description from socket answer:", e, "SDP:", sdp);
          }
        } else {
          console.warn("Client or PC not found for socket answer. CID:", cid);
        }
      } else {
         console.warn("No CID found for SID:", sid, "on socket answer.");
      }
    });
    
    socket.on('offer', async (sid: string, sdp: string) => {
      console.log('got an offer from socket', sid, sdp);
      const cid = await webRTCApp.getAnswer(sdp, async (candidate: RTCIceCandidateInit | null) => {
        if (!candidate) return;
        console.log("got a candidate for offer", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
      }, {sid});
      const client = getDirectClient(cid);
      const asdp = client?.pc?.localDescription?.sdp;
      if (asdp) {
        console.log("sending an answer for offer", sid, asdp);
        socket.emit('answer', sid, asdp);
      }
    });
    
    socket.on('error', async () => {
      console.error("Socket connection error. Attempting to re-initialize.");
      history.replaceState(null, '', window.location.origin + window.location.pathname);
      
      // Attempt to re-initialize the logic module
      const urlParams = new URLSearchParams(window.location.search);
      let mode: 'client' | 'server';
      if ($configStore['config-loader'] === 'client') mode = 'client'; // Check current config
      else mode = 'server'; // Fallback or re-evaluate based on params if needed

      const newContext: AppLogicContext = { 
        webRTCApp, socket, config: $configStore, getDirectClient, 
        compress, decompress, setState, getState, appOnId, broadcastManuallyEnteredAnswer 
      };

      if (!socket.connected) socket.connect(); // Ensure socket is trying to connect

      if (mode === 'client') {
        appLogicInstance = new ClientLogic(newContext);
      } else {
        appLogicInstance = new ServerLogic(newContext);
      }
      try {
        await appLogicInstance.initialize(urlParams);
      } catch (e) {
        console.error("Failed to re-initialize after socket error:", e);
        // Consider a more drastic recovery like window.location.reload();
      }
    });
    
    socket.on('candidate', async (sid: string, candidateStr: string) => {
      console.log('got a candidate from peer via socket', sid, candidateStr);
      const cid = webRTCApp.getCid(sid);
       if (cid) {
        const client = getDirectClient(cid);
        if (client?.pc) {
          try {
              await client.pc.addIceCandidate(JSON.parse(candidateStr));
          } catch (e) {
              console.error("Error adding ICE candidate from socket:", e);
          }
        } else {
          console.warn("Client or PC not found for socket candidate. CID:", cid);
        }
      } else {
        console.warn("No CID found for SID:", sid, "on socket candidate.");
      }
    });
  }
  
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
  
  const acceptHandler = async (cidFromEvent: string | null, pasteValue: string) => { 
    const targetCid = cidFromEvent || appLogicModuleState.currentOfferCid; // Use event CID or fallback to current app offer CID
    if (!pasteValue || !targetCid) {
      console.warn("Accept handler: Paste value or CID is missing.", {pasteValue, targetCid});
      return;
    }
    
    try {
      const answer = await decompress(pasteValue.trim());
      const client = getDirectClient(targetCid);
      if (client?.pc) {
        await client.pc.setRemoteDescription({ type: "answer", sdp: answer.trim() + '\n' });
        console.log("Successfully set remote description from pasted answer for CID:", targetCid);
        setState({ showCopyOverlay: false, initialOverlayShown: false }); // Hide overlay on success
      } else {
        console.warn("Client or PeerConnection not found for CID:", targetCid, "when accepting pasted answer.");
      }
    } catch (e) {
      console.error("Error processing pasted answer for CID:", targetCid, e);
    }
  };
  
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
  <MediaArea {hangup} openQr={handleOpenQrRequest} />
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
  accept={(e) => acceptHandler(e.cid, e.pasteValue)} 
  join={handleJoin}
/>

<ConfigOverlay 
  show={showConfigOverlay} 
  onclose={() => showConfigOverlay = false}
  onconfigUpdated={handleReset}
/>

<ForwardOverlay />

<div id="diffs" class="whitespace-pre-line hidden"></div>
