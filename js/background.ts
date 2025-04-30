/**
 * Changes the background of a video element using selfie segmentation
 * @param videoSource The video element to process
 * @returns A promise that resolves to the processed video stream
 */
async function backgroundChange(videoSource: HTMLVideoElement): Promise<MediaStream> {
    const canvasElement = document.createElement('canvas');
    canvasElement.width = videoSource.videoWidth;
    canvasElement.height = videoSource.videoHeight;
    canvasElement.style.transform = 'scaleX(-1)';
    document.getElementById('media')?.appendChild(canvasElement);
    videoSource.substitueElement = canvasElement;

    const ctx = canvasElement.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get canvas context');
    }

    function onResults(results: any): void {
        ctx.save();
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        ctx.drawImage(results.segmentationMask, 0, 0,
            canvasElement.width, canvasElement.height);

        // Only overwrite existing pixels.
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#00FF00';

        ctx.drawImage(
            results.image, 0, 0, canvasElement.width, canvasElement.height);

        // Only overwrite missing pixels.
        ctx.globalCompositeOperation = 'destination-atop';
        ctx.filter = "blur(16px)";
        ctx.drawImage(
            results.image, 0, 0, canvasElement.width, canvasElement.height);

        ctx.restore();
    }

    const selfieSegmentation = new SelfieSegmentation({
        modelSelection: 1,
        locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }
    });
    selfieSegmentation.onResults(onResults);

    return new Promise<MediaStream>((resolve, reject) => {
        const ddo = async (): Promise<void> => {
            await selfieSegmentation.send({ image: videoSource });
            videoSource.requestVideoFrameCallback(ddo);
        }
        videoSource.requestVideoFrameCallback(async () => {
            await ddo();
            const stream = canvasElement.captureStream();
            videoSource.substitueStream = stream;
            resolve(stream);
        });
    });
}

// Commented out alternative implementation using TensorFlow Lite
/*
async function backgroundChangeTF(): Promise<void> {
    tflite.setWasmPath('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.10/wasm/')
    const tfliteModel = tflite.loadTFLiteModel(
        './selfie_segmentation.tflite');
   
   const outputTensor = tf.tidy(() => {
       // Get pixels data from an image.
       const img = tf.browser.fromPixels(document.querySelector('img'));
       // Normalize (might also do resize here if necessary).
       const input = tf.sub(tf.div(tf.expandDims(img), 127.5), 1);
       // Run the inference.
       let outputTensor = tfliteModel.predict(input);
       // De-normalize the result.
       return tf.mul(tf.add(outputTensor, 1), 127.5)
     });
}
*/

export { backgroundChange };
