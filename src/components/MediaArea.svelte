<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { streamStore, updateStreamConfig } from '../stores/streamStore';
  import { setupLocalStream, refreshStreamViews } from '../lib/streamBridge';
  
  // Props
  export let webRTCApp;
  
  const dispatch = createEventDispatcher();
  
  // References to DOM elements
  let mediaContainer: HTMLElement;
  let uploadVideo: HTMLInputElement;
  let videoNode: HTMLVideoElement;
  let refreshInterval: number;
  
  // Reactive button states
  $: isAudioEnabled = $streamStore.streamConfig.audio;
  $: isVideoEnabled = $streamStore.streamConfig.video;
  $: isScreenSharing = $streamStore.streamConfig.screen;
  $: isVideoShared = !!$streamStore.streamConfig.videoStream;
  
  onMount(() => {
    // Set up interval for refreshing stream views
    refreshInterval = window.setInterval(refreshStreamViews, 1000);
    
    // Add resize listener
    window.addEventListener('resize', refreshStreamViews);
    
    return () => {
      // Clean up on component destruction
      clearInterval(refreshInterval);
      window.removeEventListener('resize', refreshStreamViews);
    };
  });
  
  // Event handlers
  function handleHangup() {
    dispatch('hangup');
  }
  
  async function handleToggleAudio() {
    const newValue = !$streamStore.streamConfig.audio;
    updateStreamConfig({ audio: newValue });
    await setupLocalStream('audio');
  }
  
  async function handleToggleVideo() {
    const newValue = !$streamStore.streamConfig.video;
    updateStreamConfig({ video: newValue });
    await setupLocalStream('video');
  }
  
  async function handleToggleScreen() {
    const newValue = !$streamStore.streamConfig.screen;
    updateStreamConfig({ screen: newValue });
    await setupLocalStream('screen');
  }
  
  async function handleStartForward() {
    // Import the toggleForwardHandler from our bridge
    const { toggleForwardHandler } = await import('../lib/forwardBridge');
    await toggleForwardHandler();
  }
  
  function handleShareVideo() {
    // Trigger file upload dialog
    uploadVideo?.click();
  }
  
  function handleRecord() {
    // Record implementation
    // Implementation depends on your existing code
  }
  
  function handleOpenQr() {
    dispatch('openQr');
  }
  
  async function handleVideoUpload(event: Event) {
    const files = (event.target as HTMLInputElement)?.files;
    if (files && files.length > 0) {
      const file = files[0];
      const fileURL = URL.createObjectURL(file);
      
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
      
      await setupLocalStream('local');
    }
  }
</script>

<div id="media" bind:this={mediaContainer} class="w-full w-svw h-svh relative bg-black" style="width: 100svw; height: 100svh;">
  <!-- Placeholder for video streams -->
  <!-- Streams will be dynamically added here -->
  <video bind:this={videoNode} autoplay loop class="hidden" />
</div>

<div class="fixed bottom-0 left-0 right-0 bg-transparent p-4 flex justify-center space-x-0 lg:space-x-4 pointer-events-none">
  <button on:click={handleOpenQr} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    ▩ <!-- QR Code -->
  </button>
  <button on:click={handleToggleAudio} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isAudioEnabled}>
    {isAudioEnabled ? '🎤' : '🔇'} <!-- Microphone -->
  </button>
  <button on:click={handleToggleVideo} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isVideoEnabled}>
    {isVideoEnabled ? '🎥' : '📷'} <!-- Video Camera -->
  </button>
  <button on:click={handleToggleScreen} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isScreenSharing}>
    🖥️ <!-- Monitor for Share Screen -->
  </button>
  <button on:click={handleStartForward} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    ⏩ <!-- Forward -->
  </button>
  <button on:click={handleShareVideo} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isVideoShared}>
    📹 <!-- Share Video -->
  </button>
  <button on:click={handleRecord} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    ⏺
  </button>
  <button on:click={handleHangup} class="hover:bg-red-600 bg-red-500 text-white p-3 rounded-full pointer-events-auto">
    📞
  </button>
  <input bind:this={uploadVideo} type="file" on:change={handleVideoUpload} accept="video/*" class="hidden">
</div>
