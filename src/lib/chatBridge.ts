// This file is a bridge to the refactored chat modules.
// Please update imports to point directly to the new locations.

export type { ChatState } from './stores/chatStore';
export { chatStore, getChatState, addMessage } from './stores/chatStore';
export { setupChatChannel } from './webrtc/chat/setupChatChannel';
export { sendChatMessage } from './webrtc/chat/sendChatMessage';
export { ChatHistory as ChatBridge } from './utils/ChatHistory'; // Renamed ChatBridge to ChatHistory for clarity
