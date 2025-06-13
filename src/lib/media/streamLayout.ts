import { get } from 'svelte/store';
import { streamStore, type LayoutType } from '../stores/streamStore';
import { normalizeStreamId } from './stream';

/**
 * Calculate optimal layout for streams in a container
 */
export function calculateStreamLayout(
  containerWidth: number,
  containerHeight: number,
  streamCount: number
): { rows: number; cols: number } {
  if (streamCount === 0) {
    return { rows: 0, cols: 0 };
  }

  let rows: number;
  let cols: number;

  if (containerWidth >= containerHeight) {
    // Container is wide or square, prioritize columns
    cols = Math.ceil(Math.sqrt(streamCount * (containerWidth / containerHeight)));
    rows = Math.ceil(streamCount / cols);

    // Adjust columns down if possible
    if (cols > 1 && (cols - 1) * rows >= streamCount) {
      cols--;
    }
  } else {
    // Container is tall, prioritize rows
    rows = Math.ceil(Math.sqrt(streamCount * (containerHeight / containerWidth)));
    cols = Math.ceil(streamCount / rows);

    // Adjust rows down if possible
    if (rows > 1 && cols * (rows - 1) >= streamCount) {
      rows--;
    }
  }

  return { rows, cols };
}

export interface Position {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculate positions for streams in a grid layout
 */
export function calculateGridPositions(
  containerWidth: number,
  containerHeight: number,
  streams: Array<{ id: string; aspectRatio?: number }>
): Array<Position> {
  if (streams.length === 0) return [];

  // Calculate grid dimensions
  const { rows, cols } = calculateStreamLayout(containerWidth, containerHeight, streams.length);

  // Calculate cell dimensions
  const cellWidth = containerWidth / cols;
  const cellHeight = containerHeight / rows;

  // Position each stream
  return streams.map((stream, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    return {
      id: stream.id,
      x: col * cellWidth,
      y: row * cellHeight,
      width: cellWidth,
      height: cellHeight
    };
  });
}

/**
 * Calculate positions for streams in a focus layout
 */
export function calculateFocusPositions(
  containerWidth: number,
  containerHeight: number,
  focusedStreamId: string,
  streams: Array<{ id: string; aspectRatio?: number }>
): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  if (streams.length === 0) return [];

  const positions: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

  // Find the focused stream
  const focusedStream = streams.find((s) => s.id === focusedStreamId);
  if (!focusedStream) return calculateGridPositions(containerWidth, containerHeight, streams);

  // Other streams
  const otherStreams = streams.filter((s) => s.id !== focusedStreamId);

  // Calculate dimensions for the focused stream (takes 80% of the height)
  const focusedHeight = containerHeight * 0.8;
  const focusedWidth = containerWidth;

  // Add the focused stream position
  positions.push({
    id: focusedStreamId,
    x: 0,
    y: 0,
    width: focusedWidth,
    height: focusedHeight
  });

  // Calculate dimensions for other streams
  const otherHeight = containerHeight - focusedHeight;
  const otherWidth = containerWidth / Math.max(1, otherStreams.length);

  // Add positions for other streams
  otherStreams.forEach((stream, index) => {
    positions.push({
      id: stream.id,
      x: index * otherWidth,
      y: focusedHeight,
      width: otherWidth,
      height: otherHeight
    });
  });

  return positions;
}

/**
 * Calculate positions for streams in a presentation layout
 */
export function calculatePresentationPositions(
  containerWidth: number,
  containerHeight: number,
  presentationStreamId: string,
  streams: Array<{ id: string; aspectRatio?: number }>
): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  if (streams.length === 0) return [];

  const positions: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];

  // Find the presentation stream
  const presentationStream = streams.find((s) => s.id === presentationStreamId);
  if (!presentationStream) return calculateGridPositions(containerWidth, containerHeight, streams);

  // Other streams
  const otherStreams = streams.filter((s) => s.id !== presentationStreamId);

  // Calculate dimensions for the presentation stream (takes 80% of the width)
  const presentationWidth = containerWidth * 0.8;
  const presentationHeight = containerHeight;

  // Add the presentation stream position
  positions.push({
    id: presentationStreamId,
    x: 0,
    y: 0,
    width: presentationWidth,
    height: presentationHeight
  });

  // Calculate dimensions for other streams
  const otherWidth = containerWidth - presentationWidth;
  const otherHeight = containerHeight / Math.max(1, otherStreams.length);

  // Add positions for other streams
  otherStreams.forEach((stream, index) => {
    positions.push({
      id: stream.id,
      x: presentationWidth,
      y: index * otherHeight,
      width: otherWidth,
      height: otherHeight
    });
  });

  return positions;
}

/**
 * Calculate stream positions based on the current layout
 */
export function calculateStreamPositions(
  containerWidth: number,
  containerHeight: number,
  layout: LayoutType,
  focusedStreamId?: string
): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  const state = get(streamStore);

  // Group streams by peer ID to filter out audio streams that should be hidden
  const groupedStreams: Record<
    string,
    {
      peerId: string | null;
      streams: Array<{
        id: string;
        type: string;
        stream: MediaStream | null;
        src?: string | null;
        aspectRatio: number;
      }>;
    }
  > = {};

  // Add local streams
  const localPeerId = 'local';
  groupedStreams[localPeerId] = {
    peerId: null,
    streams: Object.entries(state.localStreams)
      .filter(([_, data]) => data.viewable)
      .map(([_, data]) => ({
        id: normalizeStreamId(data.stream?.id || data.src || ''),
        type: data.type,
        stream: data.stream,
        src: data.src,
        aspectRatio:
          data.src || !data.stream || data.stream.getVideoTracks().length > 0 ? 16 / 9 : 1
      }))
  };

  // Add remote streams
  Object.entries(state.remoteStreams).forEach(([peerId, data]) => {
    if (!groupedStreams[peerId]) {
      groupedStreams[peerId] = { peerId, streams: [] };
    }

    Object.entries(data.streams).forEach(([streamId, stream]) => {
      groupedStreams[peerId].streams.push({
        id: normalizeStreamId(stream.id),
        type: stream.getVideoTracks().length > 0 ? 'camera' : 'audio',
        stream,
        aspectRatio: stream.getVideoTracks().length > 0 ? 16 / 9 : 1
      });
    });
  });

  // Filter out audio streams that should be hidden (when a peer has video streams)
  const visibleStreams = Object.values(groupedStreams).flatMap(({ peerId, streams }) => {
    // Check if this peer has any video streams
    const hasVideoStreams = streams.some(
      (s) =>
        s.type === 'camera' ||
        s.type === 'blurred' ||
        s.type === 'screen' ||
        s.type === 'file' ||
        (s.stream && s.stream.getVideoTracks().length > 0)
    );

    if (hasVideoStreams) {
      // Only include video streams from this peer
      return streams.filter(
        (s) =>
          s.type !== 'audio' &&
          ((s.stream && s.stream?.getVideoTracks().length > 0) || s.type === 'file')
      );
    } else {
      // Include all streams from this peer
      return streams;
    }
  });

  // Convert to the format needed for layout calculations
  const activeStreams = visibleStreams.map((stream) => ({
    id: stream.id,
    aspectRatio: stream.aspectRatio
  }));

  // Calculate positions based on layout
  switch (layout) {
    case 'focus':
      if (focusedStreamId) {
        return calculateFocusPositions(
          containerWidth,
          containerHeight,
          focusedStreamId,
          activeStreams
        );
      }
      return calculateGridPositions(containerWidth, containerHeight, activeStreams);

    case 'presentation':
      // Find a screen share stream
      const screenStream = Object.entries(state.localStreams).find(
        ([_, data]) => data.viewable && data.type === 'screen'
      );

      if (screenStream) {
        const screenStreamId = normalizeStreamId(
          screenStream[1].stream?.id || screenStream[1].src || ''
        );
        return calculatePresentationPositions(
          containerWidth,
          containerHeight,
          screenStreamId,
          activeStreams
        );
      }
      return calculateGridPositions(containerWidth, containerHeight, activeStreams);

    case 'grid':
    default:
      return calculateGridPositions(containerWidth, containerHeight, activeStreams);
  }
}
