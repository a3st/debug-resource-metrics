// This file is a browser script. Type-only imports emit no CommonJS runtime code.
type MetricsMessage = import('../protocol').MetricsMessage;
type Sample = import('../protocol').Sample;
type ViewMessage = import('../protocol').ViewMessage;
declare function acquireVsCodeApi(): { postMessage(message: ViewMessage): void };
const api = acquireVsCodeApi();
const el = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};
let current: MetricsMessage | undefined;
function duration(seconds: number): string {
  const value = Math.floor(seconds);
  return `${Math.floor(value / 3600).toString().padStart(2, '0')}:${Math.floor(value / 60 % 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
function draw(id: string, samples: Sample[], key: 'cpu' | 'memory', minimum: number, color: string): void {
  const canvas = el<HTMLCanvasElement>(id), width = canvas.clientWidth, height = canvas.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(ratio, ratio);
  const style = getComputedStyle(document.body);
  const foreground = style.getPropertyValue('--vscode-descriptionForeground').trim() || '#999';
  const line = style.getPropertyValue(color).trim() || '#4ba3ff';
  const max = Math.max(minimum, ...samples.map(s => s[key] ?? 0)) * 1.1;
  const left = 43, right = Math.max(left + 1, width - 6), top = 12, bottom = height - 20;
  ctx.font = '10px sans-serif';
  for (let i = 0; i <= 2; i++) {
    const y = top + (bottom - top) * i / 2;
    ctx.globalAlpha = .2; ctx.strokeStyle = foreground; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = foreground; ctx.fillText((max * (1 - i / 2)).toFixed(0), 2, y + 3);
  }
  if (!samples.length) { ctx.fillText(current?.strings.waiting || '', left, 55); return; }
  const start = samples[0].time, end = samples.at(-1)!.time;
  ctx.fillText(`${start.toFixed(0)}${current?.strings.seconds || ""}`, left, height - 3);
  ctx.textAlign = 'right'; ctx.fillText(`${end.toFixed(0)}${current?.strings.seconds || ""}`, right, height - 3); ctx.textAlign = 'left';
  ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath();
  let pen = false;
  for (const sample of samples) {
    if (sample[key] === null) { pen = false; continue; }
    const x = left + (sample.time - start) / Math.max(1, end - start) * (right - left);
    const y = bottom - (sample[key] ?? 0) / max * (bottom - top);
    if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    pen = true;
  }
  ctx.stroke();
  const last = samples.at(-1)!;
  if (last[key] !== null) { ctx.beginPath(); ctx.arc(left + (last.time - start) / Math.max(1, end - start) * (right - left), bottom - (last[key] ?? 0) / max * (bottom - top), 2.5, 0, 2 * Math.PI); ctx.fillStyle = line; ctx.fill(); }
}
function render(message: MetricsMessage): void {
  current = message;
  const strings = message.strings;
  el('sessions').setAttribute('aria-label', strings.session);
  el('cpuLabel').textContent = strings.cpu;
  el('memoryLabel').textContent = strings.memory;
  el('runtimeLabel').textContent = strings.runtime;
  el('cpuCaption').textContent = strings.cpuCaption;
  el('memoryCaption').textContent = strings.memoryCaption;
  el('cpuChart').setAttribute('aria-label', strings.cpuChart);
  el('memoryChart').setAttribute('aria-label', strings.memoryChart);
  el('select').textContent = strings.selectProcess;
  el('hint').textContent = strings.hint;
  const select = el<HTMLSelectElement>('sessions'); select.replaceChildren();
  for (const session of message.sessions) {
    const option = document.createElement('option'); option.value = session.id; option.textContent = session.name + (session.ended ? ` (${strings.ended})` : ''); select.append(option);
  }
  select.value = message.selected || ''; select.hidden = !message.sessions.length;
  const state = message.state, samples = state?.samples || [], latest = samples.at(-1);
  el('status').textContent = state ? `${state.status}${state.pid ? ` · PID ${state.pid}` : ''}` : strings.idle;
  el('cpu').textContent = latest?.cpu != null ? `${latest.cpu.toFixed(1)}%` : '—';
  el('memory').textContent = latest ? `${latest.memory.toFixed(1)} ${strings.memoryUnit}` : '—';
  el('runtime').textContent = state ? duration(state.runtime) : '—';
  el('range').textContent = samples.length ? strings.range.replace('{0}', (samples.at(-1)!.time - samples[0].time).toFixed(0)) : strings.emptyChart;
  draw('cpuChart', samples, 'cpu', 100, '--vscode-charts-blue');
  draw('memoryChart', samples, 'memory', 1, '--vscode-charts-green');
}
el('select').addEventListener('click', () => api.postMessage({ type: 'select' }));
el('sessions').addEventListener('change', event => api.postMessage({ type: 'session', id: (event.target as HTMLSelectElement).value }));
window.addEventListener('message', event => { if (event.data.type === 'metrics') render(event.data); });
new ResizeObserver(() => { if (current) render(current); }).observe(document.body);
api.postMessage({ type: 'ready' });
