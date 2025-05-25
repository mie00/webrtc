import { defineConfig, devices } from '@playwright/test';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import os from 'os'; // Import the os module

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
	projects: [
		/* Test against desktop browsers */
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				launchOptions: {
					args: [
						'--use-fake-device-for-media-stream',
						'--use-fake-ui-for-media-stream',
						'--use-file-for-fake-video-capture=./e2e/setup/generated-media-pw/camera_test_generated_video_pw.mjpeg',
						'--use-file-for-fake-audio-capture=./e2e/setup/generated-media-pw/mic_test_generated_audio_pw.wav',
					],
				},
			},
		},
		{
			name: 'firefox',
			use: {
				...devices['Desktop Firefox'],
				launchOptions:{
					args:[
						"--use-test-media-devices" 
					],
					firefoxUserPrefs: { "media.navigator.streams.fake": true, "media.navigator.permission.disabled": true }
				}      
			},
		},
		{
			name: 'webkit',
			use: {
				...devices['Desktop Safari'],
				launchOptions: os.platform() === 'darwin' ? { // Conditionally add args for macOS
					args:[
						"--enable-mock-capture-devices=true", // Note: This arg looks unusual, ensure it's correct
						"--enable-media-stream=true"
					]
				} : {},
			},
		},
		/* Test against mobile viewports. */
		{
			name: 'Mobile Chrome',
			use: {
				...devices['Pixel 5'],
				launchOptions: {
					args: [
						'--use-fake-device-for-media-stream',
						'--use-fake-ui-for-media-stream',
						'--use-file-for-fake-video-capture=./e2e/setup/generated-media-pw/camera_test_generated_video_pw.mjpeg',
						'--use-file-for-fake-audio-capture=./e2e/setup/generated-media-pw/mic_test_generated_audio_pw.wav',
					],
				},
			},
		},
		{
			name: 'Mobile Safari',
			use: {
				...devices['iPhone 12'],
				launchOptions: os.platform() === 'darwin' ? { // Conditionally add args for macOS
					args:[
						"--enable-mock-capture-devices=true",
						"--enable-media-stream=true"
					]
				} : {},
			},
		},
	],
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		reuseExistingServer:true,
	},
	testDir: 'e2e',
	globalSetup: path.resolve(__dirname, 'e2e/setup/globalSetup.ts'),
	globalTeardown: path.resolve(__dirname, 'e2e/setup/globalTeardown.ts'),
});
