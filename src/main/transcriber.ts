import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';

type Pipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>
) => Promise<{ text: string }>;

const pipelineCache = new Map<string, Promise<Pipeline>>();

async function getPipeline(modelName: string): Promise<Pipeline> {
  let cached = pipelineCache.get(modelName);
  if (!cached) {
    cached = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      // Keep downloaded model weights inside the app's own data directory
      // instead of the OS default cache location.
      env.cacheDir = path.join(app.getPath('userData'), 'models');
      return (await pipeline('automatic-speech-recognition', modelName)) as unknown as Pipeline;
    })();
    pipelineCache.set(modelName, cached);
  }
  return cached;
}

/**
 * Transcribes a 16kHz mono WAV file fully on-device via Transformers.js
 * (ONNX Runtime), running a Whisper model. The model is downloaded once on
 * first use and cached locally under the app's userData directory.
 *
 * `language` is only honoured for multilingual models: English-only models
 * (ending in `.en`) throw if `language`/`task` are supplied, so we never pass
 * them there. Pass 'auto' (or an English-only model) to auto-detect.
 */
export async function transcribeWav(
  wavPath: string,
  modelName: string,
  language = 'auto'
): Promise<string> {
  if (!fs.existsSync(wavPath)) {
    throw new Error(`Audio file not found: ${wavPath}`);
  }

  const samples = readWavAsFloat32(wavPath);
  // Whisper chokes on empty/near-empty input; skip anything under ~0.1s.
  if (samples.length < 1600) {
    return '';
  }

  const options: Record<string, unknown> = {
    chunk_length_s: 30,
    stride_length_s: 5
  };
  const isEnglishOnly = modelName.endsWith('.en');
  if (!isEnglishOnly && language && language !== 'auto') {
    // Only multilingual models accept an explicit language/task.
    options.language = language;
    options.task = 'transcribe';
  }

  const transcribe = await getPipeline(modelName);
  const result = await transcribe(samples, options);

  return (result.text ?? '').trim();
}

function readWavAsFloat32(wavPath: string): Float32Array {
  const buffer = fs.readFileSync(wavPath);

  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Expected a RIFF/WAVE file');
  }

  let offset = 12;
  let dataOffset = -1;
  let dataLength = 0;
  let bitsPerSample = 16;
  let numChannels = 1;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkBodyStart = offset + 8;

    if (chunkId === 'fmt ') {
      numChannels = buffer.readUInt16LE(chunkBodyStart + 2);
      bitsPerSample = buffer.readUInt16LE(chunkBodyStart + 14);
    } else if (chunkId === 'data') {
      dataOffset = chunkBodyStart;
      dataLength = chunkSize;
    }

    offset = chunkBodyStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === -1) {
    throw new Error('WAV file has no data chunk');
  }
  if (bitsPerSample !== 16 || numChannels !== 1) {
    throw new Error(`Unsupported WAV format (channels=${numChannels}, bitsPerSample=${bitsPerSample})`);
  }

  const sampleCount = dataLength / 2;
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = buffer.readInt16LE(dataOffset + i * 2) / 32768;
  }
  return samples;
}

export function tempWavPath(): string {
  return path.join(os.tmpdir(), `whisperkey-${Date.now()}.wav`);
}
