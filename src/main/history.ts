import fs from 'fs';
import path from 'path';
import os from 'os';
import { app, dialog } from 'electron';
import { HistoryItem } from '../shared/types';
import { log } from './logger';

const MAX_ITEMS = 500;

function historyFilePath(): string {
  return path.join(app.getPath('userData'), 'history.json');
}

function readAll(): HistoryItem[] {
  try {
    const raw = fs.readFileSync(historyFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

function writeAll(items: HistoryItem[]): void {
  try {
    fs.writeFileSync(historyFilePath(), JSON.stringify(items, null, 2), 'utf8');
  } catch (err) {
    log('error', `Failed to persist history: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Newest first. */
export function getHistory(): HistoryItem[] {
  return readAll().sort((a, b) => b.timestamp - a.timestamp);
}

export function addHistoryItem(item: Omit<HistoryItem, 'id' | 'timestamp'>): HistoryItem {
  const full: HistoryItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now()
  };
  const items = readAll();
  items.push(full);
  // Cap the history so the file can't grow forever.
  const trimmed = items.slice(-MAX_ITEMS);
  writeAll(trimmed);
  return full;
}

export function deleteHistoryItem(id: string): void {
  writeAll(readAll().filter((i) => i.id !== id));
}

export function clearHistory(): void {
  writeAll([]);
}

/**
 * Prompts for a location and writes the full transcript history to a plain
 * text file. Returns the chosen path, or null if the user cancelled.
 */
export async function exportHistory(): Promise<string | null> {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export transcript history',
    defaultPath: path.join(os.homedir(), 'whisperkey-transcripts.txt'),
    filters: [{ name: 'Text', extensions: ['txt'] }]
  });
  if (canceled || !filePath) return null;

  const body = getHistory()
    .map((i) => `[${new Date(i.timestamp).toLocaleString()}] (${i.model})\n${i.text}\n`)
    .join('\n');
  fs.writeFileSync(filePath, body, 'utf8');
  return filePath;
}
