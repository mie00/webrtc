<script lang="ts">
  import type { MenuItem } from '../types/menu';

  let {
    hangup,
    openQr,
    isAudioEnabled,
    isCameraEnabled,
    isScreenSharing,
    isVideoShared,
    isRecording,
    allowedHosts,
    forwardHost,
    supportsVideoCaptureStream,
    instant,
    onToggleAudio,
    onContextMenu,
    onToggleVideo,
    onToggleScreen,
    onToggleForward,
    onRecord,
    onStopSharingVideo, // Renamed from onShareVideo
    onVideoUpload
  }: {
    hangup?: () => void;
    openQr?: () => void;
    isAudioEnabled: boolean;
    isCameraEnabled: boolean;
    isScreenSharing: boolean;
    isVideoShared: boolean;
    isRecording: boolean;
    allowedHosts: string[];
    forwardHost: string | null;
    supportsVideoCaptureStream: boolean;
    instant: number;
    onToggleAudio: () => Promise<void>;
    onContextMenu: (type: 'audio' | 'camera', event: MouseEvent) => Promise<void>;
    onToggleVideo: () => Promise<void>;
    onToggleScreen: () => Promise<void>;
    onToggleForward: () => Promise<void>;
    onRecord: () => Promise<void>;
    onStopSharingVideo: () => void; // Renamed from onShareVideo
    onVideoUpload: (event: Event) => Promise<void>;
  } = $props();

  let audioButtonElement: HTMLElement;
  let videoButtonElement: HTMLElement;
  let uploadVideoElement: HTMLInputElement;

  // --- Logic for long press detection ---
  let longPressTimer: number | undefined = undefined;
  let isLongPressTriggered = false; // Flag to indicate the long press action has been triggered

  const LONG_PRESS_DURATION = 700; // milliseconds

  function handleTouchStart(type: 'audio' | 'camera', event: TouchEvent) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
    isLongPressTriggered = false;

    longPressTimer = window.setTimeout(() => {
      isLongPressTriggered = true;
      event.preventDefault(); // Prevent default browser actions (selection, native context menu)
      // Pass the TouchEvent cast as MouseEvent. The consumer of onContextMenu might need to be robust
      // or this cast might be sufficient if only common properties like preventDefault are used.
      onContextMenu(type, event as unknown as MouseEvent);
      longPressTimer = undefined;
    }, LONG_PRESS_DURATION);
  }

  function handleTouchEnd(event: TouchEvent) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = undefined;
      // Short tap, isLongPressTriggered remains false.
    }

    if (isLongPressTriggered) {
      // If long press was triggered, prevent the browser from firing a 'click' event.
      event.preventDefault();
    }
  }

  function handleTouchMove(event: TouchEvent) {
    // If the finger moves, cancel the long press timer.
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }
  }
  // --- End of long press logic ---
</script>

<div
  class="fixed bottom-0 left-0 right-0 bg-transparent p-4 flex justify-center space-x-0 lg:space-x-4 pointer-events-none"
>
  <button
    id="test-open-qr-button"
    onclick={openQr}
    class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto"
  >
    ▩ <!-- QR Code -->
  </button>
  <button
    id="test-toggle-audio-button"
    bind:this={audioButtonElement}
    onclick={onToggleAudio}
    oncontextmenu={(e) => {
      e.preventDefault();
      onContextMenu('audio', e);
    }}
    ontouchstart={(e) => handleTouchStart('audio', e)}
    ontouchend={handleTouchEnd}
    ontouchmove={handleTouchMove}
    class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto"
    class:bg-blue-600={isAudioEnabled}
    style={isAudioEnabled
      ? `background: linear-gradient(0deg, rgb(59 130 246) ${instant}%, white ${instant}%)`
      : ''}
  >
    {isAudioEnabled ? '🎤' : '🔇'}
    <!-- Microphone -->
  </button>
  <button
    id="test-toggle-video-button"
    bind:this={videoButtonElement}
    onclick={onToggleVideo}
    oncontextmenu={(e) => {
      e.preventDefault();
      onContextMenu('camera', e);
    }}
    ontouchstart={(e) => handleTouchStart('camera', e)}
    ontouchend={handleTouchEnd}
    ontouchmove={handleTouchMove}
    class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto"
    class:bg-blue-600={isCameraEnabled}
  >
    {isCameraEnabled ? '🎥' : '📷'}
    <!-- Video Camera -->
  </button>
  <button
    id="test-toggle-screen-button"
    onclick={onToggleScreen}
    class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto"
    class:bg-blue-600={isScreenSharing}
  >
    🖥️ <!-- Monitor for Share Screen -->
  </button>
  <button
    id="test-start-forward-button"
    onclick={onToggleForward}
    class="text-white p-3 rounded-full pointer-events-auto"
    class:bg-red-500={allowedHosts.length > 0}
    class:hover:bg-red-600={allowedHosts.length > 0}
    class:hover:bg-blue-700={!(allowedHosts.length > 0)}
    class:bg-blue-500={forwardHost?.length}
  >
    {allowedHosts.length > 0 ? '⏹️' : '⏩'}
  </button>
  {#if supportsVideoCaptureStream}
    <button
      id="test-share-video-button"
      onclick={() => {
        if (isVideoShared) {
          onStopSharingVideo();
        } else {
          uploadVideoElement.click();
        }
      }}
      class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto"
      class:bg-blue-600={isVideoShared}
    >
      📹 <!-- Share Video -->
    </button>
  {/if}
  <button
    id="test-record-button"
    onclick={onRecord}
    class="hover:bg-blue-700 text-white p-3 rounded-full pointer-events-auto"
    class:bg-red-600={isRecording}
  >
    {isRecording ? '⏹' : '⏺'}
  </button>
  <button
    id="test-hangup-button"
    onclick={hangup}
    class="hover:bg-red-600 bg-red-500 text-white p-3 rounded-full pointer-events-auto"
  >
    📞
  </button>
  <input
    bind:this={uploadVideoElement}
    type="file"
    onchange={onVideoUpload}
    accept="video/*"
    class="hidden"
  />
</div>
