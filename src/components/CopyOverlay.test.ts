import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import CopyOverlay from './CopyOverlay.svelte';

// Mock QRCode.toDataURL
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test-qr-code')
  }
}));

describe('CopyOverlay.svelte', () => {
  let closeMock: ReturnType<typeof vi.fn>;
  let openConfigMock: ReturnType<typeof vi.fn>;
  let resetMock: ReturnType<typeof vi.fn>;
  let acceptMock: ReturnType<typeof vi.fn>;
  let joinMock: ReturnType<typeof vi.fn>;
  let defaultProps: any; // Declare defaultProps here

  beforeEach(() => {
    closeMock = vi.fn();
    openConfigMock = vi.fn();
    resetMock = vi.fn();
    acceptMock = vi.fn();
    joinMock = vi.fn();

    // Mock navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined)
      },
      writable: true,
      configurable: true
    });

    // Initialize defaultProps here, after mocks are created
    defaultProps = {
      show: false,
      copyText: 'Test copy text',
    qrCodeUrl: 'http://test.com',
    showAcceptButton: false,
    showJoinButton: false,
    showCopyButton: true,
    showPasteText: false,
    cid: null,
    close: closeMock,
    openConfig: openConfigMock,
    reset: resetMock,
    accept: acceptMock,
    join: joinMock
  };

  it('should not be visible when show is false', () => {
    render(CopyOverlay, { ...defaultProps, show: false });
    expect(screen.queryByRole('button', { name: 'Close overlay' })).toBeNull();
  });

  it('should be visible when show is true', () => {
    render(CopyOverlay, { ...defaultProps, show: true });
    expect(screen.getByRole('button', { name: 'Close overlay' })).toBeVisible();
    expect(screen.getByText('Copy this and send it:')).toBeVisible();
  });

  it('should call close when overlay background is clicked', async () => {
    render(CopyOverlay, { ...defaultProps, show: true });
    const overlay = screen.getByRole('button', { name: 'Close overlay' });
    await fireEvent.click(overlay);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('should call close when Escape key is pressed', async () => {
    render(CopyOverlay, { ...defaultProps, show: true });
    const overlay = screen.getByRole('button', { name: 'Close overlay' });
    await fireEvent.keyDown(overlay, { key: 'Escape' });
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('should display QR code when qrCodeUrl is provided and show is true', async () => {
    render(CopyOverlay, { ...defaultProps, show: true, qrCodeUrl: 'http://test-qr.com' });
    // Wait for QRCode.toDataURL to resolve and component to update
    await screen.findByAltText('QR Code');
    const qrImage = screen.getByAltText('QR Code') as HTMLImageElement;
    expect(qrImage).toBeVisible();
    expect(qrImage.src).toBe('data:image/png;base64,test-qr-code');
    expect(screen.getByTitle('http://test-qr.com')).toBeVisible();
  });

  it('should not display QR code when qrCodeUrl is empty', () => {
    render(CopyOverlay, { ...defaultProps, show: true, qrCodeUrl: '' });
    expect(screen.queryByAltText('QR Code')).toBeNull();
  });

  it('should call openConfig when config button is clicked', async () => {
    render(CopyOverlay, { ...defaultProps, show: true });
    const configButton = screen.getByText('⚙️');
    await fireEvent.click(configButton);
    expect(openConfigMock).toHaveBeenCalledTimes(1);
  });

  it('should call reset when reset button is clicked', async () => {
    render(CopyOverlay, { ...defaultProps, show: true });
    const resetButton = screen.getByText('↺');
    await fireEvent.click(resetButton);
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it('should call navigator.clipboard.writeText and update button text on copy', async () => {
    render(CopyOverlay, { ...defaultProps, show: true, copyText: 'Text to copy' });
    const copyButton = screen.getByText('Copy');
    await fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Text to copy');
    expect(await screen.findByText('Copied successfully')).toBeVisible();
  });

  it('should show error message if clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      writable: true,
      configurable: true
    });
    render(CopyOverlay, { ...defaultProps, show: true, copyText: 'Text to copy' });
    const copyButton = screen.getByText('Copy');
    await fireEvent.click(copyButton);
    expect(await screen.findByText('Clipboard unavailable, please copy manually')).toBeVisible();
  });

  it('should show error message if clipboard writeText fails', async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Copy failed')
    );
    render(CopyOverlay, { ...defaultProps, show: true, copyText: 'Text to copy' });
    const copyButton = screen.getByText('Copy');
    await fireEvent.click(copyButton);
    expect(await screen.findByText('Error copying, please copy manually')).toBeVisible();
  });

  it('should not show copy button if showCopyButton is false', () => {
    render(CopyOverlay, { ...defaultProps, show: true, showCopyButton: false });
    expect(screen.queryByText('Copy')).toBeNull();
  });

  it('should show paste textarea if showPasteText is true', () => {
    const { container } = render(CopyOverlay, { ...defaultProps, show: true, showPasteText: true });
    const pasteTextarea = container.querySelector('#test-paste');
    expect(pasteTextarea).toBeVisible();
  });

  it('should call accept with pasteValue and cid when accept button is clicked', async () => {
    const testCid = 'test-cid-123';
    const { container } = render(CopyOverlay, {
      ...defaultProps,
      show: true,
      showPasteText: true,
      showAcceptButton: true,
      cid: testCid
    });
    const pasteTextarea = container.querySelector('#test-paste') as HTMLTextAreaElement;
    await fireEvent.input(pasteTextarea, { target: { value: 'Pasted value' } });

    const acceptButton = screen.getByText('Accept');
    await fireEvent.click(acceptButton);

    expect(acceptMock).toHaveBeenCalledWith({
      pasteValue: 'Pasted value',
      cid: testCid
    });
    expect(pasteTextarea.value).toBe(''); // Check if pasteValue is cleared
    expect(screen.getByText('Copy')).toBeVisible(); // Check if copyButtonText is reset
  });

  it('should not show accept button if showAcceptButton is false', () => {
    render(CopyOverlay, { ...defaultProps, show: true, showAcceptButton: false });
    expect(screen.queryByText('Accept')).toBeNull();
  });

  it('should call join when join button is clicked', async () => {
    render(CopyOverlay, { ...defaultProps, show: true, showJoinButton: true });
    const joinButton = screen.getByText('📞');
    await fireEvent.click(joinButton);
    expect(joinMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Copy')).toBeVisible(); // Check if copyButtonText is reset
  });

  it('should not show join button if showJoinButton is false', () => {
    render(CopyOverlay, { ...defaultProps, show: true, showJoinButton: false });
    expect(screen.queryByText('📞')).toBeNull();
  });

  it('should render copyText in the textarea', () => {
    const myCopyText = 'This is the text that should be copied.';
    render(CopyOverlay, { ...defaultProps, show: true, copyText: myCopyText });
    const textarea = screen.getByDisplayValue(myCopyText) as HTMLTextAreaElement;
    expect(textarea).toBeVisible();
  });
});
