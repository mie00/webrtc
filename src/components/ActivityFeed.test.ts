import { render, screen, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import ActivityFeed from './ActivityFeed.svelte';
import type { FeedItem } from './ActivityFeed.svelte'; // Import the type from the component itself
import type { CarouselMediaItem } from './MediaCarousel.svelte';

describe('ActivityFeed.svelte', () => {
  const mockLocalUserName = 'TestUserLocal';
  const mockOnOpenMediaCarousel = vi.fn();

  const defaultProps = {
    combinedFeed: [],
    localUserName: mockLocalUserName,
    showCompletedTranscriptions: true,
    onOpenMediaCarousel: mockOnOpenMediaCarousel,
  };

  it('renders empty state when combinedFeed is empty', () => {
    render(ActivityFeed, defaultProps);
    expect(screen.getByText('Messages and file transfers will appear here...')).toBeInTheDocument();
  });

  it('renders a chat message from local user', () => {
    const feed: FeedItem[] = [
      {
        id: 'chat1',
        type: 'chat',
        sender: mockLocalUserName,
        timestamp: Date.now(),
        text: 'Hello from local user',
      },
    ];
    render(ActivityFeed, { ...defaultProps, combinedFeed: feed });
    expect(screen.getByText('Hello from local user')).toBeInTheDocument();
    // Check for styling indicating local user (e.g., justify-end on the container)
    const messageContainer = screen.getByText('Hello from local user').closest('.flex');
    expect(messageContainer).toHaveClass('justify-end');
  });

  it('renders a chat message from remote user', () => {
    const feed: FeedItem[] = [
      {
        id: 'chat2',
        type: 'chat',
        sender: 'RemoteUser',
        timestamp: Date.now(),
        text: 'Hello from remote user',
        cid: 'remoteCID123',
      },
    ];
    render(ActivityFeed, { ...defaultProps, combinedFeed: feed });
    expect(screen.getByText('Hello from remote user')).toBeInTheDocument();
    const messageContainer = screen.getByText('Hello from remote user').closest('.flex');
    expect(messageContainer).toHaveClass('justify-start');
  });

  it('renders a file transfer item with download and view links for completed files', () => {
    const feed: FeedItem[] = [
      {
        id: 'file1',
        type: 'file',
        sender: 'RemoteUser',
        timestamp: Date.now(),
        cid: 'remoteCIDFile',
        transfer: {
          name: 'testfile.txt',
          type: 'text/plain',
          size: 1024,
          status: 'complete',
          progress: 100,
          isLocal: false,
          url: 'blob:http://localhost/some-uuid',
        },
      },
    ];
    render(ActivityFeed, { ...defaultProps, combinedFeed: feed });
    expect(screen.getByText('testfile.txt')).toBeInTheDocument();
    expect(screen.getByTestId('download-link')).toBeInTheDocument();
    expect(screen.getByTestId('view-link')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders a file transfer item with progress bar for in-progress files', () => {
    const feed: FeedItem[] = [
      {
        id: 'file2',
        type: 'file',
        sender: mockLocalUserName, // Local sending
        timestamp: Date.now(),
        transfer: {
          name: 'bigfile.zip',
          type: 'application/zip',
          size: 102400,
          status: 'sending',
          progress: 50,
          isLocal: true,
        },
      },
    ];
    render(ActivityFeed, { ...defaultProps, combinedFeed: feed });
    expect(screen.getByText('bigfile.zip')).toBeInTheDocument();
    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Sending...')).toBeInTheDocument();
  });

  it('renders a transcription segment', () => {
    const feed: FeedItem[] = [
      {
        id: 'trans1',
        type: 'transcription',
        sender: 'Speaker1 (local|sessionABC)', // Example sender format for transcription
        timestamp: Date.now(),
        segment: {
          sessionId: 'local|sessionABC',
          text: 'This is a transcribed segment.',
          beg: 0,
          end: 5000,
          final: true,
        },
      },
    ];
    render(ActivityFeed, { ...defaultProps, combinedFeed: feed });
    expect(screen.getByText('This is a transcribed segment.')).toBeInTheDocument();
    expect(screen.getByTestId('transcription-segment')).toBeInTheDocument();
  });

  it('hides transcription segment if showCompletedTranscriptions is false', () => {
    const feed: FeedItem[] = [
      {
        id: 'trans2',
        type: 'transcription',
        sender: 'Speaker2',
        timestamp: Date.now(),
        segment: {
          sessionId: 'remote|sessionXYZ',
          text: 'Another transcribed segment.',
          beg: 0,
          end: 3000,
          final: true,
        },
      },
    ];
    render(ActivityFeed, { ...defaultProps, combinedFeed: feed, showCompletedTranscriptions: false });
    expect(screen.queryByText('Another transcribed segment.')).not.toBeInTheDocument();
  });

  it('calls onOpenMediaCarousel when a playable video item is clicked', async () => {
    const videoFileItem: FeedItem = {
      id: 'videoFile1',
      type: 'file',
      sender: 'VideoSender',
      timestamp: Date.now(),
      transfer: {
        name: 'coolvideo.mp4',
        type: 'video/mp4',
        size: 5000000,
        status: 'complete',
        progress: 100,
        isLocal: false,
        url: 'blob:http://localhost/video-uuid',
      },
      cid: 'videoCID',
    };
    render(ActivityFeed, { ...defaultProps, combinedFeed: [videoFileItem] });

    const videoElementContainer = screen.getByLabelText(`View video: ${videoFileItem.transfer!.name}`);
    await fireEvent.click(videoElementContainer);

    expect(mockOnOpenMediaCarousel).toHaveBeenCalledTimes(1);
    const expectedCarouselItem: CarouselMediaItem = {
      id: videoFileItem.id,
      type: 'file',
      sender: videoFileItem.sender,
      timestamp: videoFileItem.timestamp,
      transfer: videoFileItem.transfer as any, // Cast because of specific type in CarouselMediaItem
      cid: videoFileItem.cid,
    };
    expect(mockOnOpenMediaCarousel).toHaveBeenCalledWith(expect.objectContaining(expectedCarouselItem));
  });

  // Add more tests for image clicks, different file statuses, error states, etc.
});
