<script lang="ts">
  import StreamView from './StreamView.svelte';
  import type { ViewableStream } from '../types/viewableStream';

  let {
    activeStreams,
    streamPositions,
    onFocusStream,
    onFilePlay
  }: {
    activeStreams: ViewableStream[];
    streamPositions: Array<{ id: string; x: number; y: number; width: number; height: number }>;
    onFocusStream: (params: { streamId: string | undefined; peerId: string | null }) => void;
    onFilePlay: (event: Event) => Promise<void>;
  } = $props();
</script>

{#each activeStreams as stream (stream.id + (stream.audioStream?.id || ''))}
  {#if streamPositions.find((pos) => pos.id === stream.id)}
    {@const position = streamPositions.find((pos) => pos.id === stream.id)}
    <div
      class="stream-container absolute"
      id={stream.isLocal
        ? `test-local-video-${stream.streamKey}`
        : `test-remote-video-${stream.peerId}-${stream.id}`}
      style="left: {position?.x}px; top: {position?.y}px; width: {position?.width}px; height: {position?.height}px;"
    >
      <StreamView
        stream={stream.src ? null : stream.stream}
        useSlot={!!stream.src}
        type={!stream.stream || stream.stream.getVideoTracks().length > 0 ? 'video' : 'audio'}
        muted={stream.isLocal && stream.type !== 'file'}
        mirrored={stream.isLocal && (stream.type === 'camera' || stream.type === 'blurred')}
        peerId={stream.peerId}
        focus={onFocusStream}
        audioStream={stream.audioStream || undefined}
        hasAudio={stream.hasAudio || undefined}
      >
        {#if stream.type === 'file' && stream.src}
          <!-- svelte-ignore a11y_media_has_caption -->
          {#key stream.src}
            <video
              onloadeddata={onFilePlay}
              src={stream.src}
              autoplay
              controls
              loop
              class="w-full h-full object-contain"
            ></video>
          {/key}
        {/if}
      </StreamView>
    </div>
  {/if}
{/each}

<style>
  .stream-container {
    overflow: hidden;
    border-radius: 8px;
    transition: all 0.3s ease;
    padding: 4px;
  }
</style>
