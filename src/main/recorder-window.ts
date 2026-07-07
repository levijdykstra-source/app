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
      backgroundThrottling: false
    }
  });

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
