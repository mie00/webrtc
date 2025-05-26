import {
  teardownMicTestMediaPw,
  teardownCameraTestMediaPw,
  teardownWatchTestMediaPw
} from '../shared/pwMediaTestHelpers';
import { teardownTestFiles } from '../shared/pwFileTransferTestHelpers'; // Assuming this is the correct name and path

async function globalTeardown(): Promise<void> {
  console.log('\n--- Global Playwright Teardown: Cleaning Up Intermediate Files ---');

  // Teardown functions will be modified to only clean intermediate files,
  // preserving the main generated media.
  await teardownMicTestMediaPw();
  await teardownCameraTestMediaPw();
  await teardownWatchTestMediaPw();

  // Assuming teardownTestFiles also knows what to clean vs. preserve
  await teardownTestFiles();

  console.log('--- Global Playwright Teardown: Cleanup Phase Complete ---');
}

export default globalTeardown;
