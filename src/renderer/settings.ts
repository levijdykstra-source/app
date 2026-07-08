import { ipcRenderer } from 'electron';
import { AppSettings, AppState, CHANNELS, WHISPER_MODELS } from '../shared/types';

const recordBtn = document.getElementById('record-btn') as HTMLButtonElement;
const shortcutBtn = document.getElementById('shortcut-btn') as HTMLButtonElement;
const shortcutWarning = document.getElementById('shortcut-warning') as HTMLParagraphElement;
const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
const playSoundsCheckbox = document.getElementById('play-sounds') as HTMLInputElement;
const launchAtLoginCheckbox = document.getElementById('launch-at-login') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const errorBanner = document.getElementById('error-banner') as HTMLParagraphElement;

let listeningForShortcut = false;

function showError(message: string): void {
  errorBanner.hidden = false;
  errorBanner.textContent = `⚠️ ${message}`;
}

function clearError(): void {
  errorBanner.hidden = true;
  errorBanner.textContent = '';
}

function renderState(state: AppState): void {
  const labels: Record<AppState, string> = {
    idle: 'Idle — press Record or your shortcut to start',
    recording: 'Recording… press Record or the shortcut again to stop',
    transcribing: 'Transcribing locally…',
    error: 'Something went wrong — try again'
  };
  statusEl.textContent = labels[state];

  if (state === 'recording') clearError();

  recordBtn.classList.toggle('recording', state === 'recording');
  recordBtn.classList.toggle('busy', state === 'transcribing');
  recordBtn.disabled = state === 'transcribing';

  if (state === 'recording') {
    recordBtn.textContent = '■ Stop';
  } else if (state === 'transcribing') {
    recordBtn.textContent = 'Transcribing…';
  } else {
    recordBtn.textContent = '● Record';
  }
}

function renderShortcutOk(ok: boolean): void {
  shortcutWarning.hidden = ok;
}

recordBtn.addEventListener('click', () => {
  clearError();
  ipcRenderer.send(CHANNELS.TOGGLE_RECORDING);
});

function populateModels(selected: string): void {
  modelSelect.innerHTML = '';
  for (const model of WHISPER_MODELS) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = `${model.label} — ${model.description}`;
    option.selected = model.id === selected;
    modelSelect.appendChild(option);
  }
}

function renderSettings(settings: AppSettings): void {
  shortcutBtn.textContent = settings.shortcut;
  populateModels(settings.modelName);
  playSoundsCheckbox.checked = settings.playSounds;
  launchAtLoginCheckbox.checked = settings.launchAtLogin;
}

async function loadSettings(): Promise<void> {
  const settings: AppSettings = await ipcRenderer.invoke(CHANNELS.GET_SETTINGS);
  renderSettings(settings);
}

const NON_MODIFIER_KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  Escape: 'Esc',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Tab: 'Tab',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown'
};

function isModifierKey(key: string): boolean {
  return ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(key);
}

function eventToAccelerator(e: KeyboardEvent): string | null {
  if (isModifierKey(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.metaKey) parts.push('Command');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  if (parts.length === 0) return null; // require at least one modifier to avoid accidental global capture

  let key = NON_MODIFIER_KEY_MAP[e.key];
  if (!key) {
    if (/^[a-zA-Z0-9]$/.test(e.key)) {
      key = e.key.toUpperCase();
    } else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) {
      key = e.key;
    } else if (e.code.startsWith('Key') && e.code.length === 4) {
      key = e.code.slice(3);
    } else {
      return null;
    }
  }

  parts.push(key);
  return parts.join('+');
}

function startListeningForShortcut(): void {
  listeningForShortcut = true;
  shortcutBtn.textContent = 'Press a key combination…';
  shortcutBtn.classList.add('listening');
}

function stopListeningForShortcut(): void {
  listeningForShortcut = false;
  shortcutBtn.classList.remove('listening');
}

shortcutBtn.addEventListener('click', () => {
  if (!listeningForShortcut) startListeningForShortcut();
});

window.addEventListener('keydown', async (e) => {
  if (!listeningForShortcut) return;
  e.preventDefault();

  if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    stopListeningForShortcut();
    void loadSettings();
    return;
  }

  const accelerator = eventToAccelerator(e);
  if (!accelerator) return;

  stopListeningForShortcut();
  const updated: AppSettings = await ipcRenderer.invoke(CHANNELS.SET_SETTINGS, {
    shortcut: accelerator
  });
  // The main process reverts to the previous shortcut if the requested one
  // couldn't be registered (already claimed by another app) — tell the user.
  if (updated.shortcut !== accelerator) {
    statusEl.textContent = `"${accelerator}" is unavailable (in use by another app). Kept "${updated.shortcut}".`;
  }
  renderSettings(updated);
});

modelSelect.addEventListener('change', async () => {
  await ipcRenderer.invoke(CHANNELS.SET_SETTINGS, { modelName: modelSelect.value });
});

playSoundsCheckbox.addEventListener('change', async () => {
  await ipcRenderer.invoke(CHANNELS.SET_SETTINGS, { playSounds: playSoundsCheckbox.checked });
});

launchAtLoginCheckbox.addEventListener('change', async () => {
  await ipcRenderer.invoke(CHANNELS.SET_SETTINGS, {
    launchAtLogin: launchAtLoginCheckbox.checked
  });
});

ipcRenderer.on(CHANNELS.STATE_CHANGED, (_event, state: AppState) => {
  renderState(state);
});

ipcRenderer.on(CHANNELS.GET_SHORTCUT_OK, (_event, ok: boolean) => {
  renderShortcutOk(ok);
});

ipcRenderer.on(CHANNELS.APP_ERROR, (_event, message: string) => {
  showError(message);
});

async function init(): Promise<void> {
  await loadSettings();
  const state: AppState = await ipcRenderer.invoke(CHANNELS.GET_STATE);
  renderState(state);
  const shortcutOk: boolean = await ipcRenderer.invoke(CHANNELS.GET_SHORTCUT_OK);
  renderShortcutOk(shortcutOk);
}

void init();
