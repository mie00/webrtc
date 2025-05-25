<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { streamStore, updateStreamConfig, setViewLayout, updateLocalStreamProperties, getLocalStreamsByType, type LayoutType } from '../stores/streamStore.js';
  import { normalizeStreamId, setupLocalFileStream, setAudioCallback } from '../lib/streamBridge.js';
  import { forwardStore, toggleForwardHandler as actualToggleForwardHandler } from '../lib/forwardBridge.js';
  import { recorderStore, toggleRecording } from '../lib/media/recorder.js';
  import { transcriberStore, toggleOverallTranscription, stopOverallTranscription } from '../lib/media/transcriber.js';
  import { calculateStreamPositions } from '../lib/media/streamLayout.js';
  import ContextMenu from './ContextMenu.svelte';
  import { updateConfig, configStore } from '../stores/configStore.js';
  import type { MenuItem } from '../types/menu.js';
  import { addLocalFileStream, removeLocalFileStream } from '../stores/localFileStreamStore.js';

  import LayoutControls from './LayoutControls.svelte';
  import StreamDisplayArea from './StreamDisplayArea.svelte';
  import MediaControls from './MediaControls.svelte';

  let { hangup, openQr }: { hangup?: () => void; openQr?: () => void } = $props();

  let showMenu = $state(false);
  let menuPosition = $state({ x: 0, y: 0 });
  let menuItems: MenuItem[] = $state([]);
  let selectedButton: 'audio'|'camera'|null = $state(null);
  let instant = $state(0);
  let supportsVideoCaptureStream = $state(false);

  let refreshInterval: number;

  // Reactive button states
  const isAudioEnabled = $derived($streamStore.streamConfig.audio !== null);
  const isCameraEnabled = $derived($streamStore.streamConfig.camera !== null);
  const isScreenSharing = $derived($streamStore.streamConfig.screen);
  const isVideoShared = $derived($streamStore.streamConfig.file !== null);
  const isBlurEnabled = $derived($configStore['blur-video'] === 'yes');
  const isTranscribing = $derived($transcriberStore.isTranscribingOverall);

  // Forwarding state
  const allowedHosts = $derived($forwardStore.allowedHosts);
  const forwardHost = $derived($forwardStore.forwardHost);

  // Stream layout state
  const currentLayout = $derived($streamStore.activeView.layout);
  const focusedStream = $derived($streamStore.activeView.focusedStream);

  const localStreams = $derived(Object.entries($streamStore.localStreams));
  const remoteStreams = $derived(Object.entries($streamStore.remoteStreams).flatMap(([peerId, data]) =>
    Object.entries(data.streams).map(([streamId, stream]) => ({
      id: streamId,
      stream,
      peerId
    }))
  ));

  import type { ViewableStream } from '../types/viewableStream.js';

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
        .filter(([_, data]) => data.viewable)
        .map(([streamId, data]) => ({
          id: normalizeStreamId(data.stream?.id || data.src || ''),
          streamKey: streamId,
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

    return result;
  });
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
    refreshInterval = window.setInterval(updateStreamPositions, 1000);
    supportsVideoCaptureStream = typeof HTMLVideoElement !== 'undefined' &&
                                 HTMLVideoElement.prototype &&
                                 (typeof HTMLVideoElement.prototype.captureStream === 'function' ||
                                  typeof (HTMLVideoElement.prototype as any).mozCaptureStream === 'function');
  });

  onDestroy(() => {
    clearInterval(refreshInterval);
    if ($transcriberStore.isTranscribingOverall) {
      stopOverallTranscription();
    }
  });

  $effect(() => updateStreamPositions());

  function handleHangup() {
    if (hangup) hangup();
  }

  async function handleToggleAudio() {
    setAudioCallback((arg) => instant = arg);
    if ($streamStore.streamConfig.audio === null) {
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
    const filtered = devices.filter(device => device.kind === `${type === 'camera' ? 'video' : type}input`);

    if (filtered.length === 0) {
      alert(`No ${type} devices found`);
      return;
    }

    const currentDeviceId = $streamStore.streamConfig[type];
    menuItems = [
      {
        id: 'enable-disable',
        label: $streamStore.streamConfig[type] === null ? `Enable ${type}` : `Disable ${type}`,
        type: 'toggle' as const,
        checked: $streamStore.streamConfig[type] !== null,
        action: () => {
          if (type === 'audio') handleToggleAudio();
          else handleToggleVideo();
        }
      },
    ];

    if (type === 'camera') {
      menuItems.push({
        id: 'blur',
        label: 'Blur background',
        type: 'toggle' as const,
        checked: isBlurEnabled,
        action: () => handleToggleBlur()
      });
    }

    if (type === 'audio') {
      menuItems.push({
        id: 'toggle-transcription',
        label: isTranscribing ? 'Disable Transcription' : 'Enable Transcription',
        type: 'toggle' as const,
        checked: isTranscribing,
        action: () => handleToggleTranscription()
      });
    }

    menuItems.push({
      id: 'select-device',
      label: 'Select Device',
      type: 'submenu' as const,
      children: filtered.map(device => {
        const deviceString = `${device.groupId}|${device.deviceId}`;
        const isCurrentDevice = currentDeviceId === deviceString;
        return {
          id: deviceString,
          label: device.label,
          type: 'toggle' as const,
          checked: isCurrentDevice,
          action: () => {
            updateConfig(`${type}-device`, deviceString);
            if ($streamStore.streamConfig[type] !== null) {
              updateStreamConfig({ [type]: null });
              setTimeout(() => updateStreamConfig({ [type]: deviceString }), 100);
            } else {
              updateStreamConfig({ [type]: deviceString });
            }
          }
        };
      })
    });
    
    menuPosition = { x: event.pageX, y: event.pageY };
    showMenu = true;
  }

  async function handleToggleVideo() {
    if ($streamStore.streamConfig.camera === null) {
      const deviceString = $configStore['video-device'] || '';
      updateStreamConfig({ camera: deviceString });
    } else {
      updateStreamConfig({ camera: null });
    }
  }

  async function handleToggleBlur() {
    const newValue = isBlurEnabled ? 'no' : 'yes';
    updateConfig('blur-video', newValue);
    if (isCameraEnabled) {
      const currentDevice = $streamStore.streamConfig.camera;
      updateStreamConfig({ camera: null });
      setTimeout(() => updateStreamConfig({ camera: currentDevice }), 100);
    }
  }

  async function handleToggleScreen() {
    const newValue = !$streamStore.streamConfig.screen;
    updateStreamConfig({ screen: newValue });
  }
  
  async function handleToggleForward() {
    await actualToggleForwardHandler();
  }
  
  const isRecording = $derived($recorderStore.isRecording);
  async function handleRecord() {
    await toggleRecording();
  }
  
  
  async function handleVideoUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
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
  }

  async function handleFilePlay(event: Event) {
    if ($streamStore.streamConfig.videoStream) return;
    const videoNode = (event.target as HTMLVideoElement);
    videoNode.play();
    const captureStream = (videoNode as any).captureStream || (videoNode as any).mozCaptureStream;
    let videoStream;
    if (captureStream) {
      videoStream = captureStream.call(videoNode);
    } else {
      alert("the browser doesn't support video sharing");
      return;
    }
    updateStreamConfig({ videoStream });
    addLocalFileStream($streamStore.streamConfig.file!, videoStream);
    setupLocalFileStream(videoStream);
    const fileStreams = getLocalStreamsByType('file');
    const fileStreamEntry = Object.entries(fileStreams)[0];
    if (fileStreamEntry) {
      updateLocalStreamProperties(fileStreamEntry[0], { sendable: true });
    }
  }

  function handleChangeLayout(layout: LayoutType) {
    setViewLayout(layout);
  }

  function handleFocusStream({streamId}:{streamId: string|undefined; peerId : string | null}) {
    setViewLayout('focus', streamId);
  }

  function handleToggleTranscription() {
    toggleOverallTranscription();
  }

</script>

<div id="media" bind:this={mediaContainerElement} class="w-full w-svw h-svh relative bg-black" style="width: 100svw; height: 100svh;">
  <StreamDisplayArea
    {activeStreams}
    {streamPositions}
    onFocusStream={handleFocusStream}
    onFilePlay={handleFilePlay}
  />
</div>

<LayoutControls {currentLayout} onChangeLayout={handleChangeLayout} />

<MediaControls
  hangup={handleHangup}
  openQr={openQr}
  {isAudioEnabled}
  {isCameraEnabled}
  {isScreenSharing}
  {isVideoShared}
  {isRecording}
  {allowedHosts}
  {forwardHost}
  {supportsVideoCaptureStream}
  {instant}
  onToggleAudio={handleToggleAudio}
  onContextMenu={handleContextMenu}
  onToggleVideo={handleToggleVideo}
  onToggleScreen={handleToggleScreen}
  onToggleForward={handleToggleForward}
  onRecord={handleRecord}
  onStopSharingVideo={handleVideoCleanup}
  onVideoUpload={handleVideoUpload}
/>

{#if showMenu}
<ContextMenu
  {menuItems}
  position={menuPosition}
  hide={() => showMenu = false}
/>
{/if}

<svelte:window on:resize={updateStreamPositions} />

<style>
</style>
