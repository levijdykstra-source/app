import Store from 'electron-store';
import { AppSettings, DEFAULT_SETTINGS } from '../shared/types';

const store = new Store<AppSettings>({
  name: 'whisperkey-settings',
  defaults: DEFAULT_SETTINGS
});

export function getSettings(): AppSettings {
  return {
    shortcut: store.get('shortcut'),
    modelName: store.get('modelName'),
    launchAtLogin: store.get('launchAtLogin'),
    playSounds: store.get('playSounds'),
    onboarded: store.get('onboarded')
  };
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      store.set(key as keyof AppSettings, value as never);
    }
  }
  return getSettings();
}
