import { Notification } from 'electron';

/**
 * Shows a native OS notification (Windows Action Center / macOS Notification
 * Center). Silent by design — we play our own start/stop cues — and a no-op
 * when the platform reports notifications aren't supported.
 */
export function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  try {
    new Notification({ title, body, silent: true }).show();
  } catch {
    /* never let a notification failure break the flow */
  }
}
