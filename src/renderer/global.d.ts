// The renderer runs with contextIsolation ON / nodeIntegration OFF. Its only
// bridge to Electron is `window.whisper`, exposed by src/preload/preload.ts.
export {};

declare global {
  interface Window {
    whisper: {
      invoke(channel: string, ...args: unknown[]): Promise<any>;
      send(channel: string, ...args: unknown[]): void;
      on(channel: string, callback: (...args: any[]) => void): () => void;
      clipboardWrite(text: string): void;
    };
  }
}
