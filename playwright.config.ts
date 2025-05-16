import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173
	},
	testDir: 'e2e',
    globalSetup: path.resolve(__dirname, 'e2e/setup/globalSetup.ts'),
    globalTeardown: path.resolve(__dirname, 'e2e/setup/globalTeardown.ts'),
	use: {
		launchOptions: {                                                                                                                                                                                         
			args: [                                                                                                                                                                                                
				'--use-fake-device-for-media-stream',                                                                                                                                                                
				'--use-fake-ui-for-media-stream',                                                                                                                                                                    
				'--use-file-for-fake-video-capture=./e2e/setup/generated-media-pw/camera_test_generated_video_pw.mjpeg',                                                                                                
				'--use-file-for-fake-audio-capture=./e2e/setup/generated-media-pw/mic_test_generated_audio_pw.wav',                                                                                                     
			],                                                                                                                                                                                                     
		},
	},
});
