import {
  AppSettings,
  AppState,
  CHANNELS,
  WHISPER_MODELS,
  LANGUAGES,
  findModel,
  HistoryItem,
  DEFAULT_SETTINGS
} from '../shared/types';

const api = window.whisper;

// ---- element refs -------------------------------------------------------
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const errorBanner = $<HTMLParagraphElement>('error-banner');
const recordBtn = $<HTMLButtonElement>('record-btn');
const statusEl = $<HTMLParagraphElement>('status');
const micStatusEl = $<HTMLSpanElement>('mic-status');
const homeModelEl = $<HTMLSpanElement>('home-model');
const homeShortcutEl = $<HTMLSpanElement>('home-shortcut');

const historyListEl = $<HTMLDivElement>('history-list');
const historyEmptyEl = $<HTMLParagraphElement>('history-empty');
const historySearchEl = $<HTMLInputElement>('history-search');
const exportHistoryBtn = $<HTMLButtonElement>('export-history');
const clearHistoryBtn = $<HTMLButtonElement>('clear-history');

const deviceSelect = $<HTMLSelectElement>('device-select');
const testMicBtn = $<HTMLButtonElement>('test-mic');
const meterFill = $<HTMLDivElement>('meter-fill');
const noiseSuppression = $<HTMLInputElement>('noise-suppression');
const autoGain = $<HTMLInputElement>('auto-gain');
const playSounds = $<HTMLInputElement>('play-sounds');
const showOverlay = $<HTMLInputElement>('show-overlay');

const shortcutBtn = $<HTMLButtonElement>('shortcut-btn');
const shortcutWarning = $<HTMLParagraphElement>('shortcut-warning');
const restoreShortcutBtn = $<HTMLButtonElement>('restore-shortcut');

const modelSelect = $<HTMLSelectElement>('model-select');
const modelMeta = $<HTMLParagraphElement>('model-meta');
const languageSelect = $<HTMLSelectElement>('language-select');

const outputMode = $<HTMLSelectElement>('output-mode');
const addNewline = $<HTMLInputElement>('add-newline');
const saveHistory = $<HTMLInputElement>('save-history');
const showNotifications = $<HTMLInputElement>('show-notifications');
const launchAtLogin = $<HTMLInputElement>('launch-at-login');

let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };
let historyItems: HistoryItem[] = [];
let listeningForShortcut = false;

// ---- errors -------------------------------------------------------------
function showError(message: string): void {
  errorBanner.hidden = false;
  errorBanner.textContent = `⚠️ ${message}`;
}
function clearError(): void {
  errorBanner.hidden = true;
  errorBanner.textContent = '';
}

// ---- tabs ---------------------------------------------------------------
function setupTabs(): void {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// ---- settings persistence ----------------------------------------------
async function save(partial: Partial<AppSettings>): Promise<void> {
  currentSettings = await api.invoke(CHANNELS.SET_SETTINGS, partial);
  renderSettings(currentSettings);
}

// ---- rendering ----------------------------------------------------------
function renderState(state: AppState): void {
  const labels: Record<AppState, string> = {
    idle: 'Idle — press Record or your shortcut to start',
    recording: 'Recording… press Record or the shortcut again to stop',
    transcribing: 'Transcribing locally… (first run downloads the model)',
    error: 'Something went wrong — see the message above'
  };
  statusEl.textContent = labels[state];
  if (state === 'recording') clearError();

  recordBtn.classList.toggle('recording', state === 'recording');
  recordBtn.classList.toggle('busy', state === 'transcribing');
  recordBtn.disabled = state === 'transcribing';
  recordBtn.textContent =
    state === 'recording' ? '■ Stop' : state === 'transcribing' ? 'Transcribing…' : '● Record';
}

function renderShortcutOk(ok: boolean): void {
  shortcutWarning.hidden = ok;
}

function populateModels(selected: string): void {
  modelSelect.innerHTML = '';
  for (const model of WHISPER_MODELS) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    option.selected = model.id === selected;
    modelSelect.appendChild(option);
  }
  renderModelMeta(selected);
}

function renderModelMeta(id: string): void {
  const m = findModel(id);
  modelMeta.textContent = m
    ? `Download ~${m.sizeMB} MB · RAM ~${m.ramMB} MB · ${m.speed}${m.multilingual ? ' · multilingual' : ''}`
    : '';
}

function populateLanguages(selected: string): void {
  languageSelect.innerHTML = '';
  for (const lang of LANGUAGES) {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.label;
    option.selected = lang.code === selected;
    languageSelect.appendChild(option);
  }
}

async function populateDevices(selectedId: string): Promise<void> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'audioinput');
    deviceSelect.innerHTML = '';

    const dflt = document.createElement('option');
    dflt.value = '';
    dflt.textContent = 'System default';
    dflt.selected = selectedId === '';
    deviceSelect.appendChild(dflt);

    inputs.forEach((d, i) => {
      const option = document.createElement('option');
      option.value = d.deviceId;
      option.textContent = d.label || `Microphone ${i + 1}`;
      option.selected = d.deviceId === selectedId;
      deviceSelect.appendChild(option);
    });
  } catch (err) {
    showError(`Could not list microphones: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function renderSettings(s: AppSettings): void {
  // Home cards
  homeModelEl.textContent = findModel(s.modelName)?.label ?? s.modelName;
  homeShortcutEl.textContent = s.shortcut;
  micStatusEl.textContent =
    deviceSelect.options[deviceSelect.selectedIndex]?.textContent || 'System default';

  // Hotkey
  shortcutBtn.textContent = s.shortcut;

  // Recording
  noiseSuppression.checked = s.noiseSuppression;
  autoGain.checked = s.autoGain;
  playSounds.checked = s.playSounds;
  showOverlay.checked = s.showOverlay;

  // AI
  populateModels(s.modelName);
  populateLanguages(s.language);

  // Output
  outputMode.value = s.outputMode;
  addNewline.checked = s.addNewline;
  saveHistory.checked = s.saveHistory;
  showNotifications.checked = s.showNotifications;
  launchAtLogin.checked = s.launchAtLogin;
}

// ---- history ------------------------------------------------------------
function renderHistory(): void {
  const filter = historySearchEl.value.trim().toLowerCase();
  const items = filter
    ? historyItems.filter((i) => i.text.toLowerCase().includes(filter))
    : historyItems;

  historyEmptyEl.hidden = historyItems.length > 0;
  historyListEl.innerHTML = '';

  for (const item of items) {
    const el = document.createElement('div');
    el.className = 'history-item';

    const meta = document.createElement('div');
    meta.className = 'meta';

    const when = document.createElement('span');
    when.textContent = new Date(item.timestamp).toLocaleString();

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-sm';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      api.clipboardWrite(item.text);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-sm danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      historyItems = await api.invoke(CHANNELS.HISTORY_DELETE, item.id);
      renderHistory();
    });

    actions.append(copyBtn, delBtn);
    meta.append(when, actions);

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = item.text;

    el.append(meta, text);
    historyListEl.appendChild(el);
  }
}

async function loadHistory(): Promise<void> {
  historyItems = await api.invoke(CHANNELS.HISTORY_GET);
  renderHistory();
}

// ---- microphone test ----------------------------------------------------
let testStream: MediaStream | null = null;
let testContext: AudioContext | null = null;
let testRaf = 0;

async function startMicTest(): Promise<void> {
  try {
    testStream = await navigator.mediaDevices.getUserMedia({
      audio: currentSettings.inputDeviceId
        ? { deviceId: { exact: currentSettings.inputDeviceId } }
        : true
    });
    // Labels are only available after permission is granted — refresh the list.
    void populateDevices(currentSettings.inputDeviceId);

    testContext = new AudioContext();
    const source = testContext.createMediaStreamSource(testStream);
    const analyser = testContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const loop = (): void => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
      meterFill.style.width = `${Math.min(100, (peak / 128) * 140)}%`;
      testRaf = requestAnimationFrame(loop);
    };
    loop();

    testMicBtn.textContent = 'Stop test';
  } catch (err) {
    showError(`Microphone test failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function stopMicTest(): void {
  cancelAnimationFrame(testRaf);
  testRaf = 0;
  testStream?.getTracks().forEach((t) => t.stop());
  void testContext?.close();
  testStream = null;
  testContext = null;
  meterFill.style.width = '0%';
  testMicBtn.textContent = 'Test microphone';
}

// ---- shortcut capture ---------------------------------------------------
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
  if (parts.length === 0) return null; // require a modifier to avoid capturing plain keys

  let key = NON_MODIFIER_KEY_MAP[e.key];
  if (!key) {
    if (/^[a-zA-Z0-9]$/.test(e.key)) key = e.key.toUpperCase();
    else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.key)) key = e.key;
    else if (e.code.startsWith('Key') && e.code.length === 4) key = e.code.slice(3);
    else return null;
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

// ---- wire up events -----------------------------------------------------
recordBtn.addEventListener('click', () => {
  clearError();
  api.send(CHANNELS.TOGGLE_RECORDING);
});

historySearchEl.addEventListener('input', renderHistory);
exportHistoryBtn.addEventListener('click', async () => {
  const saved = await api.invoke(CHANNELS.HISTORY_EXPORT);
  if (saved) statusEl.textContent = `Exported to ${saved}`;
});
clearHistoryBtn.addEventListener('click', async () => {
  historyItems = await api.invoke(CHANNELS.HISTORY_CLEAR);
  renderHistory();
});

deviceSelect.addEventListener('change', () => void save({ inputDeviceId: deviceSelect.value }));
testMicBtn.addEventListener('click', () => (testStream ? stopMicTest() : void startMicTest()));
noiseSuppression.addEventListener('change', () => void save({ noiseSuppression: noiseSuppression.checked }));
autoGain.addEventListener('change', () => void save({ autoGain: autoGain.checked }));
playSounds.addEventListener('change', () => void save({ playSounds: playSounds.checked }));
showOverlay.addEventListener('change', () => void save({ showOverlay: showOverlay.checked }));

modelSelect.addEventListener('change', () => void save({ modelName: modelSelect.value }));
languageSelect.addEventListener('change', () => void save({ language: languageSelect.value }));

outputMode.addEventListener('change', () => void save({ outputMode: outputMode.value as AppSettings['outputMode'] }));
addNewline.addEventListener('change', () => void save({ addNewline: addNewline.checked }));
saveHistory.addEventListener('change', () => void save({ saveHistory: saveHistory.checked }));
showNotifications.addEventListener('change', () => void save({ showNotifications: showNotifications.checked }));
launchAtLogin.addEventListener('change', () => void save({ launchAtLogin: launchAtLogin.checked }));

restoreShortcutBtn.addEventListener('click', () => void save({ shortcut: DEFAULT_SETTINGS.shortcut }));

shortcutBtn.addEventListener('click', () => {
  if (!listeningForShortcut) startListeningForShortcut();
});

window.addEventListener('keydown', async (e) => {
  if (!listeningForShortcut) return;
  e.preventDefault();

  if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    stopListeningForShortcut();
    renderSettings(currentSettings);
    return;
  }

  const accelerator = eventToAccelerator(e);
  if (!accelerator) return;

  stopListeningForShortcut();
  const updated: AppSettings = await api.invoke(CHANNELS.SET_SETTINGS, {
    shortcut: accelerator
  });
  if (updated.shortcut !== accelerator) {
    showError(`"${accelerator}" is unavailable (in use by another app). Kept "${updated.shortcut}".`);
  }
  currentSettings = updated;
  renderSettings(updated);
});

// ---- IPC listeners ------------------------------------------------------
api.on(CHANNELS.STATE_CHANGED, (state: AppState) => renderState(state));
api.on(CHANNELS.GET_SHORTCUT_OK, (ok: boolean) => renderShortcutOk(ok));
api.on(CHANNELS.APP_ERROR, (message: string) => showError(message));
api.on(CHANNELS.HISTORY_CHANGED, (items: HistoryItem[]) => {
  historyItems = items;
  renderHistory();
});

// ---- init ---------------------------------------------------------------
async function init(): Promise<void> {
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = `v${__APP_VERSION__}`;

  setupTabs();
  currentSettings = await api.invoke(CHANNELS.GET_SETTINGS);
  await populateDevices(currentSettings.inputDeviceId);
  renderSettings(currentSettings);
  await loadHistory();

  renderState(await api.invoke(CHANNELS.GET_STATE));
  renderShortcutOk(await api.invoke(CHANNELS.GET_SHORTCUT_OK));
}

void init();
