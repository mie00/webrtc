// This file is a bridge to the refactored file transfer modules.
// Please update imports to point directly to the new locations.

export type { FileTransfer, FileState } from './stores/fileStore';
export {
  fileStore,
  getFileState,
  addFileTransfer,
  updateFileTransfer,
  removeFileTransfer
} from './stores/fileStore';

export { splitArrayBuffer, getMaxMessageSizeFromSdp } from './utils/fileUtils';
export { setupFileChannel, sendFile } from './webrtc/file/fileTransfer';
