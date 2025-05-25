<script module lang="ts">
  // add mies type to window
  declare global {
    interface Window {
      mies: HTMLElement[];
      // MediaRecorder might need full typing if not available globally in your setup
      MediaRecorder: typeof MediaRecorder; 
    }
  }
</script>
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
  // StreamView is now in StreamDisplayArea.svelte
  import { addLocalFileStream, removeLocalFileStream } from '../stores/localFileStreamStore.js';

  import LayoutControls from './LayoutControls.svelte';
  import StreamDisplayArea from './StreamDisplayArea.svelte';
  import MediaControls from './MediaControls.svelte';

  // get hangup and openQr from $props
  let { hangup, openQr }: { hangup?: () => void; openQr?: () => void } = $props();

  // Context menu state (remains in MediaArea as ContextMenu component is here)
  let showMenu = $state(false);
  let menuPosition = $state({ x: 0, y: 0 });
  let menuItems: MenuItem[] = $state([]);
  let selectedButton: 'audio'|'camera'|null = $state(null);
  // audioButton and videoButton refs will be managed by MediaControls, not needed here directly for bind:this
  // let audioButton: HTMLElement;
  // let videoButton: HTMLElement;
  let instant = $state(0);
  let supportsVideoCaptureStream = $state(false);

  // References to DOM elements
  let uploadVideoInputInMediaControls: HTMLInputElement; // This will be bound in MediaControls
  let refreshInterval: number;

  // Reactive button states (passed to MediaControls)
  const isAudioEnabled = $derived($streamStore.streamConfig.audio !== null);
  const isCameraEnabled = $derived($streamStore.streamConfig.camera !== null);
  const isScreenSharing = $derived($streamStore.streamConfig.screen);
  const isVideoShared = $derived($streamStore.streamConfig.file !== null);
  const isBlurEnabled = $derived($configStore['blur-video'] === 'yes');
  const isTranscribing = $derived($transcriberStore.isTranscribingOverall);

  // Forwarding state - button still needs allowedHosts to change its text/color
  const allowedHosts = $derived($forwardStore.allowedHosts);

  // Stream layout state (passed to LayoutControls and used for streamPositions)
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

  import type { ViewableStream } from '../types/viewableStream.js';

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

  // Event handlers remain in MediaArea and are passed as props
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

  async function handleContextSelect(item: MenuItem | string) {
    showMenu = false;
    if (typeof item === 'string' && selectedButton) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const device = devices.find(d => d.label === item && d.kind === `${selectedButton}input`);
      if (device) {
        const deviceString = `${device.groupId}|${device.deviceId}`;
        updateConfig(`${selectedButton}-device`, deviceString);
        if ($streamStore.streamConfig[selectedButton] !== null) {
          updateStreamConfig({ [selectedButton]: null });
          setTimeout(() => updateStreamConfig({ [selectedButton!]: deviceString }), 100);
        } else {
          updateStreamConfig({ [selectedButton]: deviceString });
        }
      }
    }
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
  
  async function handleStartForward() {
    await actualToggleForwardHandler();
  }
  
  const isRecording = $derived($recorderStore.isRecording);
  async function handleRecord() {
    await toggleRecording();
  }
  
  // handleOpenQr is passed directly from props to MediaControls
  
  function handleShareVideo() {
    if ($streamStore.streamConfig.file !== null) {
      handleVideoCleanup();
    } else {
      // uploadVideoInputInMediaControls is in MediaControls, so MediaControls must trigger click
      // This specific logic will be handled by MediaControls itself.
      // MediaArea passes isVideoShared, onVideoCleanup, and onVideoUpload.
      // MediaControls will have its own internal ref to the input and call click().
      // This function in MediaArea might not be needed if MediaControls handles the click.
      // For now, we assume MediaControls calls this via a prop if it needs complex logic from parent.
      // Let's simplify: MediaControls will have its own click logic.
      // This handleShareVideo in MediaArea is effectively replaced by logic within MediaControls
      // using props like isVideoShared, onVideoCleanup, and its own input ref.
      // So, this function can be removed if MediaControls handles the click.
      // However, to keep MediaControls dumber, we can pass a function that tells it to click.
      // Or, MediaControls calls a generic onShareVideo which then MediaArea implements.
      // The current MediaControls expects an onShareVideo prop.
      // This onShareVideo prop will be this function.
      // MediaControls will need a way to click its *own* input.
      // The `uploadVideo` ref is now local to MediaControls.
      // So `uploadVideo?.click()` must happen in MediaControls.
      // Let's adjust `handleShareVideo` to be what `MediaControls` calls.
      // `MediaControls` will call `props.onShareVideo()`.
      // `MediaArea`'s `handleShareVideo` will then decide to cleanup or request click.
      // This requires `MediaControls` to expose a method to click its input, or `MediaArea`
      // to pass down a callback that `MediaControls` calls to make `MediaArea` aware of the click action.

      // Simpler: MediaControls has the button. When clicked:
      // if (isVideoShared) call props.onVideoCleanup()
      // else call uploadVideoInputInMediaControls.click() (internal to MediaControls)
      // So, MediaArea's handleShareVideo is not directly called by the button in MediaControls.
      // MediaControls will need `onVideoCleanup` and `onVideoUpload`.
      // The `handleShareVideo` in `MediaArea` is effectively split.
      // The `onShareVideo` prop for `MediaControls` will be a new function that embodies the logic
      // of "what to do when the share video button is pressed".
      // This new function will call `handleVideoCleanup` or tell `MediaControls` to click its input.
      // This is getting complicated. Let's stick to the plan:
      // MediaControls has the button. It calls `props.onShareVideo`.
      // `MediaArea`'s `handleShareVideo` is that `onShareVideo`.
      // `MediaArea` needs a ref to `MediaControls`'s input, or `MediaControls` needs to expose a click method.
      // The `uploadVideo` ref was for `MediaArea`'s own input.
      // The `input` tag is now in `MediaControls`.
      // `MediaControls` will have its own `uploadVideoElement` ref.
      // `handleShareVideo` in `MediaArea` will be passed as `onShareVideo` to `MediaControls`.
      // `MediaControls` will call `onShareVideo`.
      // `MediaArea`'s `handleShareVideo` will then need to tell `MediaControls` to click its input.
      // This is not ideal.

      // Revised approach for video sharing:
      // MediaControls has the button and the <input type="file" bind:this={uploadVideoElement}>.
      // MediaControls has its own internal handler for the share video button:
      //   internalShareVideoButtonHandler() {
      //     if (props.isVideoShared) props.onVideoCleanup();
      //     else uploadVideoElement.click();
      //   }
      // MediaArea passes `isVideoShared` and `onVideoCleanup` and `onVideoUpload` (for the input's onchange).
      // So, `handleShareVideo` in `MediaArea` is not needed as a prop for MediaControls' button click.
      // `MediaControls` will directly use `uploadVideoElement.click()`.
      // `MediaArea`'s `handleVideoUpload` and `handleVideoCleanup` are passed as props.
      if (uploadVideoInputInMediaControls) { // This ref points to the input in MediaControls
         uploadVideoInputInMediaControls.click();
      }
    }
  }


  async function handleVideoUpload(event: Event) {
    // This function is passed to MediaControls for its input's onchange event.
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const fileURL = URL.createObjectURL(file);
      updateStreamConfig({
        file: fileURL,
        videoStream: undefined, // Ensure this is reset
      });
      // Reset the input field value in MediaControls if needed, or here if ref is available
      if (uploadVideoInputInMediaControls) uploadVideoInputInMediaControls.value = '';
    }
  }

  async function handleVideoCleanup() {
    const src = $streamStore.streamConfig.file!;
    removeLocalFileStream(src);
    updateStreamConfig({file: null, videoStream: null});
    // Reset the file input value in MediaControls
    if (uploadVideoInputInMediaControls) uploadVideoInputInMediaControls.value = '';
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

  // This function is to allow MediaControls to trigger the file input click
  // This is one way to handle it if MediaArea wants to control the click.
  // However, the simpler model is MediaControls handles its own input click.
  // Let's remove this and assume MediaControls handles its own click.
  // function triggerUploadVideoClick() {
  //   if (uploadVideoInputInMediaControls) {
  //     uploadVideoInputInMediaControls.click();
  //   }
  // }

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
  {supportsVideoCaptureStream}
  {instant}
  onToggleAudio={handleToggleAudio}
  onContextMenu={handleContextMenu}
  onToggleVideo={handleToggleVideo}
  onToggleScreen={handleToggleScreen}
  onStartForward={handleStartForward}
  onRecord={handleRecord}
  onShareVideo={() => { /* Logic for share video button in MediaControls */
    if (isVideoShared) {
      handleVideoCleanup();
    } else {
      // This relies on MediaControls having its own input and clicking it.
      // MediaArea cannot directly click an input in MediaControls without a ref or callback.
      // The `uploadVideoInputInMediaControls` ref is for the `onchange` handler.
      // The click itself should be initiated by MediaControls.
      // This `onShareVideo` prop will be called by MediaControls' button.
      // MediaControls will handle the click on its own input.
      // This prop is for any *additional* logic MediaArea wants to run.
      // For now, let's assume MediaControls handles the click and this prop is for other actions.
      // The simplest is that MediaControls' button directly calls its internal input.click()
      // or calls handleVideoCleanup via a prop.
      // Let's make `onShareVideo` simpler: it's what MediaControls calls when its button is clicked.
      // MediaArea then decides what to do.
      if (isVideoShared) {
        handleVideoCleanup();
      } else {
        // We need a way for MediaArea to tell MediaControls to click its input.
        // This is where a ref to MediaControls or an exposed method would be useful.
        // Or, MediaControls handles this logic internally based on `isVideoShared`.
        // The `uploadVideoInputInMediaControls` ref is bound to the input in MediaControls.
        // So MediaArea *can* click it.
        if (uploadVideoInputInMediaControls) uploadVideoInputInMediaControls.click();
      }
  }}
  onVideoUpload={handleVideoUpload}
  bind:uploadVideoElement={uploadVideoInputInMediaControls}
/>

{#if showMenu}
<ContextMenu
  {menuItems}
  position={menuPosition}
  hide={() => showMenu = false}
/>
{/if}

<!-- TranscriptionOverlay was already removed -->

<svelte:window on:resize={updateStreamPositions} />

<style>
  /* Styles for .stream-container are now in StreamDisplayArea.svelte */
  /* Add any MediaArea specific styles here if needed */
</style>
