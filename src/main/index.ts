import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { CHANNELS, AppState } from '../shared/types';
import { getSettings, setSettings } from './store';
import { createRecorderWindow } from './recorder-window';
import { registerToggleShortcut, unregisterAll } from './shortcut-manager';
import { createTray, destroyTray, updateTrayState } from './tray';
import { transcribeWav, tempWavPath } from './transcriber';
import { pasteAtCursor } from './paste';

// Single instance lock: a hotkey-driven utility app makes no sense running twice.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let recorderWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let currentState: AppState = 'idle';
let shortcutOk = false;

function setState(state: AppState): void {
  currentState = state;
  updateTrayState(state);
  settingsWindow?.webContents.send(CHANNELS.STATE_CHANGED, state);
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 620,
    resizable: false,
    title: 'WhisperKey Settings',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
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
  setState('recording');
  const settings = getSettings();
  if (settings.playSounds) {
    recorderWindow?.webContents.send(CHANNELS.PLAY_SOUND, 'start');
  }
  recorderWindow?.webContents.send(CHANNELS.START_RECORDING);
}

function endRecording(): void {
  setState('transcribing');
  const settings = getSettings();
  if (settings.playSounds) {
    recorderWindow?.webContents.send(CHANNELS.PLAY_SOUND, 'stop');
  }
  recorderWindow?.webContents.send(CHANNELS.STOP_RECORDING);
}

async function handleAudioData(buffer: Buffer): Promise<void> {
  // A WAV header alone is 44 bytes; anything at or below that carries no audio.
  if (buffer.length <= 44) {
    setState('idle');
    return;
  }

  const wavPath = tempWavPath();
  try {
    fs.writeFileSync(wavPath, buffer);
    const settings = getSettings();
    const text = await transcribeWav(wavPath, settings.modelName);

    if (text) {
      await pasteAtCursor(text);
    }
    setState('idle');
  } catch (err) {
    console.error('Transcription failed:', err);
    setState('error');
    setTimeout(() => setState('idle'), 2500);
  } finally {
    fs.unlink(wavPath, () => undefined);
  }
}

function applyShortcut(accelerator: string): boolean {
  shortcutOk = registerToggleShortcut(accelerator, toggleRecording);
  settingsWindow?.webContents.send(CHANNELS.GET_SHORTCUT_OK, shortcutOk);
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

  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  Menu.setApplicationMenu(null);

  recorderWindow = createRecorderWindow();

  createTray({
    onOpenSettings: openSettingsWindow,
    onQuit: () => app.quit()
  });

  const settings = getSettings();
  const ok = applyShortcut(settings.shortcut);
  if (!ok) {
    console.error(`Failed to register shortcut "${settings.shortcut}"`);
  }
  applyLaunchAtLogin(settings.launchAtLogin);

  ipcMain.on(CHANNELS.AUDIO_DATA, (_event, arrayBuffer: ArrayBuffer) => {
    void handleAudioData(Buffer.from(arrayBuffer));
  });

  ipcMain.on(CHANNELS.RECORDER_ERROR, (_event, message: string) => {
    console.error('Recorder error:', message);
    setState('error');
    setTimeout(() => setState('idle'), 2500);
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

  if (!settings.onboarded) {
    setSettings({ onboarded: true });
  }

  // Show the main window on launch so there's always a visible, usable UI
  // (with a Record button and the shortcut). The one exception is a silent
  // auto-start at login, where popping a window would be intrusive.
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
});
