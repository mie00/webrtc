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
  import { connectionStore, getDirectClient } from './stores/connectionStore.js'; // Import store and getter
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
          urlParams.set('offer', compressed);
          const newUrl = ($configStore['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
          qrCodeUrl = newUrl;
          copyText = newUrl;
        }
      }, {sid: ''});
      currentOfferCid = cid; // Store the CID for the accept handler

      const bc = new BroadcastChannel("manual_rtc");
      // Removed: const app = webRTCApp.getApp();
      // Removed: app.bc = bc;
      bc.onmessage = async (event) => {
        console.log("got a new message from broadcast channel");
        const data = event.data;
        const answer = await decompress(data.trim());
        const client = getDirectClient(cid); // Get client from store
        client?.pc?.setRemoteDescription({
          type: "answer",
          sdp: answer.trim() + '\n'
        });
        bc.close(); // Close the channel after processing the message
      };
      // No need for DOM manipulation here since we're using Svelte events
      // The accept button click is handled by the on:accept event in the CopyOverlay component
      // We pass the currentOfferCid to CopyOverlay now.
    } else if (urlParams.get('answer')) {
      const bc = new BroadcastChannel("manual_rtc");
      const answer = urlParams.get('answer');
      if (answer) await bc.postMessage(answer);
      bc.close();
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
    console.log("MIEMIE", cid, pasteValue)
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
</script>

<main class="flex-1 flex">
  <MediaArea on:hangup={handleHangup} />
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
