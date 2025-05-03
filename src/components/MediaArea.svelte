<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { streamStore, updateStreamConfig, setViewLayout, type LayoutType } from '../stores/streamStore';
  import { setupLocalStream, destroyLocalStream, refreshStreamViews } from '../lib/streamBridge';
  import { startRecording, stopRecording } from '../lib/media/recorder';
  import ContextMenu from './ContextMenu.svelte';
  import { updateConfig, getAllConfig } from '../stores/configStore';
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
      id,
      stream: data.stream,
      type: data.type,
      isLocal: true,
      peerId: null
    })),
    ...remoteStreams.map(({ id, stream, peerId }) => ({
      id,
      stream,
      type: stream.getVideoTracks().length > 0 ? 'camera' : 'audio',
      isLocal: false,
      peerId
    }))
  ];
  
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
      updateConfig(`${selectedButton}-device`, `${device.groupId}|${device.deviceId}`);
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
    if (newValue) {
      await setupLocalStream('video');
    } else {
      await destroyLocalStream('video');
    }
  }
  
  async function handleToggleBlur() {
    const newValue = isBlurEnabled ? 'no' : 'yes';
    updateConfig('blur-video', newValue);
    
    // If video is already enabled, restart it to apply the blur effect
    if (isVideoEnabled) {
      await destroyLocalStream('video');
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
    const { toggleForwardHandler } = await import('../lib/forwardBridge');
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
  
  function handleChangeLayout(layout: LayoutType) {
    setViewLayout(layout);
  }
  
  function handleFocusStream(event: CustomEvent) {
    const { streamId } = event.detail;
    setViewLayout('focus', streamId);
  }
</script>

<div id="media" class="w-full w-svw h-svh relative bg-black" style="width: 100svw; height: 100svh;">
  <!-- Hidden video element for file uploads -->
  
  <!-- Dynamic stream rendering based on layout -->
  {#if currentLayout === 'grid'}
    <div class="stream-grid">
      {#each activeStreams as stream (stream.id)}
        <div class="stream-container">
          <StreamView 
            stream={stream.stream} 
            type={stream.stream.getVideoTracks().length > 0 ? 'video' : 'audio'} 
            muted={stream.isLocal && stream.type != 'file'} 
            mirrored={stream.isLocal && stream.type === 'camera'} 
            peerId={stream.peerId}
            on:focus={handleFocusStream}
          />
        </div>
      {/each}
    </div>
  {:else if currentLayout === 'focus' && focusedStream}
    <div class="focus-layout">
      <!-- Main focused stream -->
      {#each activeStreams.filter(s => s.id === focusedStream) as stream (stream.id)}
        <div class="main-stream">
          <StreamView 
            stream={stream.stream} 
            type={stream.stream.getVideoTracks().length > 0 ? 'video' : 'audio'} 
            muted={stream.isLocal && stream.type != 'file'} 
            mirrored={stream.isLocal && stream.type === 'camera'} 
            peerId={stream.peerId}
            on:focus={handleFocusStream}
          />
        </div>
      {/each}
      
      <!-- Other streams in a row -->
      <div class="other-streams">
        {#each activeStreams.filter(s => s.id !== focusedStream) as stream (stream.id)}
          <div class="small-stream">
            <StreamView 
              stream={stream.stream} 
              type={stream.stream.getVideoTracks().length > 0 ? 'video' : 'audio'} 
              muted={stream.isLocal && stream.type != 'file'} 
              mirrored={stream.isLocal && stream.type === 'camera'} 
              peerId={stream.peerId}
              on:focus={handleFocusStream}
            />
          </div>
        {/each}
      </div>
    </div>
  {:else if currentLayout === 'presentation'}
    <div class="presentation-layout">
      <!-- Find screen share stream if any -->
      {#each activeStreams.filter(s => s.type === 'screen') as stream (stream.id)}
        <div class="presentation-stream">
          <StreamView 
            stream={stream.stream} 
            type="video" 
            muted={stream.isLocal && stream.type != 'file'} 
            peerId={stream.peerId}
            on:focus={handleFocusStream}
          />
        </div>
      {/each}
      
      <!-- Other streams in a column -->
      <div class="presentation-others">
        {#each activeStreams.filter(s => s.type !== 'screen') as stream (stream.id)}
          <div class="small-stream">
            <StreamView 
              stream={stream.stream} 
              type={stream.stream.getVideoTracks().length > 0 ? 'video' : 'audio'} 
              muted={stream.isLocal && stream.type != 'file'} 
              mirrored={stream.isLocal && stream.type === 'camera'} 
              peerId={stream.peerId}
              on:focus={handleFocusStream}
            />
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<div class="fixed bottom-0 left-0 right-0 bg-transparent p-4 flex justify-center space-x-0 lg:space-x-4 pointer-events-none">
  <!-- Layout controls -->
  <div class="layout-controls pointer-events-auto flex mr-4">
    <button on:click={() => handleChangeLayout('grid')} class="p-2 rounded-l-full {currentLayout === 'grid' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Grid
    </button>
    <button on:click={() => handleChangeLayout('focus')} class="p-2 {currentLayout === 'focus' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Focus
    </button>
    <button on:click={() => handleChangeLayout('presentation')} class="p-2 rounded-r-full {currentLayout === 'presentation' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Present
    </button>
  </div>

  <button on:click={handleOpenQr} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto">
    ▩ <!-- QR Code -->
  </button>
  <button bind:this={audioButton} on:click={handleToggleAudio} on:contextmenu={e => handleContextMenu('audio', e)} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isAudioEnabled} style={isAudioEnabled?`background: linear-gradient(0deg, rgb(59 130 246) ${instant}%, white ${instant}%)`:""}>
    {isAudioEnabled ? '🎤' : '🔇'} <!-- Microphone -->
  </button>
  <button bind:this={videoButton} on:click={handleToggleVideo} on:contextmenu={e => handleContextMenu('video', e)} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isVideoEnabled}>
    {isVideoEnabled ? '🎥' : '📷'} <!-- Video Camera -->
  </button>
  <button on:click={handleToggleBlur} class="hover:bg-blue-600 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isBlurEnabled}>
    🌫️ <!-- Blur effect -->
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
  <video on:loadeddata={handleFilePlay} muted bind:this={videoNode} autoplay loop class="hidden" />
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
  .stream-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    grid-auto-rows: 1fr;
    gap: 8px;
    width: 100%;
    height: 100%;
    padding: 8px;
  }
  
  .focus-layout {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 8px;
  }
  
  .main-stream {
    flex: 1;
    margin-bottom: 8px;
  }
  
  .other-streams {
    display: flex;
    height: 150px;
    gap: 8px;
    overflow-x: auto;
  }
  
  .small-stream {
    width: 200px;
    height: 150px;
    flex-shrink: 0;
  }
  
  .presentation-layout {
    display: flex;
    width: 100%;
    height: 100%;
    padding: 8px;
  }
  
  .presentation-stream {
    flex: 1;
    margin-right: 8px;
  }
  
  .presentation-others {
    width: 200px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
  }
  
  .stream-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: 8px;
  }
</style>
