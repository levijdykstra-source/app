import { CHANNELS } from '../shared/types';

const timerEl = document.getElementById('timer') as HTMLDivElement;
const canvas = document.getElementById('wave') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');

const BAR_COUNT = 28;
const levels: number[] = new Array(BAR_COUNT).fill(0.05);

let startedAt = 0;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let rafId = 0;

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function tickTimer(): void {
  timerEl.textContent = formatElapsed(Date.now() - startedAt);
}

function start(): void {
  startedAt = Date.now();
  tickTimer();
  timerInterval = setInterval(tickTimer, 250);
  if (!rafId) drawLoop();
}

function stop(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  for (let i = 0; i < levels.length; i++) levels[i] = 0.05;
}

function pushLevel(level: number): void {
  levels.push(Math.max(0.05, level));
  if (levels.length > BAR_COUNT) levels.shift();
}

function drawLoop(): void {
  rafId = requestAnimationFrame(drawLoop);
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const accent = getComputedStyle(document.body).getPropertyValue('color') || '#f2f2f5';
  ctx.fillStyle = accent.trim() || '#f2f2f5';

  const barWidth = w / BAR_COUNT;
  const gap = Math.max(1, barWidth * 0.35);
  for (let i = 0; i < BAR_COUNT; i++) {
    const level = levels[i] ?? 0.05;
    const barHeight = Math.max(2, level * h);
    const x = i * barWidth;
    const y = (h - barHeight) / 2;
    ctx.globalAlpha = 0.5 + level * 0.5;
    ctx.fillRect(x + gap / 2, y, barWidth - gap, barHeight);
  }
  ctx.globalAlpha = 1;
}

window.whisper.on(CHANNELS.OVERLAY_SHOW, () => start());
window.whisper.on(CHANNELS.OVERLAY_HIDE, () => stop());
window.whisper.on(CHANNELS.OVERLAY_LEVEL, (level: number) => pushLevel(level));

// Kick off the draw loop immediately; it's cheap and idles at low levels.
drawLoop();
