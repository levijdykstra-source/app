import { clipboard } from 'electron';

/**
 * Copy-only output mode: leave the transcription on the clipboard for the user
 * to paste manually, and don't restore the previous contents.
 */
export function copyToClipboard(text: string): void {
  if (!text) return;
  clipboard.writeText(text);
}

let nutKeyboard: typeof import('@nut-tree-fork/nut-js').keyboard | null = null;
let NutKey: typeof import('@nut-tree-fork/nut-js').Key | null = null;

async function loadNut() {
  if (!nutKeyboard || !NutKey) {
    const nut = await import('@nut-tree-fork/nut-js');
    nutKeyboard = nut.keyboard;
    NutKey = nut.Key;
    nutKeyboard.config.autoDelayMs = 25;
  }
  return { keyboard: nutKeyboard, Key: NutKey };
}

/**
 * Puts `text` on the clipboard, then simulates the platform paste shortcut
 * (Cmd+V on macOS, Ctrl+V on Windows/Linux) so it lands wherever the user's
 * cursor currently is focused.
 */
export async function pasteAtCursor(text: string): Promise<void> {
  if (!text) return;

  const previousClipboard = clipboard.readText();
  clipboard.writeText(text);

  const { keyboard, Key } = await loadNut();
  if (!keyboard || !Key) throw new Error('nut-js unavailable');

  const modifier = process.platform === 'darwin' ? Key.LeftSuper : Key.LeftControl;

  await keyboard.pressKey(modifier, Key.V);
  await keyboard.releaseKey(modifier, Key.V);

  // Only restore the previous clipboard once we know the paste keystroke was
  // actually sent. If simulation had thrown (e.g. macOS Accessibility not
  // granted), we deliberately leave the transcription on the clipboard so the
  // user can paste it manually rather than silently losing it.
  setTimeout(() => {
    clipboard.writeText(previousClipboard);
  }, 1500);
}
