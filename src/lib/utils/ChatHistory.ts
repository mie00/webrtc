import type { ChatState } from '../stores/chatStore'; // Adjusted path

export class ChatHistory {
  private chatHistory: ChatState['messages'];

  constructor() {
    this.chatHistory = [];
  }

  getChatHistory(): ChatState['messages'] {
    return [...this.chatHistory];
  }

  addMessageToHistory(message: ChatState['messages'][0]): void {
    this.chatHistory.push(message);
  }

  clearChatHistory(): void {
    this.chatHistory = [];
  }

  // Placeholder for context if needed later
  // setContext(context: any) {
  //   // this.context = context;
  // }
}
