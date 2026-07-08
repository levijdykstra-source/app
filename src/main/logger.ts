import fs from 'fs';
import path from 'path';
import { app } from 'electron';

let logStream: fs.WriteStream | null = null;
let logFilePath = '';

/**
 * Initializes a simple append-only log file under the app's userData directory
 * (e.g. ~/Library/Application Support/WhisperKey/logs on macOS,
 * %APPDATA%/WhisperKey/logs on Windows). All debugging output is written
 * locally — nothing is ever sent anywhere.
 */
export function initLogger(): void {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    logFilePath = path.join(logsDir, 'whisperkey.log');

    // Keep the log from growing without bound: trim if it exceeds ~1MB.
    try {
      const stat = fs.statSync(logFilePath);
      if (stat.size > 1_000_000) fs.rmSync(logFilePath);
    } catch {
      /* file doesn't exist yet */
    }

    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
    log('info', `--- WhisperKey ${app.getVersion()} started on ${process.platform} ---`);
  } catch (err) {
    console.error('Failed to initialize logger:', err);
  }
}

export function getLogFilePath(): string {
  return logFilePath;
}

export function log(level: 'info' | 'warn' | 'error', message: string): void {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line);
  else console.log(line);
  logStream?.write(line + '\n');
}

export function closeLogger(): void {
  logStream?.end();
  logStream = null;
}
