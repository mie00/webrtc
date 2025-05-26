import {
  setupMicTestMediaPw,
  setupCameraTestMediaPw,
  setupWatchTestMediaPw,
  MEDIA_SETUP_DIR_PW // Import to ensure base media dir path is available
} from '../shared/pwMediaTestHelpers';
import { setupTestFiles } from '../shared/pwFileTransferTestHelpers'; // Assuming this is the correct name and path
import fs from 'fs/promises';
import path from 'path';

async function globalSetup(): Promise<void> {
  console.log('\n--- Global Playwright Setup: Ensuring Media Directory and Generating Files ---');

  // Ensure the base directory for generated media exists
  try {
    await fs.mkdir(MEDIA_SETUP_DIR_PW, { recursive: true });
    console.log(`Ensured media directory exists: ${MEDIA_SETUP_DIR_PW}`);
  } catch (error) {
    console.error(`Error creating media directory ${MEDIA_SETUP_DIR_PW}:`, error);
    // Depending on severity, you might want to throw here to stop tests
  }

  // Call setup functions for all media types
  // These functions will be modified to check for file existence
  await setupMicTestMediaPw();
  await setupCameraTestMediaPw();
  await setupWatchTestMediaPw();

  // Call setup for file transfer test files
  // Assuming setupTestFiles also implements or will implement existence checks
  await setupTestFiles();

  console.log('--- Global Playwright Setup: File Generation Phase Complete ---');
}

export default globalSetup;
