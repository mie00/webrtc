<script lang="ts">
  import type { MenuItem } from '../types/menu.js';

  let {
    hangup,
    openQr,
    isAudioEnabled,
    isCameraEnabled,
    isScreenSharing,
    isVideoShared,
    isRecording,
    allowedHosts,
    supportsVideoCaptureStream,
    instant,
    onToggleAudio,
    onContextMenu,
    onToggleVideo,
    onToggleScreen,
    onStartForward,
    onRecord,
    onShareVideo,
    onVideoUpload,
  }: {
    hangup?: () => void;
    openQr?: () => void;
    isAudioEnabled: boolean;
    isCameraEnabled: boolean;
    isScreenSharing: boolean;
    isVideoShared: boolean;
    isRecording: boolean;
    allowedHosts: string[];
    supportsVideoCaptureStream: boolean;
    instant: number;
    onToggleAudio: () => Promise<void>;
    onContextMenu: (type: 'audio' | 'camera', event: MouseEvent) => Promise<void>;
    onToggleVideo: () => Promise<void>;
    onToggleScreen: () => Promise<void>;
    onStartForward: () => Promise<void>;
    onRecord: () => Promise<void>;
    onShareVideo: () => void;
    onVideoUpload: (event: Event) => Promise<void>;
  } = $props();

  let audioButtonElement: HTMLElement;
  let videoButtonElement: HTMLElement;
  let uploadVideoElement: HTMLInputElement;

</script>

<div class="fixed bottom-0 left-0 right-0 bg-transparent p-4 flex justify-center space-x-0 lg:space-x-4 pointer-events-none">
  <button id="test-open-qr-button" onclick={openQr} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto">
    ▩ <!-- QR Code -->
  </button>
  <button id="test-toggle-audio-button" bind:this={audioButtonElement} onclick={onToggleAudio} oncontextmenu={e => onContextMenu('audio', e)} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isAudioEnabled} style={isAudioEnabled ? `background: linear-gradient(0deg, rgb(59 130 246) ${instant}%, white ${instant}%)` : ""}>
    {isAudioEnabled ? '🎤' : '🔇'} <!-- Microphone -->
  </button>
  <button id="test-toggle-video-button" bind:this={videoButtonElement} onclick={onToggleVideo} oncontextmenu={e => onContextMenu('camera', e)} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isCameraEnabled}>
    {isCameraEnabled ? '🎥' : '📷'} <!-- Video Camera -->
  </button>
  <button id="test-toggle-screen-button" onclick={onToggleScreen} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isScreenSharing}>
    🖥️ <!-- Monitor for Share Screen -->
  </button>
  <button
    id="test-start-forward-button"
    onclick={onStartForward}
    class="text-white p-3 rounded-full pointer-events-auto"
    class:bg-red-500={allowedHosts.length > 0}
    class:hover:bg-red-600={allowedHosts.length > 0}
    class:hover:bg-blue-700={!(allowedHosts.length > 0)}
    class:bg-blue-500={!(allowedHosts.length > 0)} 
  >
    {allowedHosts.length > 0 ? '⏹️' : '⏩'}
  </button>
  {#if supportsVideoCaptureStream}
  <button id="test-share-video-button" onclick={onShareVideo} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-blue-600={isVideoShared}>
    📹 <!-- Share Video -->
  </button>
  {/if}
  <button id="test-record-button" onclick={onRecord} class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto" class:bg-red-600={isRecording}>
    {isRecording ? '⏹' : '⏺'}
  </button>
  <button id="test-hangup-button" onclick={hangup} class="hover:bg-red-600 bg-red-500 text-white p-3 rounded-full pointer-events-auto">
    📞
  </button>
  <input bind:this={uploadVideoElement} type="file" onchange={onVideoUpload} accept="video/*" class="hidden">
</div>
