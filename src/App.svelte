<script lang="ts">
  import { onMount } from 'svelte';
  import MediaArea from './components/MediaArea.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import CopyOverlay from './components/CopyOverlay.svelte';
  import ConfigOverlay from './components/ConfigOverlay.svelte';
  import { io, Socket } from 'socket.io-client';
  import ContextMenu from './components/ContextMenu.svelte';
  import { configStore, getAllConfig } from './stores/configStore.js';
  import { streamStore } from './stores/streamStore.js';
  import { connectionStore, getDirectClient } from './stores/connectionStore.js';
  import { compress, decompress } from './lib/utils/sdpCompress.js';
  import type { WebRTCApp } from './lib/webrtc/WebRTCApp.js'; // Corrected import path if needed

  // Props
  export let webRTCApp: WebRTCApp; // Add type annotation
  
  // State
  let showCopyOverlay = false;
  let initialOverlayShown = false; // True if overlay is shown by a windowLoader as part of initial page load
  let showConfigOverlay = false;
  let copyText = '';
  let qrCodeUrl = '';
  let showAcceptButton = false;
  let showJoinButton = false;
  let showCopyButton = true;
  let showPasteText = false;
  let currentOfferCid: string | null = null; // Store the CID for the manual offer

  // Socket.io connection
  let socket: Socket; // Add type annotation
  let isDuringInitialServerLoad = false; // Helper for serverWindowLoader's async init path
  
  // Window loader function type
  type WindowLoader = () => Promise<void>;
  
  onMount(() => {
    // Initialize socket connection
    socket = io('ws://127.0.0.1:5001');
    
    // Setup socket event handlers
    setupSocketHandlers();
    
    // Setup window event handlers
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'server') {
      windowLoader = serverWindowLoader;
    } else if (urlParams.get('mode') === 'client') {
      windowLoader = clientWindowLoader;
    } else if (urlParams.has('r')) {
      windowLoader = serverWindowLoader;
    } else if (urlParams.has('offer')) {
      windowLoader = clientWindowLoader;
    } else if ($configStore['config-loader'] === 'client') {
      windowLoader = clientWindowLoader;
    } else {
      windowLoader = serverWindowLoader;
    }
    // WebRTCApp now gets config directly from the store when needed (e.g., in initClient)
    // No need to pass config to it here.

    // Subscribe to config changes (still useful if App.svelte needs to react)
    const unsubscribe = configStore.subscribe(newConfig => {
      // If App.svelte needs to react to config changes, do it here.
      // Example: console.log('Config updated in App.svelte:', newConfig);
    });

    // Run the appropriate loader
    windowLoader();
    
    return () => {
      // Cleanup on component unmount
      if (socket) {
        socket.disconnect();
      }
      unsubscribe();
    };
  });
  
  // Socket event handlers
  function setupSocketHandlers() {
    socket.on('init', async (id: string) => { // Add type for id
      console.log("init", id);
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('r', id);
      history.replaceState(null, '', '?' + urlParams.toString());
      onId(); // Sets showCopyOverlay = true, copyText, qrCodeUrl

      // If this 'init' event establishes a server-mode room context,
      // ensure button visibility reflects that. This handles cases where
      // the previous state might have been different (e.g., client mode).
      if ($configStore['config-loader'] === 'server') {
        showCopyButton = true;
        showAcceptButton = false; 
        showJoinButton = false; // A room ID is now available via 'init'
      }

      if (isDuringInitialServerLoad) {
        initialOverlayShown = true;
        isDuringInitialServerLoad = false; // Reset flag
      }
    });
    
    socket.on('subscribed', async (sid: string) => { // Add type for sid
      console.log('got subscribed', sid);
      const cid = await webRTCApp.getOffer(async (candidate: RTCIceCandidateInit | null) => { // Add type for candidate
        if (!candidate) return;
        console.log("got a candidate", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
      }, {sid});
      const app = webRTCApp.getApp();
      const client = getDirectClient(cid); // Get client from store
      const sdp = client?.pc?.localDescription?.sdp;
      if (sdp) {
        console.log("sending an offer", sid, sdp);
        socket.emit('offer', sid, sdp);
      }
    });

    socket.on('answer', async (sid: string, sdp: string) => { // Add types for sid and sdp
      console.log('got an answer', sid, sdp);
      const app = webRTCApp.getApp(); // Keep for sids mapping for now
      const cid = app.sids?.[sid];
      if (cid) {
        const client = getDirectClient(cid); // Get client from store
        client?.pc?.setRemoteDescription({
          type: "answer",
          sdp: sdp.trim() + '\n'
        });
      }
    });
    
    socket.on('offer', async (sid: string, sdp: string) => { // Add types for sid and sdp
      console.log('got an offer', sid, sdp);
      const cid = await webRTCApp.getAnswer(sdp, async (candidate: RTCIceCandidateInit | null) => { // Add type for candidate
        if (!candidate) return;
        console.log("got a candidate", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
      }, {sid});
      // const app = webRTCApp.getApp(); // No longer needed for client access
      const client = getDirectClient(cid); // Get client from store
      const asdp = client?.pc?.localDescription?.sdp;
      if (asdp) {
        console.log("sending an answer", sid, asdp);
        socket.emit('answer', sid, asdp);
      }
    });
    
    socket.on('error', async () => {
      history.replaceState(null, '', window.location.origin + window.location.pathname);
      const app = webRTCApp.getApp();
      if (getAllConfig()['config-loader'] === 'client') {
        windowLoader = clientWindowLoader;
      }
      windowLoader();
    });
    
    socket.on('candidate', async (sid: string, candidate: string) => { // Add types for sid and candidate (stringified JSON)
      console.log('got a candidate from peer', sid, candidate);
      const app = webRTCApp.getApp(); // Keep for sids mapping for now
      const cid = app.sids?.[sid];
       if (cid) {
        const client = getDirectClient(cid); // Get client from store
        try {
            await client?.pc?.addIceCandidate(JSON.parse(candidate));
        } catch (e) {
            console.error("Error adding ICE candidate:", e);
        }
      }
    });
  }
  
  // Window loaders
  let windowLoader: WindowLoader; // Use the defined type
  
  const clientWindowLoader: WindowLoader = async () => {
    const globalConfig = getAllConfig();
    console.log("client window loader");
    const urlParams = new URLSearchParams(window.location.search);

    if (!urlParams.get('offer') && !urlParams.get('answer')) { // No offer or answer in URL, we initiate.
      currentOfferCid = null; // Reset any previous offer context for a fresh start.
      const { offerCid } = await prepareOfferForClientModeDisplay();
      // showCopyOverlay is set by prepareOfferForClientModeDisplay
      initialOverlayShown = true;
      if (offerCid) {
        const bc = new BroadcastChannel("manual_rtc");
        bc.onmessage = async (event) => {
          const data = event.data;
          if (typeof data === 'object' && data !== null && data.offer && data.answer) {
            console.log("Received matching answer via broadcast channel for offer:", data.offer);
            const answer = await decompress(data.answer.trim());
            const client = getDirectClient(offerCid); // Use offerCid from the closure
            if (client?.pc) {
              try {
                await client.pc.setRemoteDescription({ type: "answer", sdp: answer.trim() + '\n' });
                console.log("Successfully set remote description from broadcast answer.");
                bc.close();
              } catch (e) {
                console.error("Error setting remote description from broadcast answer:", e);
              }
            } else {
              console.warn("Client or PeerConnection not found when processing broadcast answer.");
            }
          } else {
            console.warn("Received broadcast message with non-matching/invalid offer. Ignoring.", { receivedData: data });
          }
        };
      }
    } else if (urlParams.get('answer')) { // Answer is in URL (and offer implicitly)
      const answerParam = urlParams.get('answer');
      const offerParamForAnswer = urlParams.get('offer');
      console.log("MIEMIEMIE", answerParam, offerParamForAnswer)
      if (answerParam && offerParamForAnswer) {
        const bc = new BroadcastChannel("manual_rtc");
        await bc.postMessage({ offer: offerParamForAnswer, answer: answerParam });
        bc.close();
      }
      showCopyOverlay = true;
      initialOverlayShown = true;
      copyText = 'Call started on another tab, please close this one';
      showCopyButton = false;
      showAcceptButton = false;
      showPasteText = false;
      showJoinButton = false;
    } else if (urlParams.get('offer')) { // Offer in URL, but no answer (we are the answerer)
      const now = Date.now();
      const offerParam = urlParams.get('offer');
      if (offerParam) {
        const offer = await decompress(offerParam);
        showCopyOverlay = true;
        initialOverlayShown = true;
        // currentOfferCid is not set here, as we are not the original offerer.
        
        let answererCid: string;
        answererCid = await webRTCApp.getAnswer(offer, async (candidate: RTCIceCandidateInit | null) => {
          if (Date.now() - now > 10 * 1000) { return; }
          const client = getDirectClient(answererCid);
          const sdp = client?.pc?.localDescription?.sdp;
          if (sdp) {
            const compressed = await compress(sdp);
            // Update URL for sharing the answer
            const answerUrlParams = new URLSearchParams(window.location.search); // Preserve original offer param
            answerUrlParams.set('answer', compressed);
            const newUrl = (globalConfig['config-host'] || window.location.origin) + window.location.pathname + '?' + answerUrlParams.toString();
            qrCodeUrl = newUrl;
            copyText = compressed; // Display only the answer
            // set current page url to new url
            history.replaceState('', '', newUrl); // Update URL without reloading the page
          }
        }, { sid: '' });
      }
    }
  };
  
  const serverWindowLoader: WindowLoader = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('r')) {
      showCopyButton = true;
      showAcceptButton = false;
      showJoinButton = false; // Or true, based on desired UX before room ID
      isDuringInitialServerLoad = true; // Mark that we are in initial server load phase
      socket.emit('init');
    } else {
      // const id = urlParams.get('r'); // Not strictly needed here
      onId();
      initialOverlayShown = true; // Set for initial load with existing room
      showCopyButton = false; // Show copy for existing room URL
      showAcceptButton = false;
      showJoinButton = true;
    }
  };
  
  function handleJoin() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('r');
    if (id) socket.emit('subscribe', id);
  }
  
  // Helper functions
  const onId = () => { // Callers manage initialOverlayShown
    showCopyOverlay = true;
    const urlParams = new URLSearchParams(window.location.search);
    const newUrl = ($configStore['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
    copyText = newUrl;
    qrCodeUrl = newUrl;
  };
  
  // Update acceptHandler signature to match the event detail type (cid can be null)
  const acceptHandler = async (cid: string | null, pasteValue: string) => { 
    if (!pasteValue || !cid) return; // Add check for null cid
    
    let data = pasteValue;
    const answer = await decompress(data.trim());
    // const app = webRTCApp.getApp(); // No longer needed for client access
    const client = getDirectClient(cid); // Get client from store
    console.log(client)
    client?.pc?.setRemoteDescription({
      type: "answer",
      sdp: answer.trim() + '\n'
    });
  };
  
  // Event handlers
  function toggleCopyOverlay() {
    showCopyOverlay = !showCopyOverlay;
  }
  
  function toggleConfigOverlay() {
    showConfigOverlay = !showConfigOverlay;
  }
  
  function handleHangup() {
    webRTCApp.destroy();
  }
  
  function handleReset() {
    webRTCApp.reset();
  }

  // Refactored function to prepare and display a client-side offer
  async function prepareOfferForClientModeDisplay(): Promise<{ offerCid: string | null, newCompressedOffer: string | null }> {
    const urlParams = new URLSearchParams(window.location.search);

    // Scenario 1: Offer previously generated by this instance, overlay was hidden, URL is clean. Restore its state.
    if (currentOfferCid && $connectionStore.directClients[currentOfferCid]?.connectionState === 'new') {
      showCopyOverlay = true;
      showAcceptButton = true;
      showPasteText = true;
      showCopyButton = true; // To copy the offer link
      showJoinButton = false;
      // copyText, qrCodeUrl are assumed to be set from the previous generation tied to currentOfferCid
      return { offerCid: currentOfferCid, newCompressedOffer: null };
    }

    // Scenario 2: Generate a new offer
    const now = Date.now();
    showAcceptButton = true;
    showPasteText = true;
    showCopyButton = true;
    showJoinButton = false;
    // currentOfferCid will be set with the new CID below.
    qrCodeUrl = ''; // Clear previous URL
    copyText = '';  // Clear previous text
    showCopyOverlay = true; // Show overlay while offer is being generated

    let newCid: string | null = null;
    let compressedOfferForReturn: string | null = null;

    newCid = await webRTCApp.getOffer(async (candidate: RTCIceCandidateInit | null) => {
      if (Date.now() - now > 10 * 1000) { return; } // Timeout for candidate gathering
      if (!newCid) return; // Ensure CID is available from the outer scope
      const client = getDirectClient(newCid);
      const sdp = client?.pc?.localDescription?.sdp;
      if (sdp) {
        const compressed = await compress(sdp);
        compressedOfferForReturn = compressed; // Capture for return
        // Create a URL for display purposes only, do not modify window.location here
        const displayUrlParams = new URLSearchParams();
        displayUrlParams.set('offer', compressed);
        const newUrlForOverlay = ($configStore['config-host'] || window.location.origin) + window.location.pathname + '?' + displayUrlParams.toString();
        qrCodeUrl = newUrlForOverlay;
        copyText = newUrlForOverlay;
        history.replaceState(null, '', newUrlForOverlay);
      }
    }, { sid: '' });
    
    currentOfferCid = newCid; // Store the newly generated CID
    return { offerCid: newCid, newCompressedOffer: compressedOfferForReturn };
  }

  async function handleOpenQrRequest() {
    const urlParams = new URLSearchParams(window.location.search);
    const configLoader = $configStore['config-loader'];
    initialOverlayShown = false; // Explicitly ensure not an initial overlay for QR clicks

    if (configLoader === 'server') {
      if (!urlParams.has('r')) {
        // Server mode, no room ID yet.
        // Show current state (likely no room ID in URL yet) and request/ensure room ID.
        onId(); // This will show the overlay with the current URL (no 'r').
        showJoinButton = false; // Or false, as no room to join yet.
        showCopyButton = true;
        showAcceptButton = false;
        showPasteText = false;
        if (!socket.connected) socket.connect();
        socket.emit('init'); // Request room ID. The 'init' handler updates URL & calls onId again.
                             // initialOverlayShown is managed by the 'init' handler for true initial loads.
      } else {
        // Server mode, room ID exists.
        onId(); // Sets showCopyOverlay, copyText, qrCodeUrl. initialOverlayShown remains false.
        showJoinButton = false;
        showCopyButton = true;
        showAcceptButton = false;
        showPasteText = false;
      }
    } else { // Client mode
      const offerInUrl = urlParams.get('offer');
      const answerInUrl = urlParams.get('answer');

      if (!offerInUrl && !answerInUrl) {
        // Client mode, no offer/answer in URL. Generate/display offer.
        await prepareOfferForClientModeDisplay(); // Sets showCopyOverlay. initialOverlayShown remains false.
      } else {
        // Client mode, offer or answer is in URL.
        onId(); // Sets showCopyOverlay, copyText, qrCodeUrl. initialOverlayShown remains false.
        showCopyButton = true;
        showAcceptButton = false;
        showPasteText = false;
        showJoinButton = false;
        // Handle the "Call started on another tab" message specifically
        if (copyText && copyText.startsWith('Call started on another tab')) {
          showCopyButton = false;
        }
      }
    }
  }

  // Reactive statement to hide copy overlay when any client connects,
  // but only if it was an initial overlay.
  $: {
    if (showCopyOverlay && initialOverlayShown) { 
      const clients = Object.values($connectionStore.directClients);
      const isAnyClientConnected = clients.some(
        client => client && client.connectionState === 'connected' && client.iceConnectionState === 'connected'
      );

      // TODO: fix for rejoins for client mode

      if (isAnyClientConnected) {
        console.log("A client connected while initial overlay was visible, hiding copy overlay.");
        showCopyOverlay = false;
        initialOverlayShown = false; // Reset flag so manual re-opening isn't auto-hidden
      }
    }
  }
</script>

<main class="flex-1 flex">
  <MediaArea hangup={handleHangup} openQr={handleOpenQrRequest} />
  <ControlPanel />
</main>

<CopyOverlay 
  show={showCopyOverlay} 
  copyText={copyText}
  qrCodeUrl={qrCodeUrl}
  cid={currentOfferCid}
  {showAcceptButton}
  {showJoinButton}
  {showCopyButton}
  {showPasteText}
  close={() => showCopyOverlay = false}
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

<!-- <ContextMenu /> -->

<div id="diffs" class="whitespace-pre-line hidden"></div>
