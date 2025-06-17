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
    type LayoutType,
    getIsDeviceStreamActive // Non-reactive check for immediate use
  } from '../lib/stores/streamStore';
  import { normalizeStreamId, setupStream } from '../lib/media/stream';
  import {
    setAudioCallback, // Keep this
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
    setAudioCallback((arg) => (instant = arg)); // Ensure callback is set/reset
    if (audioEnabled) { // If any audio stream is enabled
      await disableAudio(); // Disable all audio streams
    } else {
      await enableAudio(); // Enable default audio stream
    }
  }

  async function handleContextMenu(type: 'audio' | 'camera', event: MouseEvent) {
    event.preventDefault();
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputKind = type === 'camera' ? 'videoinput' : 'audioinput';
    const filteredDevices = devices.filter((device) => device.kind === inputKind);

    // Allow menu for audio even if no devices (for transcription toggle)
    if (filteredDevices.length === 0 && type === 'camera') {
      alert(`No ${type} devices found`);
      return;
    }

    const config = getAllConfig();
    const currentDefaultConfigDeviceId = type === 'audio' ? config.media.audioDevice : config.media.videoDevice;
    const isOverallTypeEnabled = type === 'audio' ? audioEnabled : cameraEnabled;

    menuItems = [
      {
        id: `master-toggle-${type}`,
        label: isOverallTypeEnabled ? `Disable All ${type}` : `Enable Default ${type}`,
        type: 'item' as const,
        action: async () => {
          if (type === 'audio') await handleToggleAudio();
          else await handleToggleVideo();
        }
      }
    ];

    if (type === 'camera') {
      menuItems.push({
        id: 'blur-toggle',
        label: 'Blur Background',
        type: 'toggle' as const,
        checked: isBlurEnabled,
        action: () => handleToggleBlur() // Assumes handleToggleBlur updates configStore
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

    // Submenu for selecting the *default* device (updates configStore)
    const setDefaultDeviceSubmenuItems: MenuItem[] = [
      {
        id: `<auto>-default-config-${type}`,
        label: 'Auto (System Default)',
        type: 'toggle' as const,
        checked: currentDefaultConfigDeviceId === '<auto>',
        action: () => {
          const configKey = type === 'audio' ? 'audioDevice' : 'videoDevice';
          updateConfig('media', configKey, '<auto>');
        }
      },
      ...filteredDevices.map((device) => {
        // Use a consistent deviceId string format, e.g., just device.deviceId or groupId|deviceId
        // For simplicity, let's assume device.deviceId is unique enough for this context,
        // but in production, a more robust groupId|deviceId might be better if available and consistent.
        // The localStreamManager uses "groupId|deviceId" if available, otherwise just deviceId.
        // Let's try to match that.
        const deviceIdString = device.groupId ? `${device.groupId}|${device.deviceId}` : device.deviceId;

        return {
          id: `set-default-${deviceIdString}`,
          label: device.label || `${type} device ${device.deviceId.substring(0, 6)}...`,
          type: 'toggle' as const,
          checked: currentDefaultConfigDeviceId === deviceIdString,
          action: () => {
            const configKey = type === 'audio' ? 'audioDevice' : 'videoDevice';
            updateConfig('media', configKey, deviceIdString);
          }
        };
      })
    ];
    menuItems.push({
      id: `set-default-${type}-submenu`,
      label: 'Set Default Device',
      type: 'submenu' as const,
      children: setDefaultDeviceSubmenuItems
    });

    // Submenu for toggling *individual* devices on/off (does not change configStore default)
    if (filteredDevices.length > 0) {
      const toggleDeviceSubmenuItems: MenuItem[] = filteredDevices.map((device) => {
        const deviceIdString = device.groupId ? `${device.groupId}|${device.deviceId}` : device.deviceId;
        const isActive = getIsDeviceStreamActive(type, deviceIdString); // Non-reactive check

        return {
          id: `toggle-device-${deviceIdString}`,
          label: device.label || `${type} device ${device.deviceId.substring(0, 6)}...`,
          type: 'toggle' as const,
          checked: isActive,
          action: async () => {
            if (isActive) {
              if (type === 'audio') await disableAudio(deviceIdString);
              else await disableCamera(deviceIdString);
            } else {
              if (type === 'audio') await enableAudio(deviceIdString);
              else await enableCamera(deviceIdString);
            }
          }
        };
      });

      menuItems.push({
        id: `toggle-${type}-devices-submenu`,
        label: 'Toggle Specific Devices',
        type: 'submenu' as const,
        children: toggleDeviceSubmenuItems
      });
    }

    menuPosition = { x: event.pageX, y: event.pageY };
    showMenu = true;
  }

  async function handleToggleVideo() {
    if (cameraEnabled) { // If any camera stream is enabled
      await disableCamera(); // Disable all camera streams
    } else {
      await enableCamera(); // Enable default camera stream
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
