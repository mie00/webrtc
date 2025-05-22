import type { AppLogic, AppLogicContext } from './appLogic';

export class ServerLogic implements AppLogic {
  private context: AppLogicContext;

  constructor(context: AppLogicContext) {
    this.context = context;
  }

  async initialize(urlParams: URLSearchParams): Promise<void> {
    const { socket, setState, appOnId } = this.context;
    console.log("server logic initialize");

    if (!urlParams.has('r')) { // No room ID in URL, server needs to initialize one
      setState(currentVal => ({
        ...currentVal,
        showCopyButton: true, // To copy the room link once available
        showAcceptButton: false,
        showJoinButton: false, // No room to join yet
        isDuringInitialServerLoad: true, // Mark that we are in initial server load phase
        showCopyOverlay: true, // Show overlay while waiting for room ID
        copyText: "Initializing room...", // Placeholder text
        qrCodeUrl: "",
      }));
      if (!socket.connected) socket.connect(); // Ensure connected before emitting
      socket.emit('init');
    } else { // Room ID already in URL
      appOnId(); // Sets showCopyOverlay, copyText, qrCodeUrl based on current URL with 'r'
      setState(currentVal => ({
        ...currentVal,
        initialOverlayShown: true, // This is an initial load with an existing room
        showCopyButton: true, // Show copy for existing room URL (original was false, but true makes more sense to share)
        showAcceptButton: false,
        showJoinButton: true, // Room ID exists, so show Join button
      }));
    }
  }

  async handleOpenQrRequest(urlParams: URLSearchParams): Promise<void> {
    const { socket, setState, appOnId } = this.context;
    setState({ initialOverlayShown: false }); // QR requests are manual actions

    if (!urlParams.has('r')) {
      // Server mode, no room ID yet. Show current state (likely no room ID in URL yet)
      // and request/ensure room ID.
      appOnId(); // This will show the overlay with the current URL (no 'r' or placeholder).
      setState(currentVal => ({
        ...currentVal,
        showJoinButton: false, // No room to join yet
        showCopyButton: true,
        showAcceptButton: false,
        showPasteText: false,
        copyText: currentVal.qrCodeUrl || "Initializing room...", // Use URL or placeholder
      }));
      if (!socket.connected) socket.connect();
      socket.emit('init'); // Request room ID. The 'init' handler updates URL & calls appOnId again.
    } else {
      // Server mode, room ID exists.
      appOnId(); // Sets showCopyOverlay, copyText, qrCodeUrl.
      setState(currentVal => ({
        ...currentVal,
        showJoinButton: true, // Room exists, can join (original was false, but true seems more logical for QR context)
        showCopyButton: true, // Can copy room link
        showAcceptButton: false,
        showPasteText: false,
      }));
    }
  }

  handleJoin(id: string): void {
    const { socket, setState } = this.context;
    if (id) {
      socket.emit('subscribe', id);
      // Optionally hide overlay after clicking join, or let socket events handle it
      // setState({ showCopyOverlay: false }); 
    }
  }
}
