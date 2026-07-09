import { contextBridge, ipcRenderer, clipboard, IpcRendererEvent } from 'electron';
import { CHANNELS } from '../shared/types';

// Only IPC channels the app actually defines may cross the bridge.
const allowed = new Set<string>(Object.values(CHANNELS));

function assertChannel(channel: string): void {
  if (!allowed.has(channel)) {
    throw new Error(`Blocked IPC on unknown channel: ${channel}`);
  }
}

/**
 * The single, minimal surface exposed to renderer code. Renderers run with
 * contextIsolation ON and nodeIntegration OFF, so they have no `require`,
 * `module`, or `exports` — this bridge is their only path to Electron/IPC.
 */
const api = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    assertChannel(channel);
    return ipcRenderer.invoke(channel, ...args);
  },
  send(channel: string, ...args: unknown[]): void {
    assertChannel(channel);
    ipcRenderer.send(channel, ...args);
  },
  /** Subscribe to a channel; returns an unsubscribe function. */
  on(channel: string, callback: (...args: unknown[]) => void): () => void {
    assertChannel(channel);
    const listener = (_event: IpcRendererEvent, ...args: unknown[]): void => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  clipboardWrite(text: string): void {
    clipboard.writeText(text);
  }
};

contextBridge.exposeInMainWorld('whisper', api);

export type WhisperApi = typeof api;
