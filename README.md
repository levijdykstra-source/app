# WhisperKey

Local, private **voice-to-text** for macOS and Windows. Press a global hotkey
(or the on-screen Record button), speak, press it again — WhisperKey
transcribes your speech **entirely on-device** with a local Whisper model
(via [Transformers.js](https://github.com/huggingface/transformers.js) / ONNX
Runtime) and pastes the text wherever your cursor is focused.

No cloud APIs, no accounts, no telemetry, and no audio ever leaves your machine.

## Features

- **Global hotkey**, fully customizable, works over any app (Word, Docs, Slack,
  VS Code, Chrome, Notes, …).
- **Floating overlay** while recording — draggable, always-on-top, with a live
  waveform and timer.
- **Automatic paste at the cursor**, or copy-to-clipboard-only mode. Your
  previous clipboard is preserved and restored after pasting.
- **Transcription history** — saved locally; search, copy, delete, export to a
  text file.
- **Model picker** (Tiny → Medium, English & multilingual) with download size /
  RAM / speed estimates, plus **language selection** for multilingual models.
- **Microphone picker** with a live **test meter**, noise-suppression and
  auto-gain toggles.
- **Native notifications**, start/stop sounds, **launch at login**, and a
  system-tray / menu-bar presence.
- **Visible error messages** and local **debug logging** for troubleshooting.

## How it works

1. Press your shortcut (default `CommandOrControl+Shift+Space`) — a chime plays,
   the floating overlay appears, and the mic starts recording.
2. Speak.
3. Press the shortcut again — recording stops and the audio is transcribed
   locally by an on-device Whisper model.
4. The text is delivered per your Output setting: pasted at the cursor
   (default) or copied to the clipboard.

Everything is configurable from the **Settings** tab; the **Home** tab shows
status and your transcript history. The app lives in the tray/menu bar — click
its icon any time to reopen the window.

## Requirements

- Node.js 18+ and npm (for development/building)
- A microphone

No native build toolchain is required — `npm install` pulls prebuilt platform
binaries for ONNX Runtime and the paste helper from the npm registry.

> Whisper models are downloaded once from the Hugging Face Hub on first use and
> cached locally under the app's own data directory. After that, transcription
> works fully offline.

## Getting started

```bash
npm install
npm start        # builds the TypeScript and launches the app
```

On first launch the window opens automatically. After that WhisperKey stays in
the tray/menu bar.

### Models

| Model | Size | Notes |
|---|---|---|
| Tiny (`.en` / multilingual) | ~75 MB | Fastest, least accurate |
| Base (`.en` / multilingual) | ~142 MB | Fast |
| Small (`.en` / multilingual) | ~466 MB | Balanced (default: Small English) |
| Medium (multilingual) | ~1.5 GB | Slowest, most accurate |

All models run on CPU via ONNX Runtime. Larger models are more accurate but
slower and use more RAM.

## Building installers

```bash
npm run dist:mac   # produces a .dmg / .zip in release/
npm run dist:win   # produces an NSIS installer (.exe) in release/
```

Each target must be built on its own OS. CI (`.github/workflows/build.yml`)
builds both on GitHub-hosted Windows/macOS runners and publishes them as a
GitHub Release.

## Permissions

- **macOS**: grant **Microphone** access and **Accessibility** access (System
  Settings → Privacy & Security) the first time it records/pastes — the OS
  prompts automatically.
- **Windows**: allow the microphone privacy prompt.

## Project structure

```
src/
  main/         Electron main process
    index.ts            orchestration, IPC, recording state machine
    recorder-window.ts  hidden window that captures the mic
    overlay-window.ts   floating always-on-top recording indicator
    transcriber.ts      on-device Whisper (Transformers.js / ONNX)
    paste.ts            clipboard-preserving auto-paste
    history.ts          local transcript history (JSON)
    store.ts            settings persistence (electron-store)
    notify.ts           native notifications
    logger.ts           local debug log file
    tray.ts, shortcut-manager.ts
  renderer/
    settings.html/.ts   Home + Settings tabbed UI
    recorder.html/.ts    mic capture, resampling, WAV encoding, audio levels
    overlay.html/.ts     recording pill (timer + waveform)
  shared/types.ts        settings, IPC channels, model metadata, history types
scripts/         placeholder sound/icon generators, asset copier
```

## Notes, limitations & design choices

- **Speech engine.** The original spec suggested `faster-whisper` (a Python /
  CTranslate2 library). This app is Electron/TypeScript, so it uses Whisper via
  Transformers.js + ONNX Runtime instead — same Whisper models, fully local, no
  Python runtime to bundle. GPU acceleration is not enabled by default (CPU
  inference); this keeps the install simple and dependency-free.
- **Multilingual language selection** only applies to multilingual models;
  English-only (`.en`) models always transcribe English (and reject an explicit
  language, by Whisper's design).
- Changing the shortcut requires at least one modifier key. If a combination is
  already claimed by another app, WhisperKey keeps the previous one and shows a
  warning — use the Record button meanwhile.
- **Not yet implemented from the spec** (candidates for future work):
  push-to-talk mode, in-app model download progress UI, auto-update, GPU
  acceleration, and transcript editing before paste.
- This repo is developed and typechecked in a Linux sandbox that cannot run the
  Electron GUI or reach Hugging Face, so live recording/inference are exercised
  via the CI-built installers on real Windows/macOS machines. `npm run
  typecheck` and `npm run build` pass here; please do a manual pass on a real
  machine before relying on it.
