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
  
  // Window loader function type
  type WindowLoader = () => Promise<void>;
  
  onMount(() => {
    // Initialize socket connection
    socket = io('ws://127.0.0.1:5001');
    
    // Setup socket event handlers
    setupSocketHandlers();
    
    // Setup window event handlers
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('r')) {
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
      onId();
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
  
  const clientWindowLoader: WindowLoader = async () => { // Add type annotation
    const globalConfig = getAllConfig(); // Get global config
    console.log("client window loader");
    const urlParams = new URLSearchParams(window.location.search);
    let localCompressedOffer: string | null = null; // Variable to store the offer this tab generated

    if (!urlParams.get('offer')) {
      const now = Date.now();
      showCopyOverlay = true;
      showAcceptButton = true;
      showPasteText = true;
      
      let cid: string; // Add type for cid
      cid = await webRTCApp.getOffer(async (candidate: RTCIceCandidateInit | null) => { // Add type for candidate
        if (Date.now() - now > 10 * 1000) { return; }
        const app = webRTCApp.getApp(); // No longer needed for client access
        const client = getDirectClient(cid); // Get client from store
        const sdp = client?.pc?.localDescription?.sdp;
        if (sdp) {
          const compressed = await compress(sdp);
          localCompressedOffer = compressed; // Store the compressed offer locally
          urlParams.set('offer', compressed);
          const newUrl = ($configStore['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
          qrCodeUrl = newUrl;
          copyText = newUrl;
        }
      }, {sid: ''});
      currentOfferCid = cid; // Store the CID for the accept handler

      const bc = new BroadcastChannel("manual_rtc");
      bc.onmessage = async (event) => {
        const data = event.data;
        // Check if data is structured as expected and if the offer matches the one we generated
        if (typeof data === 'object' && data !== null && data.offer && data.answer && data.offer === localCompressedOffer) {
            console.log("Received matching answer via broadcast channel for offer:", data.offer);
            const answer = await decompress(data.answer.trim());
            const client = getDirectClient(cid); // Get client from store
            if (client?.pc) {
                try {
                    await client.pc.setRemoteDescription({
                        type: "answer",
                        sdp: answer.trim() + '\n'
                    });
                    console.log("Successfully set remote description from broadcast answer.");
                    bc.close(); // Close the channel ONLY after successful processing
                } catch (e) {
                    console.error("Error setting remote description from broadcast answer:", e);
                    // Keep channel open on error
                }
            } else {
                console.warn("Client or PeerConnection not found when processing broadcast answer.");
                // Keep channel open
            }
        } else {
            console.warn("Received broadcast message with non-matching offer or invalid format. Ignoring.", { receivedData: data, expectedOffer: localCompressedOffer });
            // Keep channel open and listening for the correct message
        }
      };
      // No need for DOM manipulation here since we're using Svelte events
      // The accept button click is handled by the on:accept event in the CopyOverlay component
      // We pass the currentOfferCid to CopyOverlay now.
    } else if (urlParams.get('answer')) {
      const answerParam = urlParams.get('answer');
      const offerParamForAnswer = urlParams.get('offer'); // Get the offer this answer corresponds to
      if (answerParam && offerParamForAnswer) {
          const bc = new BroadcastChannel("manual_rtc"); // Create locally
          // Send an object containing both the offer and the answer
          await bc.postMessage({ offer: offerParamForAnswer, answer: answerParam });
          bc.close(); // Close immediately after posting
      }
      // Removed redundant bc.close() from here
      showCopyOverlay = true;
      // Instead of manipulating the DOM directly, we'll use a variable to control the content
      copyText = 'Call started on another tab, please close this one';
      showCopyButton = false;
      showAcceptButton = false;
      showPasteText = false;
      showJoinButton = false;
    } else {
      const now = Date.now();
      const offerParam = urlParams.get('offer');
      if (offerParam) {
        const offer = await decompress(offerParam);
        showCopyOverlay = true;
        
        let cid: string; // Add type for cid
        cid = await webRTCApp.getAnswer(offer, async (candidate: RTCIceCandidateInit | null) => { // Add type for candidate
          if (Date.now() - now > 10 * 1000) { return; }
          // const app = webRTCApp.getApp(); // No longer needed for client access
          const client = getDirectClient(cid); // Get client from store
          const sdp = client?.pc?.localDescription?.sdp;
          if (sdp) {
            const compressed = await compress(sdp);
            urlParams.set('answer', compressed);
            const newUrl = (globalConfig['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
            qrCodeUrl = newUrl;
            copyText = compressed;
          }
        }, {sid: ''});
      }
    }
  };
  
  const serverWindowLoader: WindowLoader = async () => { // Add type annotation
    const urlParams = new URLSearchParams(window.location.search);
    
    if (!urlParams.has('r')) {
      showCopyButton = true;
      showAcceptButton = false;
      showJoinButton = false;
      socket.emit('init');
    } else {
      const id = urlParams.get('r');
      onId();
      showCopyButton = false;
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
  const onId = () => {
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

  async function ensureOfferGeneratedAndDisplayed() {
    // This function handles generating a new client-side offer and setting up the overlay for it.
    // It's called when in client mode and no offer/answer is in the URL.

    const urlParams = new URLSearchParams(window.location.search);
    // Check if an offer was already generated by this client instance in a previous interaction
    // and the overlay was just hidden. currentOfferCid would be set, and copyText/qrCodeUrl would hold the offer.
    // This logic assumes that if currentOfferCid is set, copyText/qrCodeUrl are also appropriately set from that offer.
    if (currentOfferCid && !urlParams.get('offer') && !urlParams.get('answer')) {
      // Offer was previously generated by this instance, overlay was hidden. Restore its state.
      showCopyOverlay = true;
      showAcceptButton = true;
      showPasteText = true;
      showCopyButton = true; // To copy the offer link
      showJoinButton = false;
      // copyText, qrCodeUrl, and currentOfferCid should still hold values from the previous generation.
      return;
    }

    // If no currentOfferCid from a previous same-page generation, or if URL state is different,
    // proceed to generate a new offer.
    const now = Date.now();
    showAcceptButton = true;
    showPasteText = true;
    showCopyButton = true;
    showJoinButton = false;
    currentOfferCid = null; // Reset before generating a new one
    qrCodeUrl = ''; // Clear previous URL
    copyText = '';  // Clear previous text

    showCopyOverlay = true; // Show overlay while offer is being generated

    let cid: string;
    cid = await webRTCApp.getOffer(async (candidate: RTCIceCandidateInit | null) => {
      if (Date.now() - now > 10 * 1000) { return; } // Timeout for candidate gathering
      const client = getDirectClient(cid);
      const sdp = client?.pc?.localDescription?.sdp;
      if (sdp) {
        const compressed = await compress(sdp);
        // Create a URL for display purposes only, do not modify window.location here
        const displayUrlParams = new URLSearchParams();
        displayUrlParams.set('offer', compressed);
        const newUrl = ($configStore['config-host'] || window.location.origin) + window.location.pathname + '?' + displayUrlParams.toString();
        qrCodeUrl = newUrl;
        copyText = newUrl;
      }
    }, {sid: ''});
    currentOfferCid = cid;
  }

  async function handleOpenQrRequest() {
    const urlParams = new URLSearchParams(window.location.search);
    const configLoader = $configStore['config-loader'];

    if (configLoader === 'server') {
      if (!urlParams.has('r')) {
        // Server mode, no room ID yet. Initiate room creation.
        // The 'init' socket event will call onId(), which handles overlay visibility and content.
        // Set button states here in anticipation of onId() being called.
        showJoinButton = true;
        showCopyButton = true;
        showAcceptButton = false;
        showPasteText = false;
        socket.emit('init');
      } else {
        // Server mode, room ID exists.
        onId(); // Sets showCopyOverlay, copyText, qrCodeUrl.
        showJoinButton = true;
        showCopyButton = true;
        showAcceptButton = false;
        showPasteText = false;
      }
    } else { // Client mode
      const offerInUrl = urlParams.get('offer');
      const answerInUrl = urlParams.get('answer');

      if (!offerInUrl && !answerInUrl) {
        // Client mode, no offer/answer in URL. Generate new offer.
        await ensureOfferGeneratedAndDisplayed();
      } else {
        // Client mode, offer or answer is in URL.
        onId(); // Sets showCopyOverlay, copyText, qrCodeUrl using the existing URL.
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

  // Reactive statement to hide copy overlay when any client connects
  $: {
    if (showCopyOverlay) { // Only proceed if the overlay is currently shown
      const clients = Object.values($connectionStore.directClients);
      const isAnyClientConnected = clients.some(
        client => client && client.connectionState === 'connected' && client.iceConnectionState === 'connected'
      );

      if (isAnyClientConnected) {
        console.log("A client connected, hiding copy overlay.");
        showCopyOverlay = false;
      }
    }
  }
</script>

<main class="flex-1 flex">
  <MediaArea on:hangup={handleHangup} on:openQr={handleOpenQrRequest} />
  <ControlPanel on:toggleConfig={toggleConfigOverlay} />
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
  on:close={() => showCopyOverlay = false}
  on:openConfig={toggleConfigOverlay}
  on:reset={handleReset}
  on:accept={(e) => acceptHandler(e.detail.cid, e.detail.pasteValue)} 
  on:join={handleJoin}
/>

<ConfigOverlay 
  show={showConfigOverlay} 
  on:close={() => showConfigOverlay = false}
  on:configUpdated={handleReset}
/>

<!-- <ContextMenu /> -->

<div id="diffs" class="whitespace-pre-line hidden"></div>
