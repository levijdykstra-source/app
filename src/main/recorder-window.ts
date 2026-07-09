import { app, BrowserWindow } from 'electron';
import path from 'path';
import url from 'url';

export function createRecorderWindow(): BrowserWindow {
  const soundsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'sounds')
    : path.join(__dirname, '..', '..', 'assets', 'sounds');

  const win = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      // Secure model: no Node.js in the page; the preload exposes window.whisper.
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  // Grant microphone access to our own renderer. Without an explicit handler,
  // Electron can deny getUserMedia in a packaged app, so recording never
  // starts. We only ever request the mic, so approve media and deny the rest.
  const isMediaPermission = (permission: string): boolean =>
    permission === 'media' || permission === 'audioCapture' || permission === 'microphone';

  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(isMediaPermission(permission));
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => isMediaPermission(permission));

  // Pass ready-made file:// URLs for the start/stop sounds so the renderer
  // needs no Node path handling.
  const startSound = url.pathToFileURL(path.join(soundsDir, 'start.wav')).href;
  const stopSound = url.pathToFileURL(path.join(soundsDir, 'stop.wav')).href;

  const htmlPath = path.join(__dirname, '..', 'renderer', 'recorder.html');
  const targetUrl = url.format({
    pathname: htmlPath,
    protocol: 'file:',
    slashes: true,
    query: { startSound, stopSound }
  });

  win.loadURL(targetUrl);

  return win;
}
