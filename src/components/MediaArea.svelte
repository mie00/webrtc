<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { streamStore, updateStreamConfig } from '../stores/streamStore';
  import { setupLocalStream, refreshStreamViews, setButton } from '../lib/streamBridge';
  
  // Props
  export let webRTCApp;
  
  const dispatch = createEventDispatcher();
  
  // References to DOM elements
  let mediaContainer: HTMLElement;
  let refreshInterval: number;
  
  onMount(() => {
    // Set up interval for refreshing stream views
    refreshInterval = window.setInterval(refreshStreamViews, 1000);
    
    // Initialize media area
    const uploadVideo = document.getElementById('upload-video');
    if (uploadVideo) {
      uploadVideo.addEventListener('change', handleVideoUpload);
    }
    
    // Add resize listener
    window.addEventListener('resize', refreshStreamViews);
    
    return () => {
      // Clean up on component destruction
      clearInterval(refreshInterval);
      window.removeEventListener('resize', refreshStreamViews);
      
      if (uploadVideo) {
        uploadVideo.removeEventListener('change', handleVideoUpload);
      }
    };
  });
  
  // Event handlers
  function handleHangup() {
    dispatch('hangup');
  }
  
  async function handleToggleAudio() {
    const newValue = !$streamStore.streamConfig.audio;
    updateStreamConfig({ audio: newValue });
    
    const toggleAudioBtn = document.getElementById('toggle-audio');
    if (toggleAudioBtn) {
      setButton(toggleAudioBtn, newValue);
    }
    
    await setupLocalStream('audio');
  }
  
  async function handleToggleVideo() {
    const newValue = !$streamStore.streamConfig.video;
    updateStreamConfig({ video: newValue });
    
    const toggleVideoBtn = document.getElementById('toggle-video');
    if (toggleVideoBtn) {
      setButton(toggleVideoBtn, newValue);
    }
    
    await setupLocalStream('video');
  }
  
  async function handleToggleScreen() {
    const newValue = !$streamStore.streamConfig.screen;
    updateStreamConfig({ screen: newValue });
    
    const toggleScreenBtn = document.getElementById('toggle-screen');
    if (toggleScreenBtn) {
      setButton(toggleScreenBtn, newValue);
    }
    
    await setupLocalStream('screen');
  }
  
  async function handleStartForward() {
    // Import the toggleForwardHandler from our bridge
    const { toggleForwardHandler } = await import('../lib/forwardBridge');
    await toggleForwardHandler();
  }
  
  function handleShareVideo() {
    // Trigger file upload dialog
    document.getElementById('upload-video')?.click();
  }
  
  function handleRecord() {
    // Record implementation
    // Implementation depends on your existing code
  }
  
  function handleOpenQr() {
    dispatch('openQr');
  }
  
  async function handleVideoUpload(event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      const fileURL = URL.createObjectURL(file);
      
      const videoNode = document.createElement('video');
      videoNode.src = fileURL;
      videoNode.autoplay = true;
      videoNode.controls = false;
      videoNode.loop = true;
      
      const videoStream = videoNode.captureStream ? 
        videoNode.captureStream() : 
        (videoNode as any).mozCaptureStream();
      
      updateStreamConfig({
        videoNode,
        videoStream,
        local: true
      });
      
      const shareVideoBtn = document.getElementById('share-video');
      if (shareVideoBtn) {
        setButton(shareVideoBtn, true);
      }
      
      await setupLocalStream('local');
    }
  }
</script>

<div id="media" class="w-full w-svw h-svh relative bg-black" style="width: 100svw; height: 100svh;">
  <!-- Placeholder for video streams -->
  <!-- Streams will be dynamically added here -->
</div>

<div class="fixed bottom-0 left-0 right-0 bg-transparent p-4 flex justify-center space-x-0 lg:space-x-4 pointer-events-none">
  <button id="open-qr" on:click={handleOpenQr} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    ▩ <!-- QR Code -->
  </button>
  <button id="toggle-audio" on:click={handleToggleAudio} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    🎤 <!-- Microphone -->
  </button>
  <button id="toggle-video" on:click={handleToggleVideo} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    🎥 <!-- Video Camera -->
  </button>
  <button id="toggle-screen" on:click={handleToggleScreen} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    🖥️ <!-- Monitor for Share Screen -->
  </button>
  <button id="start-forward" on:click={handleStartForward} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    ⏩ <!-- Forward -->
  </button>
  <button id="share-video" on:click={handleShareVideo} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    📹 <!-- Share Video -->
  </button>
  <button id="record" on:click={handleRecord} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    ⏺
  </button>
  <button id="hangup" on:click={handleHangup} class="hover:bg-red-600 bg-red-500 text-white p-3 rounded-full pointer-events-auto">
    📞
  </button>
  <input type="file" id="upload-video" accept="video/*" class="hidden">
</div>
