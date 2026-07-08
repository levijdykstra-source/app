import { ipcRenderer } from 'electron';
import * as path from 'path';
import * as url from 'url';
import { CHANNELS } from '../shared/types';

const TARGET_SAMPLE_RATE = 16000;

interface RecordOptions {
  deviceId?: string;
  noiseSuppression?: boolean;
  autoGain?: boolean;
}

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let workletNode: AudioWorkletNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let capturedFrames: Float32Array[] = [];
let lastLevelSentAt = 0;

async function startRecording(options: RecordOptions = {}): Promise<void> {
  capturedFrames = [];

  try {
    const audioConstraints: MediaTrackConstraints = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: options.noiseSuppression ?? true,
      autoGainControl: options.autoGain ?? true
    };
    // Use the user's chosen input device when set; otherwise the system default.
    if (options.deviceId) {
      audioConstraints.deviceId = { exact: options.deviceId };
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

    audioContext = new AudioContext();
    // addModule needs a URL, not a raw filesystem path — a bare Windows path
    // like "C:\...\recorder-worklet.js" is not a valid URL and fails to load.
    const workletUrl = url.pathToFileURL(path.join(__dirname, 'recorder-worklet.js')).href;
    await audioContext.audioWorklet.addModule(workletUrl);

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(audioContext, 'pcm-capture-processor');
    workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const frame = event.data;
      capturedFrames.push(frame);
      reportLevel(frame);
    };

    sourceNode.connect(workletNode);
    // Not connecting workletNode to destination avoids echoing mic audio to speakers.
  } catch (err) {
    ipcRenderer.send(CHANNELS.RECORDER_ERROR, err instanceof Error ? err.message : String(err));
  }
}

/** Throttled RMS level (0..1) sent to the overlay for the live waveform. */
function reportLevel(frame: Float32Array): void {
  const now = Date.now();
  if (now - lastLevelSentAt < 50) return; // ~20 updates/sec is plenty
  lastLevelSentAt = now;

  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  const rms = Math.sqrt(sum / frame.length);
  // Scale up a bit — speech RMS is usually well below 1.
  ipcRenderer.send(CHANNELS.AUDIO_LEVEL, Math.min(1, rms * 4));
}

async function stopRecording(): Promise<void> {
  const sourceSampleRate = audioContext?.sampleRate ?? TARGET_SAMPLE_RATE;

  sourceNode?.disconnect();
  workletNode?.disconnect();
  mediaStream?.getTracks().forEach((track) => track.stop());
  await audioContext?.close();

  const merged = mergeFrames(capturedFrames);

  audioContext = null;
  mediaStream = null;
  workletNode = null;
  sourceNode = null;
  capturedFrames = [];

  // Nothing was captured (mic never started, permission denied mid-flight, or
  // an instant start/stop). Report an error so the main process resets its
  // state instead of trying to transcribe silence — or worse, waiting forever.
  if (merged.length === 0) {
    ipcRenderer.send(CHANNELS.RECORDER_ERROR, 'No audio was captured');
    return;
  }

  const resampled = resampleTo16k(merged, sourceSampleRate);
  const wavBuffer = encodeWav(resampled, TARGET_SAMPLE_RATE);

  ipcRenderer.send(CHANNELS.AUDIO_DATA, wavBuffer);
}

function mergeFrames(frames: Float32Array[]): Float32Array {
  const totalLength = frames.reduce((sum, f) => sum + f.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const frame of frames) {
    merged.set(frame, offset);
    offset += frame.length;
  }
  return merged;
}

function resampleTo16k(input: Float32Array, sourceSampleRate: number): Float32Array {
  if (sourceSampleRate === TARGET_SAMPLE_RATE) return input;

  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const indexFloor = Math.floor(srcIndex);
    const indexCeil = Math.min(indexFloor + 1, input.length - 1);
    const fraction = srcIndex - indexFloor;
    output[i] = input[indexFloor] * (1 - fraction) + input[indexCeil] * fraction;
  }

  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function initSoundSources(): void {
  const soundsDir = new URLSearchParams(window.location.search).get('soundsDir');
  if (!soundsDir) return;

  const startAudio = document.getElementById('sound-start') as HTMLAudioElement | null;
  const stopAudio = document.getElementById('sound-stop') as HTMLAudioElement | null;
  // Use file:// URLs so the paths resolve correctly on Windows too.
  if (startAudio) startAudio.src = url.pathToFileURL(path.join(soundsDir, 'start.wav')).href;
  if (stopAudio) stopAudio.src = url.pathToFileURL(path.join(soundsDir, 'stop.wav')).href;
}

function playSound(name: 'start' | 'stop'): void {
  const audio = document.getElementById(`sound-${name}`) as HTMLAudioElement | null;
  audio?.play().catch(() => {
    /* ignore autoplay/race errors */
  });
}

initSoundSources();

ipcRenderer.on(CHANNELS.START_RECORDING, (_event, options?: RecordOptions) => {
  void startRecording(options);
});

ipcRenderer.on(CHANNELS.STOP_RECORDING, () => {
  void stopRecording();
});

ipcRenderer.on(CHANNELS.PLAY_SOUND, (_event, name: 'start' | 'stop') => {
  playSound(name);
});
