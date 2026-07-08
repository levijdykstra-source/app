import Store from 'electron-store';
import { AppSettings, DEFAULT_SETTINGS } from '../shared/types';

const store = new Store<AppSettings>({
  name: 'whisperkey-settings',
  defaults: DEFAULT_SETTINGS
});

export function getSettings(): AppSettings {
  // Merge over defaults so newly-added settings keys always have a value,
  // even for users upgrading from an older config file.
  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const value = store.get(key);
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      store.set(key as keyof AppSettings, value as never);
    }
  }
  return getSettings();
}
