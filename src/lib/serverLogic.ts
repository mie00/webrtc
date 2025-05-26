import type { AppLogic, AppLogicContext } from './appLogic.js';
import { io, Socket } from 'socket.io-client';
// RTCIceCandidateInit should be globally available or via WebRTC types.

export class ServerLogic implements AppLogic {
  private context: AppLogicContext;
  private socket: Socket;

  constructor(context: AppLogicContext) {
    this.context = context;
    // Use coordinator URL from config
    const coordinatorUrl = this.context.config.general.coordinatorUrl || 'ws://127.0.0.1:5001'; // Fallback for safety
    this.socket = io(coordinatorUrl, { autoConnect: false });
  }

  private setupSocketHandlers(): void {
    const { webRTCApp, setState, appOnId, getDirectClient, getState } = this.context;

    this.socket.on('init', async (id: string) => {
      console.log('server logic: init', id);
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('r', id);
      history.replaceState(null, '', '?' + urlParams.toString());
      appOnId();

      if (this.context.config.general.configLoader === 'server') {
        setState((current) => ({
          ...current,
          showCopyButton: true,
          showAcceptButton: false,
          showJoinButton: false // Room ID now available
        }));
      }

      const appLogicModuleState = getState();
      if (appLogicModuleState.isDuringInitialServerLoad) {
        setState({
          initialOverlayShown: true,
          isDuringInitialServerLoad: false
        });
      }
    });

    this.socket.on('subscribed', async (sid: string) => {
      console.log('server logic: got subscribed', sid);
      const cid = await webRTCApp.getOffer(
        async (candidate: RTCIceCandidate | null) => {
          if (!candidate) return;
          console.log('server logic: got a candidate for subscribed', sid, candidate);
          this.socket.emit('candidate', sid, JSON.stringify(candidate));
        },
        { sid }
      );
      const client = getDirectClient(cid);
      const sdp = client?.pc?.localDescription?.sdp;
      if (sdp) {
        console.log('server logic: sending an offer for subscribed', sid, sdp);
        this.socket.emit('offer', sid, sdp);
      }
    });

    this.socket.on('answer', async (sid: string, sdp: string) => {
      console.log('server logic: got an answer from socket', sid, sdp);
      const cid = webRTCApp.getCid(sid);
      if (cid) {
        const client = getDirectClient(cid);
        if (client?.pc) {
          try {
            await client.pc.setRemoteDescription({ type: 'answer', sdp: sdp.trim() + '\n' });
          } catch (e) {
            console.error(
              'server logic: Error setting remote description from socket answer:',
              e,
              'SDP:',
              sdp
            );
          }
        } else {
          console.warn('server logic: Client or PC not found for socket answer. CID:', cid);
        }
      } else {
        console.warn('server logic: No CID found for SID:', sid, 'on socket answer.');
      }
    });

    this.socket.on('offer', async (sid: string, sdp: string) => {
      console.log('server logic: got an offer from socket', sid, sdp);
      const cid = await webRTCApp.getAnswer(
        sdp,
        async (candidate: RTCIceCandidate | null) => {
          if (!candidate) return;
          console.log('server logic: got a candidate for offer', sid, candidate);
          this.socket.emit('candidate', sid, JSON.stringify(candidate));
        },
        { sid }
      );
      const client = getDirectClient(cid);
      const asdp = client?.pc?.localDescription?.sdp;
      if (asdp) {
        console.log('server logic: sending an answer for offer', sid, asdp);
        this.socket.emit('answer', sid, asdp);
      }
    });

    this.socket.on('error', async () => {
      console.error('ServerLogic: Socket connection error.');
      if (this.context.reportCriticalError) {
        this.context.reportCriticalError('socket');
      }
    });

    this.socket.on('candidate', async (sid: string, candidateStr: string) => {
      console.log('server logic: got a candidate from peer via socket', sid, candidateStr);
      const cid = webRTCApp.getCid(sid);
      if (cid) {
        const client = getDirectClient(cid);
        if (client?.pc) {
          try {
            await client.pc.addIceCandidate(JSON.parse(candidateStr));
          } catch (e) {
            console.error('server logic: Error adding ICE candidate from socket:', e);
          }
        } else {
          console.warn('server logic: Client or PC not found for socket candidate. CID:', cid);
        }
      } else {
        console.warn('server logic: No CID found for SID:', sid, 'on socket candidate.');
      }
    });
  }

  async initialize(urlParams: URLSearchParams): Promise<void> {
    const { setState, appOnId } = this.context;
    console.log('server logic initialize');

    this.setupSocketHandlers();
    if (!this.socket.connected) {
      this.socket.connect();
    }

    if (!urlParams.has('r')) {
      // No room ID in URL, server needs to initialize one
      setState((currentVal) => ({
        ...currentVal,
        showCopyButton: true, // To copy the room link once available
        showAcceptButton: false,
        showJoinButton: false, // No room to join yet
        isDuringInitialServerLoad: true, // Mark that we are in initial server load phase
        showCopyOverlay: true, // Show overlay while waiting for room ID
        copyText: 'Initializing room...', // Placeholder text
        qrCodeUrl: ''
      }));
      this.socket.emit('init');
    } else {
      // Room ID already in URL
      appOnId(); // Sets showCopyOverlay, copyText, qrCodeUrl based on current URL with 'r'
      setState((currentVal) => ({
        ...currentVal,
        initialOverlayShown: true, // This is an initial load with an existing room
        showCopyButton: false, // Do not show copy for existing room URL
        showAcceptButton: false,
        showJoinButton: true // Room ID exists, so show Join button
      }));
    }
  }

  async handleOpenQrRequest(urlParams: URLSearchParams): Promise<void> {
    const { setState, appOnId } = this.context;
    setState({ initialOverlayShown: false }); // QR requests are manual actions

    if (!urlParams.has('r')) {
      // Server mode, no room ID yet. Show current state (likely no room ID in URL yet)
      // and request/ensure room ID.
      appOnId(); // This will show the overlay with the current URL (no 'r' or placeholder).
      setState((currentVal) => ({
        ...currentVal,
        showJoinButton: false, // No room to join yet
        showCopyButton: true,
        showAcceptButton: false,
        showPasteText: false,
        copyText: currentVal.qrCodeUrl || 'Initializing room...' // Use URL or placeholder
      }));
      if (!this.socket.connected) this.socket.connect();
      this.socket.emit('init'); // Request room ID. The 'init' handler updates URL & calls appOnId again.
    } else {
      // Server mode, room ID exists.
      appOnId(); // Sets showCopyOverlay, copyText, qrCodeUrl.
      setState((currentVal) => ({
        ...currentVal,
        showJoinButton: true, // Room exists, can join
        showCopyButton: false, // Can copy room link
        showAcceptButton: false,
        showPasteText: false
      }));
    }
  }

  handleJoin(id: string): void {
    // const { setState } = this.context; // setState not used here
    if (id) {
      this.socket.emit('subscribe', id);
      // Optionally hide overlay after clicking join, or let socket events handle it
      // this.context.setState({ showCopyOverlay: false });
    }
  }

  setConfig(config: Readonly<AppLogicContext['config']>): void {
    this.context.config = config;
  }

  destroy(): void {
    if (this.socket) {
      if (this.socket.connected) {
        this.socket.disconnect();
        console.log('ServerLogic: Socket disconnected.');
      }
      // Remove all listeners to prevent memory leaks and issues if the socket instance were reused.
      this.socket.off('init');
      this.socket.off('subscribed');
      this.socket.off('answer');
      this.socket.off('offer');
      this.socket.off('error');
      this.socket.off('candidate');
      console.log('ServerLogic destroyed and socket listeners removed.');
    }
  }
}
