export interface ViewableStream {
  id: string;
  streamKey: string;
  stream: MediaStream | null;
  type: 'camera' | 'screen' | 'audio' | 'file';
  isLocal: boolean;
  src: string | null;
  peerId?: string | null;
  audioStream?: MediaStream | null;
  hasAudio?: boolean | null;
}
