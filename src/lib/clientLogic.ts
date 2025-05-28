import type { AppLogic, AppLogicContext } from './appLogic';
/// <reference path="../../../types/global.d.ts" />
import { getDirectClient } from './stores/connectionStore';
import { get } from 'svelte/store';
import { getAllConfig } from './stores/configStore';
import { compress, decompress } from './utils/sdpCompress';

export class ClientLogic implements AppLogic {
  private context: AppLogicContext;

  constructor(context: AppLogicContext) {
    this.context = context;
  }

  async initialize(urlParams: URLSearchParams): Promise<void> {
    const { webRTCApp, appStateStore, broadcastManuallyEnteredAnswer } = this.context;
    // decompress, config, getDirectClient are now imported directly
    console.log('client logic initialize');
    console.trace();

    if (!urlParams.get('offer') && !urlParams.get('answer')) {
      appStateStore.update((s) => ({ ...s, currentOfferCid: null }));
      const { offerCid } = await this.prepareOfferForClientModeDisplay();
      appStateStore.update((currentVal) => ({ ...currentVal, initialOverlayShown: true }));
      if (offerCid) {
        const bc = new BroadcastChannel('manual_rtc');
        bc.onmessage = async (event) => {
          const data = event.data;
          if (typeof data === 'object' && data !== null && data.offer && data.answer) {
            console.log('Received matching answer via broadcast channel for offer:', data.offer);
            // Ensure the offer matches the one this client instance is holding, if applicable
            // This check might need refinement based on how offerCid is managed across tabs for the *same* offer
            const currentContextOfferCid = get(appStateStore).currentOfferCid;
            if (data.offerCid && currentContextOfferCid !== data.offerCid) {
              console.warn('Broadcast answer is for a different offer CID. Ignoring.');
              // bc.close(); // Close if we are sure this channel is only for one offer
              return;
            }

            const answer = await decompress(data.answer.trim()); // Using imported decompress
            const client = getDirectClient(offerCid); // Using imported getDirectClient
            if (client?.pc) {
              try {
                await client.pc.setRemoteDescription({ type: 'answer', sdp: answer.trim() + '\n' });
                console.log('Successfully set remote description from broadcast answer.');
                bc.close();
                appStateStore.update((s) => ({
                  ...s,
                  showCopyOverlay: false,
                  initialOverlayShown: false
                }));
              } catch (e) {
                console.error('Error setting remote description from broadcast answer:', e);
              }
            } else {
              console.warn('Client or PeerConnection not found when processing broadcast answer.');
            }
          } else {
            console.warn('Received broadcast message with non-matching/invalid offer. Ignoring.', {
              receivedData: data
            });
          }
        };
      }
    } else if (urlParams.get('answer')) {
      const answerParam = urlParams.get('answer');
      const offerParamForAnswer = urlParams.get('offer');
      if (answerParam && offerParamForAnswer) {
        // The broadcast should ideally include the offerCid to ensure correct matching on the receiver side.
        // For now, it broadcasts offer and answer strings.
        await broadcastManuallyEnteredAnswer(offerParamForAnswer, answerParam);
      }
      appStateStore.update((s) => ({
        ...s,
        showCopyOverlay: true,
        initialOverlayShown: true,
        copyText: 'Call started on another tab, please close this one',
        showCopyButton: false,
        showAcceptButton: false,
        showPasteText: false,
        showJoinButton: false
      }));
    } else if (urlParams.get('offer')) {
      const now = Date.now();
      const offerParam = urlParams.get('offer');
      if (offerParam) {
        const offer = await decompress(offerParam); // Using imported decompress
        appStateStore.update((currentVal) => ({
          ...currentVal,
          showCopyOverlay: true,
          initialOverlayShown: true,
          showAcceptButton: false, // When receiving an offer URL, we generate an answer to share
          showPasteText: false,
          showCopyButton: true // To copy the generated answer link
        }));

        let answererCid: string;
        answererCid = await webRTCApp.getAnswer(
          offer,
          async (candidate: RTCIceCandidateInit | null) => {
            if (Date.now() - now > 10 * 1000) {
              return;
            }
            if (!answererCid) return; // Ensure answererCid is set
            const client = getDirectClient(answererCid); // Using imported getDirectClient
            const sdp = client?.pc?.localDescription?.sdp;
            if (sdp) {
              const compressedAnswer = await compress(sdp); // Using imported compress
              const answerUrlParams = new URLSearchParams(window.location.search); // Preserves original offer
              answerUrlParams.set('answer', compressedAnswer);
              const currentConfig = getAllConfig(); // Using imported getAllConfig
              const newUrl =
                (currentConfig.general.configHost || window.location.origin) +
                window.location.pathname +
                '?' +
                answerUrlParams.toString();

              appStateStore.update((currentVal) => ({
                ...currentVal,
                qrCodeUrl: newUrl,
                copyText: compressedAnswer
              }));
              history.replaceState('', '', newUrl);
            }
          },
          { sid: '' }
        );
        // Store this CID if needed, though it's for an incoming offer handling
        // appStateStore.update(s => ({ ...s, currentOfferCid: answererCid })); // This might be confusing; currentOfferCid is for *outgoing* offers.
      }
    }
  }

  async prepareOfferForClientModeDisplay(): Promise<{
    offerCid: string | null;
    newCompressedOffer: string | null;
  }> {
    const { webRTCApp, appStateStore } = this.context;
    // getDirectClient, compress, config (via getAllConfig) are now imported directly
    const { currentOfferCid: existingOfferCid } = get(appStateStore); // Renamed to avoid conflict

    const currentOfferClient = existingOfferCid ? getDirectClient(existingOfferCid) : null; // Using imported getDirectClient
    if (existingOfferCid && currentOfferClient?.pc?.connectionState === 'new') {
      // 'new' implies offer made, no answer yet
      appStateStore.update((currentVal) => ({
        ...currentVal,
        showCopyOverlay: true,
        showAcceptButton: true,
        showPasteText: true,
        showCopyButton: true, // To copy the offer link
        showJoinButton: false
        // qrCodeUrl and copyText should be preserved from previous generation
      }));
      return { offerCid: existingOfferCid, newCompressedOffer: null };
    }

    const now = Date.now();
    appStateStore.update((currentVal) => ({
      ...currentVal,
      showAcceptButton: true,
      showPasteText: true,
      showCopyButton: true,
      showJoinButton: false,
      qrCodeUrl: '',
      copyText: '',
      showCopyOverlay: true // Show overlay while generating
    }));

    let newCidForOffer: string | null = null; // Renamed for clarity
    let compressedOfferForReturn: string | null = null;

    newCidForOffer = await webRTCApp.getOffer(
      async (candidate: RTCIceCandidateInit | null) => {
        if (Date.now() - now > 10 * 1000) {
          return;
        }
        if (!newCidForOffer) return;
        const client = getDirectClient(newCidForOffer); // Using imported getDirectClient
        const sdp = client?.pc?.localDescription?.sdp;
        if (sdp) {
          const compressed = await compress(sdp); // Using imported compress
          compressedOfferForReturn = compressed;
          const displayUrlParams = new URLSearchParams();
          displayUrlParams.set('offer', compressed);
          // Potentially add offerCid to URL for BroadcastChannel matching, though it makes URL longer
          // displayUrlParams.set('offerCid', newCidForOffer);
          const currentConfig = getAllConfig(); // Using imported getAllConfig
          const newUrlForOverlay =
            (currentConfig.general.configHost || window.location.origin) +
            window.location.pathname +
            '?' +
            displayUrlParams.toString();

          appStateStore.update((currentVal) => ({
            ...currentVal,
            qrCodeUrl: newUrlForOverlay,
            copyText: newUrlForOverlay
          }));
          history.replaceState(null, '', newUrlForOverlay); // Update URL to reflect the offer being displayed
        }
      },
      { sid: '' }
    );

    appStateStore.update((s) => ({ ...s, currentOfferCid: newCidForOffer }));
    return { offerCid: newCidForOffer, newCompressedOffer: compressedOfferForReturn };
  }

  async handleOpenQrRequest(urlParams: URLSearchParams): Promise<void> {
    const { appStateStore, appOnId } = this.context;
    const { copyText: currentCopyText } = get(appStateStore); // Get current copyText

    appStateStore.update((s) => ({ ...s, initialOverlayShown: false })); // QR requests are manual, not initial

    const offerInUrl = urlParams.get('offer');
    const answerInUrl = urlParams.get('answer');

    if (!offerInUrl && !answerInUrl) {
      // No offer/answer in URL, means we need to generate and display our offer.
      await this.prepareOfferForClientModeDisplay();
    } else {
      // Offer or answer (or both) is in URL. Display current URL.
      appOnId(); // This sets showCopyOverlay, copyText, qrCodeUrl based on current URL.
      appStateStore.update((currentVal) => ({
        ...currentVal,
        showCopyButton: true, // Default to show copy button for the URL
        showAcceptButton: false, // Not accepting an answer via QR click
        showPasteText: false, // Not pasting an answer via QR click
        showJoinButton: false // No joining in client mode
      }));
      // Special case: if the URL indicates "Call started on another tab"
      if (currentCopyText && currentCopyText.startsWith('Call started on another tab')) {
        appStateStore.update((s) => ({ ...s, showCopyButton: false }));
      }
    }
  }

  async acceptHandler(cidFromEvent: string | null, pasteValue: string): Promise<void> {
    const { appStateStore } = this.context;
    // decompress, getDirectClient are now imported directly
    const targetCid = cidFromEvent || get(appStateStore).currentOfferCid; // Use event CID or fallback to current app offer CID
    if (!pasteValue || !targetCid) {
      console.warn('Accept handler: Paste value or CID is missing.', { pasteValue, targetCid });
      return;
    }

    try {
      const answer = await decompress(pasteValue.trim()); // Using imported decompress
      const client = getDirectClient(targetCid); // Using imported getDirectClient
      if (client?.pc) {
        await client.pc.setRemoteDescription({ type: 'answer', sdp: answer.trim() + '\n' });
        console.log('Successfully set remote description from pasted answer for CID:', targetCid);
        appStateStore.update((s) => ({
          ...s,
          showCopyOverlay: false,
          initialOverlayShown: false
        })); // Hide overlay on success
      } else {
        console.warn(
          'Client or PeerConnection not found for CID:',
          targetCid,
          'when accepting pasted answer.'
        );
      }
    } catch (e) {
      console.error('Error processing pasted answer for CID:', targetCid, e);
    }
  }
}
