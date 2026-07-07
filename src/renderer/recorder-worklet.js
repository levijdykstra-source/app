// Runs on the audio rendering thread. Forwards raw Float32 PCM frames
// from the microphone up to the main renderer thread via its message port.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      // Copy the frame since the underlying buffer is reused by the audio engine.
      this.port.postMessage(input[0].slice());
    }
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
