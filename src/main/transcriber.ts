import path from 'path';
import fs from 'fs';

let cachedNodewhisper: typeof import('nodejs-whisper').nodewhisper | null = null;

async function loadWhisper() {
  if (!cachedNodewhisper) {
    const mod = await import('nodejs-whisper');
    cachedNodewhisper = mod.nodewhisper;
  }
  return cachedNodewhisper;
}

/**
 * Transcribes a 16kHz mono WAV file fully locally via whisper.cpp (nodejs-whisper).
 * The requested model is downloaded once on first use and cached by nodejs-whisper.
 */
export async function transcribeWav(wavPath: string, modelName: string): Promise<string> {
  if (!fs.existsSync(wavPath)) {
    throw new Error(`Audio file not found: ${wavPath}`);
  }

  const nodewhisper = await loadWhisper();

  const result = await nodewhisper(wavPath, {
    modelName,
    autoDownloadModelName: modelName,
    removeWavFileAfterTranscription: false,
    withCuda: false,
    whisperOptions: {
      outputInText: false,
      outputInVtt: false,
      outputInSrt: false,
      outputInCsv: false,
      outputInJson: false,
      translateToEnglish: false,
      language: 'auto',
      wordTimestamps: false
    }
  });

  return cleanTranscript(String(result ?? ''));
}

function cleanTranscript(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*\[[0-9:.\->\s]+\]\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tempWavPath(): string {
  const os = require('os');
  return path.join(os.tmpdir(), `whisperkey-${Date.now()}.wav`);
}
