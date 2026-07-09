import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { CHANNELS, AppState, HistoryItem } from '../shared/types';
import { getSettings, setSettings } from './store';
import { createRecorderWindow } from './recorder-window';
import { createOverlayWindow, getOverlayWindow, showOverlay, hideOverlay } from './overlay-window';
import { registerToggleShortcut, unregisterAll } from './shortcut-manager';
import { createTray, destroyTray, updateTrayState } from './tray';
import { transcribeWav, tempWavPath } from './transcriber';
import { pasteAtCursor, copyToClipboard } from './paste';
import { notify } from './notify';
import { initLogger, closeLogger, log } from './logger';
import {
  getHistory,
  addHistoryItem,
  deleteHistoryItem,
  clearHistory,
  exportHistory
} from './history';

// Single instance lock: a hotkey-driven utility app makes no sense running twice.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let recorderWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let currentState: AppState = 'idle';
let shortcutOk = false;
let recordingStartedAt = 0;

function setState(state: AppState): void {
  currentState = state;
  updateTrayState(state);
  settingsWindow?.webContents.send(CHANNELS.STATE_CHANGED, state);
}

function reportError(message: string): void {
  log('error', message);
  settingsWindow?.webContents.send(CHANNELS.APP_ERROR, message);
  hideOverlay();
  setState('error');
  setTimeout(() => {
    if (currentState === 'error') setState('idle');
  }, 4000);
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 720,
    minWidth: 480,
    minHeight: 560,
    title: 'WhisperKey',
    backgroundColor: '#1e1f24',
    webPreferences: {
      // Secure model: the renderer has no Node.js. All Electron/IPC access
      // goes through the contextBridge API in preload.js. This avoids the
      // "exports is not defined" class of failures from CommonJS in the page.
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function notifyHistoryChanged(): void {
  settingsWindow?.webContents.send(CHANNELS.HISTORY_CHANGED, getHistory());
}

function toggleRecording(): void {
  if (currentState === 'idle') {
    beginRecording();
  } else if (currentState === 'recording') {
    endRecording();
  }
  // Ignore toggles while transcribing — one dictation at a time.
}

function beginRecording(): void {
  const settings = getSettings();
  recordingStartedAt = Date.now();
  setState('recording');
  log('info', 'Recording started');

  if (settings.showOverlay) showOverlay();
  if (settings.playSounds) recorderWindow?.webContents.send(CHANNELS.PLAY_SOUND, 'start');
  if (settings.showNotifications) notify('WhisperKey', 'Recording…');

  recorderWindow?.webContents.send(CHANNELS.START_RECORDING, {
    deviceId: settings.inputDeviceId,
    noiseSuppression: settings.noiseSuppression,
    autoGain: settings.autoGain
  });
}

function endRecording(): void {
  const settings = getSettings();
  setState('transcribing');
  log('info', 'Recording stopped, transcribing');

  hideOverlay();
  if (settings.playSounds) recorderWindow?.webContents.send(CHANNELS.PLAY_SOUND, 'stop');

  recorderWindow?.webContents.send(CHANNELS.STOP_RECORDING);
}

async function deliverText(rawText: string): Promise<void> {
  const settings = getSettings();
  let text = rawText;
  if (settings.addNewline) text += '\n';

  if (settings.outputMode === 'copy') {
    copyToClipboard(text);
    if (settings.showNotifications) notify('WhisperKey', 'Transcription copied to clipboard');
  } else {
    await pasteAtCursor(text);
  }
}

async function handleAudioData(buffer: Buffer): Promise<void> {
  // A WAV header alone is 44 bytes; anything at or below that carries no audio.
  if (buffer.length <= 44) {
    setState('idle');
    return;
  }

  const durationMs = recordingStartedAt ? Date.now() - recordingStartedAt : 0;
  const wavPath = tempWavPath();
  try {
    fs.writeFileSync(wavPath, buffer);
    const settings = getSettings();
    const text = await transcribeWav(wavPath, settings.modelName, settings.language);

    if (text) {
      await deliverText(text);

      if (settings.saveHistory) {
        addHistoryItem({ text, model: settings.modelName, durationMs });
        notifyHistoryChanged();
      }
      if (settings.showNotifications && settings.outputMode === 'paste') {
        notify('WhisperKey', text.length > 80 ? text.slice(0, 77) + '…' : text);
      }
      log('info', `Transcribed ${text.length} chars in ${durationMs}ms of audio`);
    } else {
      log('info', 'Transcription produced no text (silence?)');
    }
    setState('idle');
  } catch (err) {
    reportError(`Transcription failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    fs.unlink(wavPath, () => undefined);
  }
}

function applyShortcut(accelerator: string): boolean {
  shortcutOk = registerToggleShortcut(accelerator, toggleRecording);
  settingsWindow?.webContents.send(CHANNELS.GET_SHORTCUT_OK, shortcutOk);
  if (!shortcutOk) log('warn', `Failed to register shortcut "${accelerator}"`);
  return shortcutOk;
}

function applyLaunchAtLogin(enabled: boolean): void {
  // Linux (dev) doesn't support login items via this API; guard to mac/win.
  if (process.platform !== 'darwin' && process.platform !== 'win32') return;
  app.setLoginItemSettings({ openAtLogin: enabled });
}

app.on('second-instance', () => {
  openSettingsWindow();
});

app.whenReady().then(() => {
  // If another instance already holds the lock, this one is redundant — bail
  // before creating a duplicate tray/shortcut/recorder window.
  if (!gotLock) return;

  initLogger();

  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  Menu.setApplicationMenu(null);

  recorderWindow = createRecorderWindow();
  createOverlayWindow();

  createTray({
    onOpenSettings: openSettingsWindow,
    onQuit: () => app.quit()
  });

  const settings = getSettings();
  applyShortcut(settings.shortcut);
  applyLaunchAtLogin(settings.launchAtLogin);

  ipcMain.on(CHANNELS.AUDIO_DATA, (_event, arrayBuffer: ArrayBuffer) => {
    void handleAudioData(Buffer.from(arrayBuffer));
  });

  ipcMain.on(CHANNELS.RECORDER_ERROR, (_event, message: string) => {
    reportError(`Microphone/recording error: ${message}`);
  });

  // Forward live audio level from the recorder to the floating overlay so it
  // can animate a real waveform.
  ipcMain.on(CHANNELS.AUDIO_LEVEL, (_event, level: number) => {
    getOverlayWindow()?.webContents.send(CHANNELS.OVERLAY_LEVEL, level);
  });

  // Let the settings window drive recording via its on-screen button, so the
  // app is fully usable even when the global shortcut can't be registered.
  ipcMain.on(CHANNELS.TOGGLE_RECORDING, () => toggleRecording());

  // The settings window queries current state / shortcut status when it opens.
  ipcMain.handle(CHANNELS.GET_STATE, () => currentState);
  ipcMain.handle(CHANNELS.GET_SHORTCUT_OK, () => shortcutOk);
  ipcMain.handle(CHANNELS.GET_SETTINGS, () => getSettings());

  ipcMain.handle(CHANNELS.SET_SETTINGS, (_event, partial) => {
    const previousShortcut = getSettings().shortcut;
    const updated = setSettings(partial);

    if (partial.shortcut && partial.shortcut !== previousShortcut) {
      const success = applyShortcut(updated.shortcut);
      if (!success) {
        // Revert to the previous, working shortcut if the new one couldn't be claimed.
        setSettings({ shortcut: previousShortcut });
        applyShortcut(previousShortcut);
        return getSettings();
      }
    }

    if (partial.launchAtLogin !== undefined) {
      applyLaunchAtLogin(updated.launchAtLogin);
    }

    return updated;
  });

  // History IPC.
  ipcMain.handle(CHANNELS.HISTORY_GET, () => getHistory());
  ipcMain.handle(CHANNELS.HISTORY_DELETE, (_event, id: string): HistoryItem[] => {
    deleteHistoryItem(id);
    return getHistory();
  });
  ipcMain.handle(CHANNELS.HISTORY_CLEAR, (): HistoryItem[] => {
    clearHistory();
    return getHistory();
  });
  ipcMain.handle(CHANNELS.HISTORY_EXPORT, () => exportHistory());

  if (!settings.onboarded) {
    setSettings({ onboarded: true });
  }

  // Show the main window on launch so there's always a visible, usable UI.
  // The one exception is a silent auto-start at login.
  const openedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin;
  if (!openedAtLogin) {
    openSettingsWindow();
  }
});

// Clicking the dock icon (macOS) or relaunching reopens the window.
app.on('activate', () => {
  openSettingsWindow();
});

app.on('window-all-closed', () => {
  // Keep running in the tray; this is a background utility app.
});

app.on('before-quit', () => {
  unregisterAll();
  destroyTray();
  log('info', 'Shutting down');
  closeLogger();
});
