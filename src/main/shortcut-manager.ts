import { globalShortcut } from 'electron';

let registeredAccelerator: string | null = null;

/**
 * Registers `accelerator` as the sole global shortcut, unregistering
 * whatever was previously registered. Returns false if registration failed
 * (e.g. the combination is already claimed by another app).
 */
export function registerToggleShortcut(accelerator: string, onToggle: () => void): boolean {
  if (registeredAccelerator) {
    globalShortcut.unregister(registeredAccelerator);
    registeredAccelerator = null;
  }

  const success = globalShortcut.register(accelerator, onToggle);
  if (success) {
    registeredAccelerator = accelerator;
  }
  return success;
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll();
  registeredAccelerator = null;
}
