// Generates tiny, dependency-free WAV beep files used for the
// "recording started" / "recording stopped" cues.
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

function writeWavFile(filePath, toneSpecs) {
  const totalSamples = toneSpecs.reduce(
    (sum, spec) => sum + Math.round(SAMPLE_RATE * spec.duration),
    0
  );
  const dataSize = totalSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (const spec of toneSpecs) {
    const samples = Math.round(SAMPLE_RATE * spec.duration);
    for (let i = 0; i < samples; i++) {
      const t = i / SAMPLE_RATE;
      const envelope = Math.min(1, i / 200, (samples - i) / 200); // simple fade in/out to avoid clicks
      const sample = Math.sin(2 * Math.PI * spec.frequency * t) * envelope * spec.amplitude;
      buffer.writeInt16LE(Math.round(sample * 32767), offset);
      offset += 2;
    }
  }

  fs.writeFileSync(filePath, buffer);
}

const outDir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(outDir, { recursive: true });

// Rising two-note chirp for "start recording"
writeWavFile(path.join(outDir, 'start.wav'), [
  { frequency: 660, duration: 0.09, amplitude: 0.5 },
  { frequency: 880, duration: 0.12, amplitude: 0.5 }
]);

// Falling two-note chirp for "stop recording"
writeWavFile(path.join(outDir, 'stop.wav'), [
  { frequency: 880, duration: 0.09, amplitude: 0.5 },
  { frequency: 587, duration: 0.12, amplitude: 0.5 }
]);

console.log('Generated start.wav and stop.wav in assets/sounds');
