import { test, Page as PlaywrightPage, BrowserContext } from '@playwright/test';
import { standardSetup, StandardSetupResult } from './setup/pwStandardSetup';
import { standardTeardown } from './setup/pwStandardTeardown';
import { performWatchTestPw, type PageInfoPw } from './shared/pwMediaTestHelpers';
import { PW_TIMEOUT } from './setup/pwTestHelpers';

test.describe('WebRTC Watch (Share Video File) E2E Test with Playwright (2 Peers) @media', () => {
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    "Watch tests are skipped on WebKit browsers (Safari/iOS), videoElement.captureStream doesn't work"
  );
  // Increased timeout for media generation, upload, and analysis
  test.setTimeout(PW_TIMEOUT * 12); // Adjusted timeout

  let pageA: PlaywrightPage;
  let contextA: BrowserContext;
  let pageB: PlaywrightPage;
  let contextB: BrowserContext;

  let senderInfo: PageInfoPw;
  let receiverInfo: PageInfoPw[];

  test.beforeAll(async ({ browser }) => {
    // await setupWatchTestMediaPw(); // Moved to globalSetup

    const setupResult: StandardSetupResult = await standardSetup(browser);
    pageA = setupResult.pageA;
    contextA = setupResult.contextA;
    pageB = setupResult.pageB;
    contextB = setupResult.contextB;

    senderInfo = { page: pageA, name: 'Page A (Sender)' };
    receiverInfo = [{ page: pageB, name: 'Page B (Receiver)' }];

    // Log codec support for Page A (sender)
    console.log('\n--- Logging Codec Support for Page A (Sender) ---');
    try {
      const codecSupport = await pageA.evaluate(
        (utilsPath) => {
          // Dynamically import and run in browser context
          // This assumes pwBrowserMediaUtils.ts is compiled to JS and accessible
          // For Playwright, it's better to pass the function itself if it's self-contained
          // or ensure the utils are loaded if they are part of the app's bundle.
          // For simplicity here, we'll assume getBrowserCodecSupport is globally available
          // or we pass its source. Let's redefine it for evaluate:
          async function getBrowserCodecSupportInPage(): Promise<any> {
            const codecsToCheck: { [key: string]: string[] } = {
              video: [
                'video/mp4; codecs="avc1.42E01E"', // H.264 Baseline
                'video/mp4; codecs="avc1.4D401E"', // H.264 Main
                'video/mp4; codecs="avc1.64001E"', // H.264 High
                'video/mp4; codecs="hvc1.1.6.L93.B0"', // HEVC/H.265 Main
                'video/mp4; codecs="hev1.1.6.L93.B0"', // HEVC/H.265 Main (alternative)
                'video/webm; codecs="vp8"',
                'video/webm; codecs="vp9"',
                'video/webm; codecs="av01.0.05M.08"', // AV1
                'video/ogg; codecs="theora"'
              ],
              audio: [
                'audio/mp4; codecs="mp4a.40.2"', // AAC-LC
                'audio/mp4; codecs="mp4a.40.5"', // HE-AAC
                'audio/webm; codecs="opus"',
                'audio/ogg; codecs="vorbis"',
                'audio/aac' // Generic AAC
              ]
            };
            const support: { [mimeType: string]: boolean } = {};
            const videoElement = document.createElement('video');
            const mediaSourceSupported =
              'MediaSource' in window && (MediaSource as any).isTypeSupported;

            for (const type in codecsToCheck) {
              for (const mimeType of codecsToCheck[type]) {
                let isSupported = false;
                if (mediaSourceSupported) {
                  try {
                    isSupported = (MediaSource as any).isTypeSupported(mimeType);
                  } catch (e) {
                    isSupported = false;
                  }
                }
                if (!isSupported && videoElement.canPlayType) {
                  const canPlayResult = videoElement.canPlayType(mimeType);
                  isSupported = canPlayResult === 'probably' || canPlayResult === 'maybe';
                }
                support[mimeType] = isSupported;
              }
            }
            return support;
          }
          return getBrowserCodecSupportInPage();
        }
        // './shared/pwBrowserMediaUtils' // This path is for Node, not browser.
        // Instead, we pass the function source or rely on it being part of the page's JS.
      );
      console.log('Page A Codec Support:', JSON.stringify(codecSupport, null, 2));
    } catch (error) {
      console.error('Error getting codec support from Page A:', error);
    }
    console.log('--- Codec Support Logging Complete ---\n');
  });

  test.afterAll(async () => {
    await standardTeardown({ pageA, contextA, pageB, contextB });
    // await teardownWatchTestMediaPw(); // Moved to globalTeardown
  });

  test('Page A should share an MP4 file, play on A, and verify audio/video on Page A & Page B', async () => {
    await performWatchTestPw(senderInfo, receiverInfo);
    console.log('--- TEST SUCCESS (Playwright): Watch test completed for 2 peers. ---');
  });
});
