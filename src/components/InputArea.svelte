<script lang="ts">
  import { tick } from 'svelte';
  import { sendChatMessage } from '../lib/webrtc/chat/sendChatMessage';
  import { sendFile } from '../lib/webrtc/file/fileTransfer';
  import type { FileTransfer } from '../lib/stores/fileStore';
  import { transcriberStore, transcriptionDisplayStore } from '../lib/media/transcriber';
  import { profileStore } from '../lib/stores/profileStore';

  // --- Types for Staged Files ---
  // Moved from ControlPanel.svelte
  interface StagedFile {
    id: string;
    file: File;
    thumbnailUrl: string | null; // URL for image previews (Data URL)
  }

  let {
    isPanelOpen,
    onSentSomething,
    showCompletedTranscriptions,
    onToggleShowCompletedTranscriptions
  } = $props<{
    isPanelOpen: boolean;
    onSentSomething: () => void;
    showCompletedTranscriptions: boolean;
    onToggleShowCompletedTranscriptions: () => void;
  }>();

  let message = $state('');
  let stagedFiles = $state<StagedFile[]>([]);
  let isSending = $state(false); // To disable input/buttons during send operation
  let chatInput: HTMLInputElement | null = $state(null);
  let uploadField: HTMLInputElement | null = $state(null);

  // --- Helper Functions for Staged Files ---
  // Moved from ControlPanel.svelte
  function generateThumbnailUrl(file: File): Promise<string | null> {
    return new Promise((resolve) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => resolve(null); // Fallback if reading fails
        reader.readAsDataURL(file);
      } else {
        resolve(null); // No thumbnail for non-images, UI can use a generic icon
      }
    });
  }

  // Moved from ControlPanel.svelte
  function uuidv4(): string {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
      (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)
    );
  }

  // Moved from ControlPanel.svelte
  async function addFilesToStaging(files: FileList | null) {
    if (!files || files.length === 0 || isSending) return;

    const newStagedFileEntries: StagedFile[] = [];
    for (const file of Array.from(files)) {
      const thumbnailUrl = await generateThumbnailUrl(file);
      newStagedFileEntries.push({ id: uuidv4(), file, thumbnailUrl });
    }
    stagedFiles = [...stagedFiles, ...newStagedFileEntries];

    if (chatInput) {
      chatInput.focus();
    }
  }

  // Moved from ControlPanel.svelte
  function removeStagedFile(fileIdToRemove: string) {
    stagedFiles = stagedFiles.filter((sf) => sf.id !== fileIdToRemove);
  }

  // Event handlers
  // Moved from ControlPanel.svelte
  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !isSending) {
      event.preventDefault();
      triggerSend();
    }
  }

  // Moved from ControlPanel.svelte
  async function triggerSend() {
    if (isSending) return;
    if (!message.trim() && stagedFiles.length === 0) return;

    isSending = true;
    let successfullySentSomething = false;

    try {
      if (message.trim()) {
        const senderName = $profileStore.userName || 'You';
        await sendChatMessage(message.trim(), senderName);
        message = '';
        successfullySentSomething = true;
      }

      if (stagedFiles.length > 0) {
        const filesToSend = [...stagedFiles];
        stagedFiles = [];

        for (const stagedFileObj of filesToSend) {
          await sendFile(stagedFileObj.file);
        }
        successfullySentSomething = true;
      }
    } catch (error) {
      console.error('Error sending message or files:', error);
    } finally {
      isSending = false;
      if (successfullySentSomething) {
        onSentSomething(); // Notify parent
      }
      await tick();
      if (isPanelOpen && chatInput) {
        chatInput.focus();
      }
    }
  }

  // Moved from ControlPanel.svelte
  async function stageFilesFromInput(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      await addFilesToStaging(input.files);
      input.value = '';
    }
  }

  // Moved from ControlPanel.svelte
  async function handlePaste(event: ClipboardEvent) {
    if (isSending) return;

    const pastedFiles = event.clipboardData?.files;
    if (pastedFiles && pastedFiles.length > 0) {
      event.preventDefault();
      await addFilesToStaging(pastedFiles);
    }
  }

  // Effect for focusing chatInput when panel opens (if needed, or parent handles)
  // This was part of togglePanel before, now local to input if desired
  $effect(() => {
    if (isPanelOpen && chatInput) {
      chatInput.focus();
    }
  });
</script>

<!-- Staging Area for Files -->
{#if stagedFiles.length > 0}
  <div class="px-4 pt-2 space-y-2 max-h-48 overflow-y-auto border-t border-b border-gray-300">
    <h4 class="text-xs font-semibold text-gray-600 uppercase">Files to send:</h4>
    {#each stagedFiles as stagedFile (stagedFile.id)}
      <div class="flex items-center justify-between p-1.5 bg-gray-50 rounded shadow-sm text-sm">
        <div class="flex items-center space-x-2 overflow-hidden min-w-0">
          {#if stagedFile.thumbnailUrl}
            <img
              src={stagedFile.thumbnailUrl}
              alt="Preview"
              class="w-10 h-10 object-cover rounded border border-gray-200"
            />
          {:else}
            <div
              class="w-10 h-10 flex items-center justify-center bg-gray-200 rounded border border-gray-300"
            >
              <svg class="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20"
                ><path
                  d="M9 2a2 2 0 00-2 2v8l-3 3v2h12v-2l-3-3V4a2 2 0 00-2-2H9zm7 11h-2v2h2v-2zm-4 0H8v2h4v-2zM7 2H5v2h2V2z"
                ></path></svg
              >
            </div>
          {/if}
          <span class="truncate text-gray-700" title={stagedFile.file.name}
            >{stagedFile.file.name}</span
          >
        </div>
        <button
          type="button"
          disabled={isSending}
          aria-label="remove file"
          onclick={() => removeStagedFile(stagedFile.id)}
          class="text-red-500 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed p-1 ml-2 flex-shrink-0"
          title="Remove file"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"
            ><path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            ></path></svg
          >
        </button>
      </div>
    {/each}
  </div>
{/if}

<!-- Pending Transcriptions Area - Always shown if active and has content -->
{#if $transcriberStore.isTranscribingOverall && Object.values($transcriptionDisplayStore.activeBuffers).some((b) => b.text && b.text.length > 0)}
  <div
    class="pending-transcriptions px-4 py-2 text-xs text-gray-500 border-t border-gray-300 bg-gray-50"
  >
    {#each Object.values($transcriptionDisplayStore.activeBuffers) as buffer (buffer.sessionId)}
      {#if buffer.text && buffer.text.length > 0}
        <div class="py-0.5" data-testid="pending-transcription-buffer">
          <span class="font-semibold">{buffer.speakerLabel} (speaking...):</span>
          <span class="ml-1 italic">{buffer.text}</span>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<!-- Message Input and Upload Button (Remains at the bottom) -->
<div class="flex items-center space-x-2 p-4 border-t border-gray-300 mt-auto bg-gray-100">
  <input
    id="test-chat-input"
    type="text"
    placeholder="Type message..."
    bind:value={message}
    bind:this={chatInput}
    disabled={isSending}
    class="flex-1 border border-gray-300 px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
    onkeypress={handleKeyPress}
    onpaste={handlePaste}
  />
  <div class="relative">
    <!-- Use relative positioning for the button container -->
    <button
      id="test-attach-file-button"
      type="button"
      disabled={isSending}
      onclick={() => uploadField?.click()}
      class="cursor-pointer text-white px-3 py-2 rounded-md text-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      class:bg-blue-500={!isSending}
      class:bg-gray-500={isSending}
      title={!isSending ? 'Attach file' : 'Sending...'}>📎</button
    >
    {#if $transcriptionDisplayStore.segments.length}
      <button
        type="button"
        onclick={onToggleShowCompletedTranscriptions}
        class="text-white px-3 py-2 rounded-md text-lg hover:opacity-80"
        class:bg-blue-500={showCompletedTranscriptions}
        class:bg-gray-400={!showCompletedTranscriptions}
        title={showCompletedTranscriptions
          ? 'Hide Transcriptions from Feed'
          : 'Show Transcriptions in Feed'}
        aria-label={showCompletedTranscriptions
          ? 'Hide Transcriptions from Feed'
          : 'Show Transcriptions in Feed'}
      >
        {showCompletedTranscriptions ? '📜' : '📝'}
        <!-- Icons for showing/hiding feed transcripts -->
      </button>
    {/if}
    <input
      id="test-file-upload"
      type="file"
      multiple
      disabled={isSending}
      class="hidden"
      onchange={stageFilesFromInput}
      bind:this={uploadField}
    />
  </div>
</div>
