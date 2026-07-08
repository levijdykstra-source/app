export type AppState = 'idle' | 'recording' | 'transcribing' | 'error';

export interface WhisperModelOption {
  id: string;
  label: string;
  /** Approximate on-disk download size, in MB. */
  sizeMB: number;
  /** Rough peak RAM while transcribing, in MB. */
  ramMB: number;
  /** Human-friendly relative speed label. */
  speed: string;
  /** Whether the model supports languages other than English. */
  multilingual: boolean;
}

export const WHISPER_MODELS: WhisperModelOption[] = [
  { id: 'Xenova/whisper-tiny.en', label: 'Tiny (English)', sizeMB: 75, ramMB: 300, speed: 'Fastest', multilingual: false },
  { id: 'Xenova/whisper-base.en', label: 'Base (English)', sizeMB: 142, ramMB: 500, speed: 'Fast', multilingual: false },
  { id: 'Xenova/whisper-small.en', label: 'Small (English)', sizeMB: 466, ramMB: 1000, speed: 'Balanced', multilingual: false },
  { id: 'Xenova/whisper-tiny', label: 'Tiny (Multilingual)', sizeMB: 75, ramMB: 300, speed: 'Fastest', multilingual: true },
  { id: 'Xenova/whisper-base', label: 'Base (Multilingual)', sizeMB: 142, ramMB: 500, speed: 'Fast', multilingual: true },
  { id: 'Xenova/whisper-small', label: 'Small (Multilingual)', sizeMB: 466, ramMB: 1000, speed: 'Balanced', multilingual: true },
  { id: 'Xenova/whisper-medium', label: 'Medium (Multilingual)', sizeMB: 1500, ramMB: 2600, speed: 'Slow, most accurate', multilingual: true }
];

export function findModel(id: string): WhisperModelOption | undefined {
  return WHISPER_MODELS.find((m) => m.id === id);
}

/** A subset of common Whisper languages offered for forced selection. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ru', label: 'Russian' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ar', label: 'Arabic' }
];

export type OutputMode = 'paste' | 'copy';

export interface AppSettings {
  shortcut: string;
  modelName: string;
  /** 'auto' or a language code; only applied to multilingual models. */
  language: string;
  /** '' means the system default input device. */
  inputDeviceId: string;
  launchAtLogin: boolean;
  playSounds: boolean;
  showNotifications: boolean;
  showOverlay: boolean;
  outputMode: OutputMode;
  addNewline: boolean;
  noiseSuppression: boolean;
  autoGain: boolean;
  saveHistory: boolean;
  // Internal: whether the one-time onboarding window has been shown.
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  shortcut: 'CommandOrControl+Shift+Space',
  modelName: 'Xenova/whisper-small.en',
  language: 'auto',
  inputDeviceId: '',
  launchAtLogin: false,
  playSounds: true,
  showNotifications: true,
  showOverlay: true,
  outputMode: 'paste',
  addNewline: false,
  noiseSuppression: true,
  autoGain: true,
  saveHistory: true,
  onboarded: false
};

export interface HistoryItem {
  id: string;
  text: string;
  /** Unix epoch milliseconds. */
  timestamp: number;
  model: string;
  /** Recording length in milliseconds, if known. */
  durationMs: number;
}

export const CHANNELS = {
  // Recorder window <-> main
  START_RECORDING: 'recorder:start',
  STOP_RECORDING: 'recorder:stop',
  AUDIO_DATA: 'recorder:audio-data',
  AUDIO_LEVEL: 'recorder:audio-level',
  RECORDER_ERROR: 'recorder:error',
  PLAY_SOUND: 'sound:play',

  // Overlay window <-> main
  OVERLAY_SHOW: 'overlay:show',
  OVERLAY_HIDE: 'overlay:hide',
  OVERLAY_LEVEL: 'overlay:level',

  // App/UI state
  STATE_CHANGED: 'app:state-changed',
  APP_ERROR: 'app:error',
  TOGGLE_RECORDING: 'app:toggle-recording',
  GET_STATE: 'app:get-state',
  GET_SHORTCUT_OK: 'app:get-shortcut-ok',

  // Settings
  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set',

  // History
  HISTORY_GET: 'history:get',
  HISTORY_CHANGED: 'history:changed',
  HISTORY_DELETE: 'history:delete',
  HISTORY_CLEAR: 'history:clear',
  HISTORY_EXPORT: 'history:export'
} as const;
