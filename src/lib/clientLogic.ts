import type { AppLogic, AppLogicContext, AppLogicState } from './appLogic.js';
/// <reference path="../../../types/global.d.ts" />
// import { connectionStore } from '../stores/connectionStore'; // For direct $connectionStore access if needed

export class ClientLogic implements AppLogic {
  private context: AppLogicContext;
  private soundIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(context: AppLogicContext) {
    this.context = context;
  }

  private stopSoundNegotiationLogic(): void {
    if (this.soundIntervalId) {
      clearInterval(this.soundIntervalId);
      this.soundIntervalId = null;
    }
    // TODO: Implement actual sound stopping (playback and listening)
    console.log("Sound negotiation stopped.");
    this.context.setState({ soundNegotiationActive: false });
  }

  async initialize(urlParams: URLSearchParams): Promise<void> {
    const { webRTCApp, decompress, setState, broadcastManuallyEnteredAnswer, config, getDirectClient, getState } = this.context;
    console.log("client logic initialize");

    const isFromSoundNego = urlParams.get('sound_nego_source') === 'true';

    if (isFromSoundNego && getState().soundNegotiationActive) {
        // If we landed here due to sound negotiation, ensure the mode is considered active for this page load.
        // This might already be true if App.svelte preserves state across soft navigations, but explicit is safer.
        setState({ soundNegotiationActive: true });
    }

    if (!urlParams.get('offer') && !urlParams.get('answer')) {
      setState({ currentOfferCid: null, soundNegotiationActive: false }); // Ensure sound negotiation is off if starting fresh
      const { offerCid } = await this.prepareOfferForClientModeDisplay();
      setState(currentVal => ({ ...currentVal, initialOverlayShown: true }));
      if (offerCid && !isFromSoundNego) { // Only set up broadcast channel if not in sound negotiation context
        const bc = new BroadcastChannel("manual_rtc");
        bc.onmessage = async (event) => {
          const data = event.data;
          if (typeof data === 'object' && data !== null && data.offer && data.answer) {
            console.log("Received matching answer via broadcast channel for offer:", data.offer);
            // Ensure the offer matches the one this client instance is holding, if applicable
            // This check might need refinement based on how offerCid is managed across tabs for the *same* offer
            const currentContextOfferCid = this.context.getState().currentOfferCid;
            if (data.offerCid && currentContextOfferCid !== data.offerCid) {
                 console.warn("Broadcast answer is for a different offer CID. Ignoring.");
                 // bc.close(); // Close if we are sure this channel is only for one offer
                 return;
            }

            const answer = await decompress(data.answer.trim());
            const client = getDirectClient(offerCid); // Use offerCid from when the offer was made
            if (client?.pc) {
              try {
                await client.pc.setRemoteDescription({ type: "answer", sdp: answer.trim() + '\n' });
                console.log("Successfully set remote description from broadcast answer.");
                bc.close();
                setState({ showCopyOverlay: false, initialOverlayShown: false });
              } catch (e) {
                console.error("Error setting remote description from broadcast answer:", e);
              }
            } else {
              console.warn("Client or PeerConnection not found when processing broadcast answer.");
            }
          } else {
            console.warn("Received broadcast message with non-matching/invalid offer. Ignoring.", { receivedData: data });
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
      setState({
        showCopyOverlay: true,
        initialOverlayShown: true,
        copyText: 'Call started on another tab, please close this one',
        showCopyButton: false,
        showAcceptButton: false,
        showPasteText: false,
        showJoinButton: false,
      });
    } else if (urlParams.get('offer')) {
      const now = Date.now();
      const offerParam = urlParams.get('offer');
      if (offerParam) {
        const offer = await decompress(offerParam);
        
        if (isFromSoundNego) {
            setState(currentVal => ({
                ...currentVal,
                showCopyOverlay: true,
                initialOverlayShown: true,
                copyText: 'Received offer via sound. Generating and transmitting answer via sound...',
                qrCodeUrl: '', // No QR code needed
                showAcceptButton: false,
                showPasteText: false,
                showCopyButton: false,
                soundNegotiationActive: true, // Explicitly set
            }));
        } else {
            setState(currentVal => ({
              ...currentVal,
              showCopyOverlay: true,
              initialOverlayShown: true,
              showAcceptButton: false, // When receiving an offer URL, we generate an answer to share
              showPasteText: false,
              showCopyButton: true, // To copy the generated answer link
            }));
        }
        
        let answererCid: string; 
        answererCid = await webRTCApp.getAnswer(offer, async (candidate: RTCIceCandidateInit | null) => {
          if (Date.now() - now > 10 * 1000 && !isFromSoundNego) { return; } // Timeout for non-sound nego
          if (!answererCid) return; 
          const client = getDirectClient(answererCid);
          const sdp = client?.pc?.localDescription?.sdp;
          if (sdp) {
            const compressedAnswer = await this.context.compress(sdp);
            if (isFromSoundNego) {
              console.log("Sound Nego: Playing answer via sound:", compressedAnswer);
              // TODO: Implement playSound(compressedAnswer)
              // After playing, the original offerer should pick this up.
              // The connection will establish, then onconnectionstatechange 'connected' could stop sound.
              // For now, we might leave soundNegotiationActive true until explicitly stopped or connection forms.
              setState({ copyText: "Transmitting answer via sound. Listening for connection..." });
            } else {
              const answerUrlParams = new URLSearchParams(window.location.search); 
              answerUrlParams.set('answer', compressedAnswer);
              const newUrl = (config.general.configHost || window.location.origin) + window.location.pathname + '?' + answerUrlParams.toString();
              setState(currentVal => ({
                  ...currentVal,
                  qrCodeUrl: newUrl,
                  copyText: compressedAnswer,
              }));
              history.replaceState('', '', newUrl);
            }
          }
        }, { sid: '' }); 
      }
    }
  }

  setConfig(config: Readonly<AppLogicContext['config']>): void {
    this.context.config = config;
  }

  async prepareOfferForClientModeDisplay(): Promise<{ offerCid: string | null, newCompressedOffer: string | null }> {
    const { webRTCApp, getState, setState, getDirectClient, compress, config } = this.context;
    const { currentOfferCid: existingOfferCid } = getState(); // Renamed to avoid conflict
    
    const currentOfferClient = existingOfferCid ? getDirectClient(existingOfferCid) : null;
    if (existingOfferCid && currentOfferClient?.pc?.connectionState === 'new') { // 'new' implies offer made, no answer yet
        setState(currentVal => ({
            ...currentVal,
            showCopyOverlay: true,
            showAcceptButton: true,
            showPasteText: true,
            showCopyButton: true, // To copy the offer link
            showJoinButton: false,
            // qrCodeUrl and copyText should be preserved from previous generation
        }));
      return { offerCid: existingOfferCid, newCompressedOffer: null };
    }

    const now = Date.now();
    setState(currentVal => ({
        ...currentVal,
        showAcceptButton: true,
        showPasteText: true,
        showCopyButton: true,
        showJoinButton: false,
        qrCodeUrl: '', 
        copyText: '',  
        showCopyOverlay: true, // Show overlay while generating
    }));

    let newCidForOffer: string | null = null; // Renamed for clarity
    let compressedOfferForReturn: string | null = null;

    newCidForOffer = await webRTCApp.getOffer(async (candidate: RTCIceCandidateInit | null) => {
      if (Date.now() - now > 10 * 1000) { return; }
      if (!newCidForOffer) return; 
      const client = getDirectClient(newCidForOffer);
      const sdp = client?.pc?.localDescription?.sdp;
      if (sdp) {
        const compressed = await compress(sdp);
        compressedOfferForReturn = compressed;
        const displayUrlParams = new URLSearchParams();
        displayUrlParams.set('offer', compressed);
        // Potentially add offerCid to URL for BroadcastChannel matching, though it makes URL longer
        // displayUrlParams.set('offerCid', newCidForOffer); 
        const newUrlForOverlay = (config.general.configHost || window.location.origin) + window.location.pathname + '?' + displayUrlParams.toString();
        
        setState(currentVal => ({
            ...currentVal,
            qrCodeUrl: newUrlForOverlay,
            copyText: newUrlForOverlay,
        }));
        history.replaceState(null, '', newUrlForOverlay); // Update URL to reflect the offer being displayed
      }
    }, { sid: '' }); 
    
    setState({ currentOfferCid: newCidForOffer });
    return { offerCid: newCidForOffer, newCompressedOffer: compressedOfferForReturn };
  }

  async handleOpenQrRequest(urlParams: URLSearchParams): Promise<void> {
    const { setState, appOnId, getState } = this.context;
    const { copyText: currentCopyText } = getState(); // Get current copyText

    setState({ initialOverlayShown: false }); // QR requests are manual, not initial

    const offerInUrl = urlParams.get('offer');
    const answerInUrl = urlParams.get('answer');

    if (!offerInUrl && !answerInUrl) {
      // No offer/answer in URL, means we need to generate and display our offer.
      await this.prepareOfferForClientModeDisplay();
    } else {
      // Offer or answer (or both) is in URL. Display current URL.
      appOnId(); // This sets showCopyOverlay, copyText, qrCodeUrl based on current URL.
      setState(currentVal => ({
        ...currentVal,
        showCopyButton: true, // Default to show copy button for the URL
        showAcceptButton: false, // Not accepting an answer via QR click
        showPasteText: false,  // Not pasting an answer via QR click
        showJoinButton: false, // No joining in client mode
      }));
      // Special case: if the URL indicates "Call started on another tab"
      if (currentCopyText && currentCopyText.startsWith('Call started on another tab')) {
        setState({ showCopyButton: false });
      }
    }
  }

  async acceptHandler(cidFromEvent: string | null, pasteValue: string): Promise<void> {
    const { decompress, getDirectClient, setState, getState } = this.context;
    const targetCid = cidFromEvent || getState().currentOfferCid; // Use event CID or fallback to current app offer CID
    if (!pasteValue || !targetCid) {
      console.warn("Accept handler: Paste value or CID is missing.", { pasteValue, targetCid });
      return;
    }

    try {
      const answer = await decompress(pasteValue.trim());
      const client = getDirectClient(targetCid);
      if (client?.pc) {
        await client.pc.setRemoteDescription({ type: "answer", sdp: answer.trim() + '\n' });
        console.log("Successfully set remote description from pasted answer for CID:", targetCid);
        setState({ showCopyOverlay: false, initialOverlayShown: false }); 
        if (getState().soundNegotiationActive) {
            this.stopSoundNegotiationLogic();
            // UI should update to reflect connection, overlay already hidden.
        }
      } else {
        console.warn("Client or PeerConnection not found for CID:", targetCid, "when accepting pasted answer.");
      }
    } catch (e) {
      console.error("Error processing pasted answer for CID:", targetCid, e);
    }
  }

  handleToggleSoundNegotiation(): void {
    const { setState, getState } = this.context;
    const currentSoundState = getState().soundNegotiationActive;

    if (currentSoundState) {
      this.stopSoundNegotiationLogic();
      setState({ copyText: "Sound negotiation stopped.", showCopyOverlay: true, initialOverlayShown: false });
      setTimeout(() => setState({ showCopyOverlay: false }), 2000); // Briefly show status
    } else {
      setState({ soundNegotiationActive: true, showCopyOverlay: true, initialOverlayShown: false, copyText: "Starting sound negotiation... Playing offer and listening..." });
      
      // TODO: Start actual sound listening: startListeningSound(this.processSoundData.bind(this))
      console.log("Sound Nego: Started listening for sound.");

      const performOfferCycle = async () => {
        if (!getState().soundNegotiationActive) return; // Stop if deactivated

        console.log("Sound Nego: Preparing and playing offer via sound.");
        // Use prepareOfferForClientModeDisplay to generate and set offer URL in state
        // It internally calls setState for qrCodeUrl and copyText
        await this.prepareOfferForClientModeDisplay();
        const offerUrlToPlay = getState().qrCodeUrl;

        if (offerUrlToPlay) {
          console.log("Sound Nego: Playing offer URL via sound:", offerUrlToPlay);
          // TODO: Implement playSound(offerUrlToPlay)
          setState({copyText: `Playing offer, listening... (${new Date().toLocaleTimeString()})`, qrCodeUrl: offerUrlToPlay});
        } else {
          console.warn("Sound Nego: No offer URL generated to play.");
           setState({copyText: `Failed to generate offer. Retrying...`});
        }
      };

      performOfferCycle(); // Initial cycle
      this.soundIntervalId = setInterval(performOfferCycle, 10000); // Repeat every 10 seconds
    }
  }

  async processSoundData(data: string): Promise<void> {
    const { getState } = this.context;
    console.log("Sound Nego: Received data via sound:", data);

    if (!getState().soundNegotiationActive) {
      console.log("Sound Nego: Ignoring sound data as negotiation is not active.");
      return;
    }

    // Heuristic: if it looks like a URL, it's an offer. Otherwise, assume it's an answer.
    // This needs to be robust in a real implementation (e.g., prefix data with type).
    if (data.startsWith('http://') || data.startsWith('https://') || data.startsWith(this.context.config.general.configHost || window.location.origin)) {
      console.log("Sound Nego: Interpreted sound data as an offer URL. Navigating...");
      this.stopSoundNegotiationLogic(); // Stop current activities before navigating
      // Append a parameter to indicate the source for the next page load
      const navUrl = data + (data.includes('?') ? '&' : '?') + 'sound_nego_source=true';
      window.location.href = navUrl;
    } else {
      // Assuming it's an answer (compressed SDP)
      console.log("Sound Nego: Interpreted sound data as an answer. Attempting to accept...");
      const currentOfferCid = getState().currentOfferCid;
      if (currentOfferCid) {
        await this.acceptHandler(currentOfferCid, data);
        // acceptHandler will call stopSoundNegotiationLogic on success if soundNegotiationActive is true
      } else {
        console.warn("Sound Nego: Received an answer via sound, but no current offer CID is set.");
      }
    }
  }
}
