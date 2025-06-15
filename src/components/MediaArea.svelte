<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    streamStore,
    setViewLayout,
    updateLocalStreamProperties,
    getLocalStreamsByType,
    isAudioEnabled,
    isCameraEnabled,
    isScreenSharingEnabled,
    isFileStreamEnabled,
    type LayoutType
  } from '../lib/stores/streamStore';
  import { normalizeStreamId, setupStream } from '../lib/media/stream';
  import {
    setAudioCallback,
    enableAudio,
    disableAudio,
    enableCamera,
    disableCamera,
    enableScreenSharing,
    disableScreenSharing,
    enableFileStream,
    disableFileStream
  } from '../lib/media/localStreamManager';
  import { forwardStore } from '../lib/stores/forwardStore';
  import { toggleForwardHandler as actualToggleForwardHandler } from '../lib/app/forwardHandler';
  import { recorderStore, toggleRecording } from '../lib/media/recorder';
  import {
    transcriberStore,
    toggleOverallTranscription,
    stopOverallTranscription
  } from '../lib/media/transcriber';
  import { calculateStreamPositions } from '../lib/media/streamLayout';
  import ContextMenu from './ContextMenu.svelte';
  import { updateConfig, configStore, getAllConfig } from '../lib/stores/configStore';
  import type { MenuItem } from '../types/menu';
  import { addLocalFileStream, removeLocalFileStream } from '../lib/stores/localFileStreamStore';

  import LayoutControls from './LayoutControls.svelte';
  import StreamDisplayArea from './StreamDisplayArea.svelte';
  import MediaControls from './MediaControls.svelte';

  let { hangup, openQr }: { hangup?: () => void; openQr?: () => void } = $props();

  let showMenu = $state(false);
  let menuPosition = $state({ x: 0, y: 0 });
  let menuItems: MenuItem[] = $state([]);
  let instant = $state(0);
  let supportsVideoCaptureStream = $state(false);

  let refreshInterval: number;

  // Reactive button states
  const audioEnabled = $derived($isAudioEnabled);
  const cameraEnabled = $derived($isCameraEnabled);
  const screenSharing = $derived($isScreenSharingEnabled);
  const videoShared = $derived($isFileStreamEnabled);
  const isBlurEnabled = $derived($configStore.media.blurVideo === 'yes');
  const isTranscribing = $derived($transcriberStore.isTranscribingOverall);

  // Forwarding state
  const allowedHosts = $derived($forwardStore.allowedHosts);
  const forwardHost = $derived($forwardStore.forwardHost);

  // Stream layout state
  const currentLayout = $derived($streamStore.activeView.layout);
  const focusedStream = $derived($streamStore.activeView.focusedStream);

  const localStreams = $derived(Object.entries($streamStore.localStreams));
  const remoteStreams = $derived(
    Object.entries($streamStore.remoteStreams).flatMap(([peerId, data]) =>
      Object.entries(data.streams).map(([streamId, stream]) => ({
        id: streamId,
        stream,
        peerId
      }))
    )
  );

  import type { ViewableStream } from '../types/viewableStream';

  const groupedStreams = $derived.by(() => {
    const groups: Record<
      string,
      {
        peerId: string | null;
        streams: Array<ViewableStream>;
      }
    > = {};

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
          src: data.src
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
        src: null
      });
    });

    return groups;
  });

  const activeStreams = $derived.by(() => {
    const result: ViewableStream[] = [];

    // Process each peer's streams from groupedStreams
    Object.values(groupedStreams).forEach(({ streams }) => {
      const hasVideoStreams = streams.some(
        (s) =>
          (s.type === 'camera' ||
            s.type === 'blurred' ||
            s.type === 'screen' ||
            s.type === 'file') &&
          ((s.stream && s.stream.getVideoTracks().length > 0) || s.type === 'file')
      );

      const audioStreams = streams.filter(
        (s) =>
          s.type === 'audio' ||
          (s.stream &&
            s.stream.getVideoTracks().length === 0 &&
            s.stream.getAudioTracks().length > 0)
      );

      if (hasVideoStreams) {
        const videoStreams = streams.filter(
          (s) =>
            s.type !== 'audio' &&
            ((s.stream && s.stream?.getVideoTracks().length > 0) || s.type === 'file')
        );

        videoStreams.forEach((stream) => {
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
  let streamPositions: Array<{ id: string; x: number; y: number; width: number; height: number }> =
    $state([]);

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
    supportsVideoCaptureStream =
      typeof HTMLVideoElement !== 'undefined' &&
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
    setAudioCallback((arg) => (instant = arg));
    if (audioEnabled) {
      await disableAudio();
    } else {
      await enableAudio();
    }
  }

  async function handleContextMenu(type: 'audio' | 'camera', event: MouseEvent) {
    event.preventDefault();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const filtered = devices.filter(
      (device) => device.kind === `${type === 'camera' ? 'video' : type}input`
    );

    if (filtered.length === 0) {
      alert(`No ${type} devices found`);
      return;
    }

    const config = getAllConfig();
    const currentDeviceId = type === 'audio' ? config.media.audioDevice : config.media.videoDevice;
    menuItems = [
      {
        id: 'enable-disable',
        label: (type === 'audio' ? audioEnabled : cameraEnabled)
          ? `Disable ${type}`
          : `Enable ${type}`,
        type: 'toggle' as const,
        checked: type === 'audio' ? audioEnabled : cameraEnabled,
        action: () => {
          if (type === 'audio') handleToggleAudio();
          else handleToggleVideo();
        }
      }
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
      children: filtered.map((device) => {
        const deviceString = `${device.groupId}|${device.deviceId}`;
        const isCurrentDevice = currentDeviceId === deviceString;
        return {
          id: deviceString,
          label: device.label,
          type: 'toggle' as const,
          checked: isCurrentDevice,
          action: () => {
            const configKey = type === 'audio' ? 'audioDevice' : 'videoDevice';
            updateConfig('media', configKey, deviceString);
            // streamStore.streamConfig will be updated by the listener in streamBridge.ts
            // For immediate effect if the stream is already active, we might still want this,
            // but the config change should trigger the streamBridge to update it.
            // Let's rely on streamBridge to handle the stream update based on config change.
            // If the stream is currently off, turning it on will use the new config.
            // If it's on, streamBridge will restart it with the new device.
          }
        };
      })
    });

    menuPosition = { x: event.pageX, y: event.pageY };
    showMenu = true;
  }

  async function handleToggleVideo() {
    if (cameraEnabled) {
      await disableCamera();
    } else {
      await enableCamera();
    }
  }

  async function handleToggleBlur() {
    const newValue = isBlurEnabled ? 'no' : 'yes';
    updateConfig('media', 'blurVideo', newValue);
    // streamBridge.ts will listen to this config change and restart the camera stream if active.
  }

  async function handleToggleScreen() {
    if (screenSharing) {
      await disableScreenSharing();
    } else {
      await enableScreenSharing();
    }
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
      await enableFileStream(fileURL);
    }
  }

  async function handleVideoCleanup() {
    const fileStreams = getLocalStreamsByType('file');
    const fileStreamEntry = Object.entries(fileStreams)[0];
    if (fileStreamEntry && fileStreamEntry[1].src) {
      removeLocalFileStream(fileStreamEntry[1].src);
    }
    await disableFileStream();
  }

  async function handleFilePlay(event: Event) {
    const fileStreams = getLocalStreamsByType('file');
    const fileStreamEntry = Object.entries(fileStreams)[0];
    if (fileStreamEntry && fileStreamEntry[1].stream) return; // Already has a stream

    const videoNode = event.target as HTMLVideoElement;
    videoNode.play();
    const captureStream = (videoNode as any).captureStream || (videoNode as any).mozCaptureStream;
    let videoStream;
    if (captureStream) {
      videoStream = captureStream.call(videoNode);
    } else {
      alert("the browser doesn't support video sharing");
      return;
    }

    if (fileStreamEntry && fileStreamEntry[1].src) {
      addLocalFileStream(fileStreamEntry[1].src, videoStream);
      setupStream(videoStream, 'medium', 'detail', false);
      updateLocalStreamProperties(fileStreamEntry[0], { sendable: true });
    }
  }

  function handleChangeLayout(layout: LayoutType) {
    setViewLayout(layout);
  }

  function handleFocusStream({
    streamId
  }: {
    streamId: string | undefined;
    peerId: string | null;
  }) {
    setViewLayout('focus', streamId);
  }

  function handleToggleTranscription() {
    toggleOverallTranscription();
  }
</script>

<div
  id="media"
  bind:this={mediaContainerElement}
  class="w-full w-svw h-svh relative bg-black"
  style="width: 100svw; height: 100svh;"
>
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
  {openQr}
  isAudioEnabled={audioEnabled}
  isCameraEnabled={cameraEnabled}
  isScreenSharing={screenSharing}
  isVideoShared={videoShared}
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
  <ContextMenu {menuItems} position={menuPosition} hide={() => (showMenu = false)} />
{/if}

<svelte:window on:resize={updateStreamPositions} />

<style>
</style>
