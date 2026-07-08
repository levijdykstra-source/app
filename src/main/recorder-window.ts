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
      nodeIntegration: true,
      contextIsolation: false,
      // Required: since Electron 20 renderers are sandboxed by default, which
      // disables Node.js (require/__dirname) in the page even with
      // nodeIntegration on. Without this the recorder script never loads.
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

  const htmlPath = path.join(__dirname, '..', 'renderer', 'recorder.html');
  const targetUrl = url.format({
    pathname: htmlPath,
    protocol: 'file:',
    slashes: true,
    query: { soundsDir }
  });

  win.loadURL(targetUrl);

  return win;
}
