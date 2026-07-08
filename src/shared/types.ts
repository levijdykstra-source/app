export type AppState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface WhisperModelOption {
  id: string;
  label: string;
  description: string;
}

export const WHISPER_MODELS: WhisperModelOption[] = [
  { id: 'Xenova/whisper-tiny.en', label: 'Tiny (English)', description: 'Fastest, least accurate. ~75MB' },
  { id: 'Xenova/whisper-base.en', label: 'Base (English)', description: 'Good balance of speed/accuracy. ~142MB' },
  { id: 'Xenova/whisper-small.en', label: 'Small (English)', description: 'More accurate, slower. ~466MB' },
  { id: 'Xenova/whisper-base', label: 'Base (Multilingual)', description: 'Multilingual support. ~142MB' },
  { id: 'Xenova/whisper-small', label: 'Small (Multilingual)', description: 'Multilingual, more accurate. ~466MB' }
];

export interface AppSettings {
  shortcut: string;
  modelName: string;
  launchAtLogin: boolean;
  playSounds: boolean;
  // Internal: whether the one-time onboarding settings window has been shown.
  // Not exposed in the settings UI.
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'CommandOrControl+Shift+Space',
  modelName: 'Xenova/whisper-base.en',
  launchAtLogin: false,
  playSounds: true,
  onboarded: false
};

export interface IpcChannels {
  'settings:get': () => AppSettings;
  'settings:set': (settings: Partial<AppSettings>) => AppSettings;
}

export const CHANNELS = {
  START_RECORDING: 'recorder:start',
  STOP_RECORDING: 'recorder:stop',
  AUDIO_DATA: 'recorder:audio-data',
  RECORDER_ERROR: 'recorder:error',
  PLAY_SOUND: 'sound:play',
  STATE_CHANGED: 'app:state-changed',
  APP_ERROR: 'app:error',
  TOGGLE_RECORDING: 'app:toggle-recording',
  GET_STATE: 'app:get-state',
  GET_SHORTCUT_OK: 'app:get-shortcut-ok',
  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set',
  SETTINGS_CHANGED: 'settings:changed',
  SET_SHORTCUT: 'settings:set-shortcut',
  TRANSCRIPT_RESULT: 'app:transcript-result',
  OPEN_SETTINGS: 'app:open-settings',
  QUIT: 'app:quit'
} as const;
