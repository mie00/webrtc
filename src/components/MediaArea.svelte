<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { streamStore, updateStreamConfig } from '../stores/streamStore';
  import { setupLocalStream, refreshStreamViews } from '../lib/streamBridge';
  import { startRecording, stopRecording } from '../lib/media/recorder';
  import ContextMenu from './ContextMenu.svelte';
  import { setConfig } from '../stores/configStore';
  
  // Context menu state
  let showMenu = false;
  let menuPosition = { x: 0, y: 0 };
  let menuItems: string[] = [];
  let selectedButton: 'audio'|'video'|null = null;
  let audioButton: HTMLElement;
  let videoButton: HTMLElement;
  
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

  async function handleContextMenu(type: 'audio'|'video', event: MouseEvent) {
    event.preventDefault();
    selectedButton = type;
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const filtered = devices.filter(device => device.kind === `${type}input`);
    
    if (filtered.length === 0) {
      alert(`No ${type} devices found`);
      return;
    }

    menuItems = filtered.map(d => d.label);
    menuPosition = { x: event.pageX, y: event.pageY };
    showMenu = true;
  }

  async function handleContextSelect(item: string) {
    showMenu = false;
    if (!selectedButton) return;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const device = devices.find(d => d.label === item && d.kind === `${selectedButton}input`);
    
    if (device) {
      setConfig(`${selectedButton}-device`, `${device.groupId}|${device.deviceId}`);
      updateStreamConfig({ [selectedButton]: true });
      await setupLocalStream(selectedButton);
      
      // Update button state
      if (selectedButton === 'audio') {
        audioButton.classList.toggle('bg-blue-600', true);
      } else {
        videoButton.classList.toggle('bg-blue-600', true);
      }
    }
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
  
  let isRecording = false;
  
  async function handleRecord() {
    if (window.app.recorder) {
      stopRecording();
    } else {
      await startRecording();
    }
    isRecording = !!window.app.recorder;
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
  <button bind:this={audioButton} on:click={handleToggleAudio} on:contextmenu={e => handleContextMenu('audio', e)} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isAudioEnabled}>
    {isAudioEnabled ? '🎤' : '🔇'} <!-- Microphone -->
  </button>
  <button bind:this={videoButton} on:click={handleToggleVideo} on:contextmenu={e => handleContextMenu('video', e)} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isVideoEnabled}>
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
  <button on:click={handleRecord} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-red-600={isRecording}>
    {isRecording ? '⏹' : '⏺'}
  </button>
  <button on:click={handleHangup} class="hover:bg-red-600 bg-red-500 text-white p-3 rounded-full pointer-events-auto">
    📞
  </button>
  <input bind:this={uploadVideo} type="file" on:change={handleVideoUpload} accept="video/*" class="hidden">
</div>

<ContextMenu
  {menuItems}
  position={menuPosition}
  cb={handleContextSelect}
  hide={() => showMenu = false}
/>
