import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173
	},
	testDir: 'e2e',
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
