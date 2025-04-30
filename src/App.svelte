<script lang="ts">
  import { onMount } from 'svelte';
  import MediaArea from './components/MediaArea.svelte';
  import ControlPanel from './components/ControlPanel.svelte';
  import CopyOverlay from './components/CopyOverlay.svelte';
  import ConfigOverlay from './components/ConfigOverlay.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import { getConfig } from '../js/config.js';
  import { compress, decompress } from '../js/sdpcompress.js';
  
  // Props
  export let webRTCApp;
  
  // State
  let showCopyOverlay = false;
  let showConfigOverlay = false;
  let copyText = '';
  let qrCodeUrl = '';
  let showAcceptButton = false;
  let showJoinButton = false;
  let showCopyButton = true;
  let showPasteText = false;
  
  // Socket.io connection
  let socket;
  
  onMount(() => {
    // Initialize socket connection
    socket = io('ws://127.0.0.1:5000');
    
    // Setup socket event handlers
    setupSocketHandlers();
    
    // Setup window event handlers
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('r')) {
      windowLoader = serverWindowLoader;
    } else if (urlParams.has('offer')) {
      windowLoader = clientWindowLoader;
    } else if (getConfig()['config-loader'] === 'client') {
      windowLoader = clientWindowLoader;
    } else {
      windowLoader = serverWindowLoader;
    }
    
    // Run the appropriate loader
    windowLoader();
    
    return () => {
      // Cleanup on component unmount
      if (socket) {
        socket.disconnect();
      }
    };
  });
  
  // Socket event handlers
  function setupSocketHandlers() {
    socket.on('init', async (id) => {
      console.log("init", id);
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('r', id);
      history.replaceState(null, '', '?' + urlParams.toString());
      onId();
    });
    
    socket.on('subscribed', async (sid) => {
      console.log('got subscribed', sid);
      const cid = await webRTCApp.getOffer(async (candidate) => {
        if (!candidate) return;
        console.log("got a candidate", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
      }, {sid});
      const app = webRTCApp.getApp();
      const sdp = app.clients[cid].pc?.localDescription?.sdp;
      if (sdp) {
        console.log("sending an offer", sid, sdp);
        socket.emit('offer', sid, sdp);
      }
    });
    
    socket.on('answer', async (sid, sdp) => {
      console.log('got an answer', sid, sdp);
      const app = webRTCApp.getApp();
      if (app.sids && app.sids[sid] && app.clients[app.sids[sid]]) {
        app.clients[app.sids[sid]].pc?.setRemoteDescription({
          type: "answer",
          sdp: sdp.trim() + '\n'
        });
      }
    });
    
    socket.on('offer', async (sid, sdp) => {
      console.log('got an offer', sid, sdp);
      const cid = await webRTCApp.getAnswer(sdp, async (candidate) => {
        if (!candidate) return;
        console.log("got a candidate", sid, candidate);
        socket.emit('candidate', sid, JSON.stringify(candidate));
      }, {sid});
      const app = webRTCApp.getApp();
      const asdp = app.clients[cid].pc?.localDescription?.sdp;
      if (asdp) {
        console.log("sending an answer", sid, asdp);
        socket.emit('answer', sid, asdp);
      }
    });
    
    socket.on('error', async () => {
      history.replaceState(null, '', window.location.origin + window.location.pathname);
      const app = webRTCApp.getApp();
      if (app.config['config-loader'] === 'client') {
        windowLoader = clientWindowLoader;
      }
      windowLoader();
    });
    
    socket.on('candidate', async (sid, candidate) => {
      console.log('got a candidate from peer', sid, candidate);
      const app = webRTCApp.getApp();
      if (app.sids && app.sids[sid] && app.clients[app.sids[sid]]) {
        app.clients[app.sids[sid]].pc?.addIceCandidate(JSON.parse(candidate));
      }
    });
  }
  
  // Window loaders
  let windowLoader;
  
  const clientWindowLoader = async () => {
    console.log("client window loader");
    const urlParams = new URLSearchParams(window.location.search);
    
    if (!urlParams.get('offer')) {
      const now = Date.now();
      showCopyOverlay = true;
      showAcceptButton = true;
      showPasteText = true;
      
      let cid;
      cid = await webRTCApp.getOffer(async (candidate) => {
        if (Date.now() - now > 10 * 1000) { return; }
        const app = webRTCApp.getApp();
        const sdp = app.clients[cid].pc?.localDescription?.sdp;
        if (sdp) {
          const compressed = await compress(sdp);
          urlParams.set('offer', compressed);
          const newUrl = (app.config['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
          qrCodeUrl = newUrl;
          copyText = newUrl;
        }
      }, {sid: ''});
      
      const bc = new BroadcastChannel("manual_rtc");
      const app = webRTCApp.getApp();
      app.bc = bc;
      bc.onmessage = async (event) => {
        let data = event.data;
        const answer = await decompress(data.trim());
        app.clients[cid].pc?.setRemoteDescription({
          type: "answer",
          sdp: answer.trim() + '\n'
        });
      };
      
      const acceptButton = document.getElementById("accept-button");
      if (acceptButton) {
        acceptButton.addEventListener("click", () => acceptHandler(cid));
      }
    } else if (urlParams.get('answer')) {
      const bc = new BroadcastChannel("manual_rtc");
      const answer = urlParams.get('answer');
      if (answer) await bc.postMessage(answer);
      bc.close();
      showCopyOverlay = true;
      const copyOverlayElement = document.getElementById('copy-overlay');
      if (copyOverlayElement) {
        copyOverlayElement.innerHTML = '<p class="bg-white p-4 rounded-md shadow-md text-center">call started on another tab, please close this one</p>';
      }
    } else {
      const now = Date.now();
      const offerParam = urlParams.get('offer');
      if (offerParam) {
        const offer = await decompress(offerParam);
        const link = document.getElementById('copy-text') as HTMLInputElement;
        showCopyOverlay = true;
        const btn = document.getElementById("copy-button");
        
        let cid;
        cid = await webRTCApp.getAnswer(offer, async (candidate) => {
          if (Date.now() - now > 10 * 1000) { return; }
          const app = webRTCApp.getApp();
          const sdp = app.clients[cid].pc?.localDescription?.sdp;
          if (sdp) {
            const compressed = await compress(sdp);
            urlParams.set('answer', compressed);
            const newUrl = (app.config['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
            qrCodeUrl = newUrl;
            copyText = compressed;
          }
        }, {sid: ''});
      }
    }
  };
  
  const serverWindowLoader = async () => {
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
    const app = webRTCApp.getApp();
    const newUrl = (app.config['config-host'] || window.location.origin) + window.location.pathname + '?' + urlParams.toString();
    copyText = newUrl;
    qrCodeUrl = newUrl;
  };
  
  const acceptHandler = async (cid, pasteValue) => {
    if (!pasteValue) return;
    
    let data = pasteValue;
    const answer = await decompress(data.trim());
    const app = webRTCApp.getApp();
    app.clients[cid].pc?.setRemoteDescription({
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
  <MediaArea {webRTCApp} on:hangup={handleHangup} />
  <ControlPanel {webRTCApp} on:toggleConfig={toggleConfigOverlay} />
</main>

<CopyOverlay 
  show={showCopyOverlay} 
  copyText={copyText}
  qrCodeUrl={qrCodeUrl}
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
/>

<ContextMenu />

<div id="diffs" class="whitespace-pre-line hidden"></div>
