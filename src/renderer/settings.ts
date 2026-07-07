import { ipcRenderer } from 'electron';
import { AppSettings, AppState, CHANNELS, WHISPER_MODELS } from '../shared/types';

const shortcutBtn = document.getElementById('shortcut-btn') as HTMLButtonElement;
const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
const playSoundsCheckbox = document.getElementById('play-sounds') as HTMLInputElement;
const launchAtLoginCheckbox = document.getElementById('launch-at-login') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;

let listeningForShortcut = false;

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
  const labels: Record<AppState, string> = {
    idle: 'Idle — press your shortcut to start recording',
    recording: 'Recording… press the shortcut again to stop',
    transcribing: 'Transcribing locally…',
    error: 'Something went wrong — check the tray menu'
  };
  statusEl.textContent = labels[state];
});

void loadSettings();
