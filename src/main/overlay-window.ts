import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { CHANNELS } from '../shared/types';

let overlay: BrowserWindow | null = null;

/**
 * Creates the small, always-on-top floating recording indicator. It is
 * frameless and transparent so only its rounded pill is visible, and it is
 * draggable (see -webkit-app-region in overlay.css). Hidden until recording
 * starts.
 */
export function createOverlayWindow(): BrowserWindow {
  const width = 220;
  const height = 84;
  const { workArea } = screen.getPrimaryDisplay();
  // Bottom-center by default; the user can drag it elsewhere.
  const x = Math.round(workArea.x + (workArea.width - width) / 2);
  const y = Math.round(workArea.y + workArea.height - height - 48);

  overlay = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      // Secure model: no Node.js in the page; the preload exposes window.whisper.
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));

  overlay.on('closed', () => {
    overlay = null;
  });

  return overlay;
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlay;
}

export function showOverlay(): void {
  if (!overlay) return;
  // showInactive keeps focus on the user's current app, so we don't steal it
  // right before pasting.
  overlay.showInactive();
  overlay.webContents.send(CHANNELS.OVERLAY_SHOW);
}

export function hideOverlay(): void {
  if (!overlay) return;
  overlay.webContents.send(CHANNELS.OVERLAY_HIDE);
  overlay.hide();
}
