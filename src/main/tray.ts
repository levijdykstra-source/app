import { Menu, nativeImage, Tray } from 'electron';
import path from 'path';
import { AppState } from '../shared/types';

let tray: Tray | null = null;

const STATE_LABELS: Record<AppState, string> = {
  idle: 'WhisperKey — Idle',
  recording: 'WhisperKey — Recording…',
  transcribing: 'WhisperKey — Transcribing…',
  error: 'WhisperKey — Error'
};

function iconForState(state: AppState): Electron.NativeImage {
  const fileName =
    state === 'recording' ? 'tray-recording.png' : state === 'error' ? 'tray-error.png' : 'tray-idle.png';
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', fileName);
  const image = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') {
    image.setTemplateImage(state === 'idle');
  }
  return image;
}

export interface TrayCallbacks {
  onOpenSettings: () => void;
  onQuit: () => void;
}

export function createTray(callbacks: TrayCallbacks): Tray {
  tray = new Tray(iconForState('idle'));
  tray.setToolTip(STATE_LABELS.idle);

  const menu = Menu.buildFromTemplate([
    { label: 'Open Settings…', click: () => callbacks.onOpenSettings() },
    { type: 'separator' },
    { label: 'Quit WhisperKey', click: () => callbacks.onQuit() }
  ]);
  tray.setContextMenu(menu);

  tray.on('click', () => callbacks.onOpenSettings());

  return tray;
}

export function updateTrayState(state: AppState): void {
  if (!tray) return;
  tray.setImage(iconForState(state));
  tray.setToolTip(STATE_LABELS[state]);
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
