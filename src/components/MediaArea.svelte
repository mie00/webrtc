<script module lang="ts">
  // add mies type to window
  declare global {
    interface Window {
      mies: HTMLElement[];
    }
  }
</script>
<script lang="ts">
  import { onMount } from 'svelte';
  import { streamStore, updateStreamConfig, setViewLayout, type LayoutType } from '../stores/streamStore.js';
  import { normalizeStreamId, setupLocalFileStream, setAudioCallback } from '../lib/streamBridge.js';
  import { forwardStore, toggleForwardHandler as actualToggleForwardHandler, type LogMessage } from '../lib/forwardBridge.js';
  import { recorderStore, toggleRecording } from '../lib/media/recorder.js';
  import { calculateStreamPositions } from '../lib/media/streamLayout.js';
  import ContextMenu from './ContextMenu.svelte';
  import { updateConfig, configStore } from '../stores/configStore.js';
  import StreamView from './StreamView.svelte';
  import { addLocalFileStream, removeLocalFileStream } from '../stores/localFileStreamStore.js';

  // get hangup and openQr from $props
  let { hangup, openQr }: { hangup?: () => void; openQr?: () => void } = $props();

  // Context menu state
  let showMenu = $state(false);
  let menuPosition = $state({ x: 0, y: 0 });
  let menuItems: string[] = $state([]);
  let selectedButton: 'audio'|'camera'|null = $state(null);
  let audioButton: HTMLElement;
  let videoButton: HTMLElement;
  let instant = $state(0);

  // References to DOM elements
  let uploadVideo: HTMLInputElement;
  let refreshInterval: number;

  // Reactive button states
  const isAudioEnabled = $derived($streamStore.streamConfig.audio !== null);
  const isCameraEnabled = $derived($streamStore.streamConfig.camera !== null);
  const isScreenSharing = $derived($streamStore.streamConfig.screen);
  const isVideoShared = $derived($streamStore.streamConfig.file !== null);
  const isBlurEnabled = $derived($configStore['blur-video'] === 'yes');

  // Forwarding state - button still needs allowedHosts to change its text/color
  const allowedHosts = $derived($forwardStore.allowedHosts);

  // Stream layout state
  const currentLayout = $derived($streamStore.activeView.layout);
  const focusedStream = $derived($streamStore.activeView.focusedStream);

  // Derived stream collections
  const localStreams = $derived(Object.entries($streamStore.localStreams));
  const remoteStreams = $derived(Object.entries($streamStore.remoteStreams).flatMap(([peerId, data]) =>
    Object.entries(data.streams).map(([streamId, stream]) => ({
      id: streamId,
      stream,
      peerId
    }))
  ));

  interface ViewableStream {
    id: string,
    streamKey: string,
    stream: MediaStream | null,
    type: 'camera' | 'screen' | 'audio' | 'file', // Removed forward types
    isLocal: boolean,
    src: string | null,
  
    peerId?: string | null,
    audioStream?: MediaStream | null,
    hasAudio?: boolean | null,
    // logMessages prop removed
  }

  // Group streams by peer ID
  const groupedStreams = $derived.by(() => {
    const groups: Record<string, {
      peerId: string | null,
      streams: Array<ViewableStream>
    }> = {};
    
    // Add local streams
    const localPeerId = 'local';
    groups[localPeerId] = {
      peerId: null,
      streams: localStreams
        .filter(([_, data]) => data.active)
        .map(([id, data]) => ({
          id: normalizeStreamId(data.stream?.id || data.src || ''),
          streamKey: id,
          stream: data.stream,
          type: data.type,
          isLocal: true,
          peerId: null,
          src: data.src,
        }))
    };
    
    // Add remote streams
    remoteStreams.forEach(({ id, stream, peerId }) => {
      if (!groups[peerId]) {
        groups[peerId] = { peerId, streams: [] };
      }
      
      groups[peerId].streams.push({
        id: normalizeStreamId(stream.id),
        streamKey: id,
        stream,
        type: stream.getVideoTracks().length > 0 ? 'camera' : 'audio',
        isLocal: false,
        src: null,
      });
    });
    
    return groups;
  });
  
  // All active streams for display
  const activeStreams = $derived.by(() => {
    const result: ViewableStream[] = [];
    
    // Process each peer's streams from groupedStreams
    Object.values(groupedStreams).forEach(({ streams }) => {
      const hasVideoStreams = streams.some(s => 
        (s.type === 'camera' || s.type === 'screen' || s.type === 'file') && 
        (s.stream && s.stream.getVideoTracks().length > 0 || s.type === 'file')
      );
      
      const audioStreams = streams.filter(s => 
        s.type === 'audio' || 
        (s.stream && s.stream.getVideoTracks().length === 0 && s.stream.getAudioTracks().length > 0)
      );
      
      if (hasVideoStreams) {
        const videoStreams = streams.filter(s => 
          s.type !== 'audio' && 
          (s.stream && s.stream?.getVideoTracks().length > 0 || s.type === 'file')
        );
        
        videoStreams.forEach(stream => {
          const audioStream = audioStreams.length > 0 ? audioStreams[0].stream : null;
          const streamHasAudio = stream.stream && stream.stream.getAudioTracks().length > 0;
          stream.audioStream = audioStream;
          stream.hasAudio = !!audioStream || streamHasAudio;
        });
        result.push(...videoStreams);
      } else {
        result.push(...audioStreams);
      }
    });

    // Forwarding elements are now handled by ForwardOverlay.svelte
    
    return result;
  });
  // Stream positions
  let mediaContainerElement: HTMLElement;
  let streamPositions: Array<{ id: string; x: number; y: number; width: number; height: number }> = $state([]);
  
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

    return () => {
      // Clean up on component destruction
      clearInterval(refreshInterval);
    };
  });

  // Update positions when layout or streams change
  $effect(() => updateStreamPositions());

  // Event handlers
  function handleHangup() {
    if (hangup) hangup();
  }

  async function handleToggleAudio() {
    setAudioCallback((arg) => instant = arg);

    if ($streamStore.streamConfig.audio === null) {
      // Get the current audio device from config or use default
      const deviceString = $configStore['audio-device'] || '';
      updateStreamConfig({ audio: deviceString });
    } else {
      updateStreamConfig({ audio: null });
    }
  }

  async function handleContextMenu(type: 'audio'|'camera', event: MouseEvent) {
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
      const deviceString = `${device.groupId}|${device.deviceId}`;
      
      // Update both stores for compatibility
      updateConfig(`${selectedButton}-device`, deviceString);
      
      // If the stream is already enabled, update it with the new device
      if ($streamStore.streamConfig[selectedButton] !== null) {
        // Temporarily disable the stream and then re-enable it with the new device
        updateStreamConfig({ [selectedButton]: null });
        // Short delay to ensure cleanup completes before restarting
        setTimeout(() => updateStreamConfig({ [selectedButton!]: deviceString }), 100);
      } else {
        // If not enabled, just enable it with the new device
        updateStreamConfig({ [selectedButton]: deviceString });
      }
    }
  }

  async function handleToggleVideo() {
    if ($streamStore.streamConfig.camera === null) {
      // Get the current video device from config or use default
      const deviceString = $configStore['video-device'] || '';
      updateStreamConfig({ camera: deviceString });
    } else {
      updateStreamConfig({ camera: null });
    }
  }

  async function handleToggleBlur() {
    const newValue = isBlurEnabled ? 'no' : 'yes';
    updateConfig('blur-video', newValue);
    
    // If video is already enabled, restart it to apply the blur effect
    if (isCameraEnabled) {
      // Temporarily disable and re-enable camera to apply blur
      const currentDevice = $streamStore.streamConfig.camera;
      updateStreamConfig({ camera: null });
      setTimeout(() => updateStreamConfig({ camera: currentDevice }), 100);
    }
  }

  async function handleToggleScreen() {
    const newValue = !$streamStore.streamConfig.screen;
    updateStreamConfig({ screen: newValue });
  }
  
  async function handleStartForward() {
    await actualToggleForwardHandler();
  }

  
  // Use the recorder store
  const isRecording = $derived($recorderStore.isRecording);

  async function handleRecord() {
    await toggleRecording();
  }
  
  function handleOpenQr() {
    if(openQr) openQr();
  }
  
  function handleShareVideo() {
    // Trigger file upload dialog
    if ($streamStore.streamConfig.file !== null) {
      handleVideoCleanup();
    } else {
      uploadVideo?.click();
    }
  }

  async function handleVideoUpload(event: Event) {
    if (uploadVideo.files && uploadVideo.files.length > 0) {
      const file = uploadVideo.files[0];
      const fileURL = URL.createObjectURL(file);

      updateStreamConfig({
        file: fileURL,
        videoStream: undefined,
      });
    }
  }
  async function handleVideoCleanup() {
    const src = $streamStore.streamConfig.file!;
    removeLocalFileStream(src);
    updateStreamConfig({file: null, videoStream: null});
    uploadVideo.value = ''; // Reset the file input
  }

  async function handleFilePlay(event: Event) {
    if ($streamStore.streamConfig.videoStream) {
      return
    }
    const videoNode = (event.target as HTMLVideoElement);
    videoNode.play();
    const videoStream = (videoNode as any).captureStream ? 
      (videoNode as any).captureStream() : 
      (videoNode as any).mozCaptureStream();

    updateStreamConfig({
      videoStream
    });
    addLocalFileStream($streamStore.streamConfig.file!, videoStream);
    setupLocalFileStream(videoStream);
  }

  function handleChangeLayout(layout: LayoutType) {
    setViewLayout(layout);
  }

  function handleFocusStream({streamId}:{streamId: string|undefined; peerId : string | null}) {
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
          stream={stream.src?null:stream.stream}
          useSlot={!!stream.src}
          type={!stream.stream || stream.stream.getVideoTracks().length > 0 ? 'video' : 'audio'}
          muted={stream.isLocal && stream.type !== 'file'} 
          mirrored={stream.isLocal && stream.type === 'camera'} 
          peerId={stream.peerId}
          focus={handleFocusStream}
          audioStream={stream.audioStream || undefined}
          hasAudio={stream.hasAudio || undefined}
        >
          {#if stream.type === 'file' && stream.src}
            <!-- svelte-ignore a11y_media_has_caption -->
            {#key stream.src}
              <video onloadeddata={handleFilePlay} src={stream.src} autoplay controls loop class="w-full h-full object-contain"></video>
            {/key}
          {/if}
        </StreamView>
      </div>
    {/if}
  {/each}
</div>

<div class="fixed bottom-0 left-0 right-0 bg-transparent p-4 flex justify-center space-x-0 lg:space-x-4 pointer-events-none">
  <!-- Layout controls -->
  <div class="layout-controls pointer-events-auto flex mr-4">
    <button id="test-layout-grid-button" onclick={() => handleChangeLayout('grid')} class="p-2 rounded-l-full {currentLayout === 'grid' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Grid
    </button>
    <button id="test-layout-focus-button" onclick={() => handleChangeLayout('focus')} class="p-2 {currentLayout === 'focus' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Focus
    </button>
    <button id="test-layout-present-button" onclick={() => handleChangeLayout('presentation')} class="p-2 rounded-r-full {currentLayout === 'presentation' ? 'bg-blue-600' : 'bg-gray-700'} text-white">
      Present
    </button>
  </div>

  <button id="test-open-qr-button" onclick={handleOpenQr} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto">
    ▩ <!-- QR Code -->
  </button>
  <button id="test-toggle-audio-button" bind:this={audioButton} onclick={handleToggleAudio} oncontextmenu={e => handleContextMenu('audio', e)} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isAudioEnabled} style={isAudioEnabled?`background: linear-gradient(0deg, rgb(59 130 246) ${instant}%, white ${instant}%)`:""}>
    {isAudioEnabled ? '🎤' : '🔇'} <!-- Microphone -->
  </button>
  <button id="test-toggle-video-button" bind:this={videoButton} onclick={handleToggleVideo} oncontextmenu={e => handleContextMenu('camera', e)} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isCameraEnabled}>
    {isCameraEnabled ? '🎥' : '📷'} <!-- Video Camera -->
  </button>
  <button id="test-toggle-blur-button" onclick={handleToggleBlur} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isBlurEnabled}>
    🌫️ <!-- Blur effect -->
  </button>
  <button id="test-toggle-screen-button" onclick={handleToggleScreen} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isScreenSharing}>
    🖥️ <!-- Monitor for Share Screen -->
  </button>
  <button 
    id="test-start-forward-button" 
    onclick={handleStartForward} 
    class="text-white p-3 rounded-full pointer-events-auto"
    class:bg-red-500={allowedHosts.length}
    class:hover:bg-red-600={allowedHosts.length}
    class:hover:bg-blue-700={!allowedHosts.length}
  >
    {allowedHosts.length ? '⏹️' : '⏩'}
  </button>
  <button id="test-share-video-button" onclick={handleShareVideo} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isVideoShared}>
    📹 <!-- Share Video -->
  </button>
  <button id="test-record-button" onclick={handleRecord} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-red-600={isRecording}>
    {isRecording ? '⏹' : '⏺'}
  </button>
  <button id="test-hangup-button" onclick={handleHangup} class="hover:bg-red-600 bg-red-500 text-white p-3 rounded-full pointer-events-auto">
    📞
  </button>
  <input bind:this={uploadVideo} type="file" onchange={handleVideoUpload} accept="video/*" class="hidden">
</div>

{#if showMenu}
<ContextMenu
  {menuItems}
  position={menuPosition}
  cb={handleContextSelect}
  hide={() => showMenu = false}
/>
{/if}
<svelte:window on:resize={updateStreamPositions} />

<style>
  .stream-container {
    overflow: hidden;
    border-radius: 8px;
    transition: all 0.3s ease;
    padding: 4px;
  }
</style>
