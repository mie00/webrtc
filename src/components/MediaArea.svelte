<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { streamStore, updateStreamConfig, setViewLayout, type LayoutType } from '../stores/streamStore.js';
  import { setupLocalStream, destroyLocalStream, normalizeStreamId } from '../lib/streamBridge.js';
  import { startRecording, stopRecording } from '../lib/media/recorder.js';
  import { calculateStreamPositions } from '../lib/utils/streamLayout.js';
  import ContextMenu from './ContextMenu.svelte';
  import { updateConfig, getAllConfig } from '../stores/configStore.js';
  import StreamView from './StreamView.svelte';

  // Context menu state
  let showMenu = false;
  let menuPosition = { x: 0, y: 0 };
  let menuItems: string[] = [];
  let selectedButton: 'audio'|'video'|null = null;
  let audioButton: HTMLElement;
  let videoButton: HTMLElement;
  let instant = 0
  
  const dispatch = createEventDispatcher();
  
  // References to DOM elements
  let uploadVideo: HTMLInputElement;
  let videoNode: HTMLVideoElement;
  let refreshInterval: number;
  
  // Reactive button states
  $: isAudioEnabled = $streamStore.streamConfig.audio;
  $: isVideoEnabled = $streamStore.streamConfig.video;
  $: isScreenSharing = $streamStore.streamConfig.screen;
  $: isVideoShared = !!$streamStore.streamConfig.videoStream;
  $: isBlurEnabled = getAllConfig()['blur-video'] === 'yes';
  
  // Stream layout state
  $: currentLayout = $streamStore.activeView.layout;
  $: focusedStream = $streamStore.activeView.focusedStream;
  
  // Derived stream collections
  $: localStreams = Object.entries($streamStore.localStreams);
  $: remoteStreams = Object.entries($streamStore.remoteStreams).flatMap(([peerId, data]) => 
    Object.entries(data.streams).map(([streamId, stream]) => ({
      id: streamId,
      stream,
      peerId
    }))
  );
  
  // All active streams for display
  $: activeStreams = [
    ...localStreams.filter(([_, data]) => data.active).map(([id, data]) => ({
      id: normalizeStreamId(data.stream.id),
      streamKey: id,
      stream: data.stream,
      type: data.type,
      isLocal: true,
      peerId: null
    })),
    ...remoteStreams.map(({ id, stream, peerId }) => ({
      id: normalizeStreamId(stream.id),
      streamKey: id,
      stream,
      type: stream.getVideoTracks().length > 0 ? 'camera' : 'audio',
      isLocal: false,
      peerId
    }))
  ];
  
  // Stream positions
  let mediaContainerElement: HTMLElement;
  let streamPositions: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
  
  function updateStreamPositions() {
    if (!mediaContainerElement) return;
    
    const containerWidth = mediaContainerElement.clientWidth;
    const containerHeight = mediaContainerElement.clientHeight;
    
    streamPositions = calculateStreamPositions(
      containerWidth,
      containerHeight,
      currentLayout,
      focusedStream
    );
  }
  
  onMount(() => {
    // Set up interval for updating stream positions
    refreshInterval = window.setInterval(updateStreamPositions, 1000);
    
    // Add resize listener
    window.addEventListener('resize', updateStreamPositions);
    
    return () => {
      // Clean up on component destruction
      clearInterval(refreshInterval);
      window.removeEventListener('resize', updateStreamPositions);
    };
  });
  
  // Update positions when layout or streams change
  $: {
    currentLayout;
    focusedStream;
    activeStreams;
    updateStreamPositions();
  }
  
  // Event handlers
  function handleHangup() {
    dispatch('hangup');
  }
  
  async function handleToggleAudio() {
    const newValue = !$streamStore.streamConfig.audio;
    updateStreamConfig({ audio: newValue });
    if (newValue) {
      await setupLocalStream('audio', (arg) => instant = arg);
    } else {
      await destroyLocalStream('audio', (arg) => instant = arg);
    }
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
      await destroyLocalStream(selectedButton);
      updateConfig(`${selectedButton}-device`, `${device.groupId}|${device.deviceId}`);
      updateStreamConfig({ [selectedButton]: true });
      await setupLocalStream(selectedButton);
    }
  }

  async function handleToggleVideo() {
    const newValue = !$streamStore.streamConfig.video;
    updateStreamConfig({ video: newValue });
    if (newValue) {
      await setupLocalStream('video');
    } else {
      await destroyLocalStream('video');
    }
  }
  
  async function handleToggleBlur() {
    const newValue = isBlurEnabled ? 'no' : 'yes';
    isBlurEnabled = !isBlurEnabled;
    updateConfig('blur-video', newValue);
    
    // If video is already enabled, restart it to apply the blur effect
    if (isVideoEnabled) {
      // await destroyLocalStream('video');
      await setupLocalStream('video');
    }
  }
  
  async function handleToggleScreen() {
    const newValue = !$streamStore.streamConfig.screen;
    updateStreamConfig({ screen: newValue });
    if (newValue) {
      await setupLocalStream('screen');
    } else {
      await destroyLocalStream('screen');
    }
  }
  
  async function handleStartForward() {
    // Import the toggleForwardHandler from our bridge
    const { toggleForwardHandler } = await import('../lib/forwardBridge.js');
    await toggleForwardHandler();
  }
  
  function handleShareVideo() {
    // Trigger file upload dialog
    if (uploadVideo.files && uploadVideo.files.length > 0) {
      uploadVideo.files = null;
      destroyLocalStream('local');
    } else {
      uploadVideo?.click();
    }
  }
  
  let isRecording = false;
  
  async function handleRecord() {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
    isRecording = !!isRecording;
  }
  
  function handleOpenQr() {
    dispatch('openQr');
  }
  
  async function handleVideoUpload(event: Event) {
    if (uploadVideo.files && uploadVideo.files.length > 0) {
      const file = uploadVideo.files[0];
      const fileURL = URL.createObjectURL(file);

      videoNode.src = fileURL;
      videoNode.autoplay = true;
      videoNode.controls = false;
      videoNode.loop = true;
    }
  }

  async function handleFilePlay(event: Event) {
    videoNode.play();
    const videoStream = (videoNode as any).captureStream ? 
      (videoNode as any).captureStream() : 
      (videoNode as any).mozCaptureStream();

    updateStreamConfig({
      videoNode,
      videoStream,
      local: true
    });

    await setupLocalStream('local');
  }

  function handleChangeLayout(layout: LayoutType) {
    setViewLayout(layout);
  }

  function handleFocusStream(event: CustomEvent) {
    const { streamId } = event.detail;
    setViewLayout('focus', streamId);
  }
</script>

<div id="media" bind:this={mediaContainerElement} class="w-full w-svw h-svh relative bg-black" style="width: 100svw; height: 100svh;">
  <!-- Hidden video element for file uploads -->
  
  <!-- Unified stream rendering using calculated positions -->
  {#each activeStreams as stream (stream.id)}
    {#if streamPositions.find(pos => pos.id === stream.id)}
      {@const position = streamPositions.find(pos => pos.id === stream.id)}
      <div class="stream-container absolute"
           id={stream.isLocal ? `test-local-video-${stream.streamKey}` : `test-remote-video-${stream.peerId}-${stream.id}`}
           style="left: {position?.x}px; top: {position?.y}px; width: {position?.width}px; height: {position?.height}px;">
        <StreamView
          stream={stream.stream}
          type={stream.stream.getVideoTracks().length > 0 ? 'video' : 'audio'}
          muted={stream.isLocal && stream.type !== 'file'} 
          mirrored={stream.isLocal && stream.type === 'camera'} 
          peerId={stream.peerId}
          on:focus={handleFocusStream}
        />
      </div>
    {/if}
  {/each}
</div>

<div class="fixed bottom-0 left-0 right-0 bg-transparent p-4 flex justify-center space-x-0 lg:space-x-4 pointer-events-none">
  <!-- Layout controls -->
  <div class="layout-controls pointer-events-auto flex mr-4">
    <button id="test-layout-grid-button" on:click={() => handleChangeLayout('grid')} class="p-2 rounded-l-full {currentLayout === 'grid' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Grid
    </button>
    <button id="test-layout-focus-button" on:click={() => handleChangeLayout('focus')} class="p-2 {currentLayout === 'focus' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Focus
    </button>
    <button id="test-layout-present-button" on:click={() => handleChangeLayout('presentation')} class="p-2 rounded-r-full {currentLayout === 'presentation' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Present
    </button>
  </div>

  <button id="test-open-qr-button" on:click={handleOpenQr} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    ▩ <!-- QR Code -->
  </button>
  <button id="test-toggle-audio-button" bind:this={audioButton} on:click={handleToggleAudio} on:contextmenu={e => handleContextMenu('audio', e)} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isAudioEnabled} style={isAudioEnabled?`background: linear-gradient(0deg, rgb(59 130 246) ${instant}%, white ${instant}%)`:""}>
    {isAudioEnabled ? '🎤' : '🔇'} <!-- Microphone -->
  </button>
  <button id="test-toggle-video-button" bind:this={videoButton} on:click={handleToggleVideo} on:contextmenu={e => handleContextMenu('video', e)} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isVideoEnabled}>
    {isVideoEnabled ? '🎥' : '📷'} <!-- Video Camera -->
  </button>
  <button id="test-toggle-blur-button" on:click={handleToggleBlur} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isBlurEnabled}>
    🌫️ <!-- Blur effect -->
  </button>
  <button id="test-toggle-screen-button" on:click={handleToggleScreen} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isScreenSharing}>
    🖥️ <!-- Monitor for Share Screen -->
  </button>
  <button id="test-start-forward-button" on:click={handleStartForward} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    ⏩ <!-- Forward -->
  </button>
  <button id="test-share-video-button" on:click={handleShareVideo} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isVideoShared}>
    📹 <!-- Share Video -->
  </button>
  <button id="test-record-button" on:click={handleRecord} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-red-600={isRecording}>
    {isRecording ? '⏹' : '⏺'}
  </button>
  <button id="test-hangup-button" on:click={handleHangup} class="hover:bg-red-600 bg-red-500 text-white p-3 rounded-full pointer-events-auto">
    📞
  </button>
  <video on:loadeddata={handleFilePlay} muted bind:this={videoNode} autoplay loop class="hidden"></video>
  <input bind:this={uploadVideo} type="file" on:change={handleVideoUpload} accept="video/*" class="hidden">
</div>

{#if showMenu}
<ContextMenu
  {menuItems}
  position={menuPosition}
  cb={handleContextSelect}
  hide={() => showMenu = false}
/>
{/if}

<style>
  .stream-container {
    overflow: hidden;
    border-radius: 8px;
    transition: all 0.3s ease;
    padding: 4px;
  }
</style>
