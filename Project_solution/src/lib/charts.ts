// Hand-made bar charts (plain HTML + CSS, no chart library to explain or load).

import { fmtDuration, weekdayShort } from './dates';

export interface BarDay {
  k: string; // day key
  s: number; // active seconds
  ai: number; // seconds on AI sites
}

const MIN = 60;
const HOUR = 3600;
/** Axis tops to pick from: the smallest one that fits the data wins. */
const STEPS = [15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 8 * HOUR, 10 * HOUR, 12 * HOUR, 16 * HOUR, 24 * HOUR];

/** Round up to a readable axis maximum (15m, 30m, 1h, 2h…). */
export function niceTop(sec: number): number {
  return STEPS.find((s) => s >= sec) ?? Math.ceil(sec / HOUR) * HOUR;
}

/** Short axis label: "30m", "2h", "1h30". */
function axisLabel(sec: number): string {
  if (sec === 0) return '0';
  if (sec < HOUR) return `${Math.round(sec / MIN)}m`;
  const h = Math.floor(sec / HOUR);
  const m = Math.round((sec % HOUR) / MIN);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** Compact value above a bar: "2h05", "12m", "40s". */
function barLabel(sec: number): string {
  if (sec <= 0) return '';
  if (sec < HOUR) return fmtDuration(sec);
  return axisLabel(Math.round(sec / MIN) * MIN);
}

/**
 * Vertical bars: one per day, the AI share shaded inside, a dashed goal line.
 * The scale follows YOUR data (not the goal), so a 10-minute day is still a visible bar.
 * The last bar is today.
 */
export function dayBars(values: BarDay[], goalSec: number, opts: { dates?: boolean; height?: number } = {}): string {
  const max = Math.max(0, ...values.map((v) => v.s));
  const top = niceTop(Math.max(max * 1.12, 15 * MIN));
  const goalInView = goalSec <= top;
  const goalPct = ((goalSec / top) * 100).toFixed(1);

  const grid = [1, 0.5, 0]
    .map((f) => `<div class="vgrid" style="bottom:${f * 100}%"><span>${axisLabel(top * f)}</span></div>`)
    .join('');

  const bars = values
    .map((v, i) => {
      const isToday = i === values.length - 1;
      const h = v.s > 0 ? Math.max(1.5, (v.s / top) * 100) : 0;
      const aiH = v.s > 0 ? Math.min(100, (v.ai / v.s) * 100) : 0;
      const cls = ['vbar-fill', isToday ? 'today' : '', v.s > goalSec ? 'over' : ''].join(' ').trim();
      const tip = `${weekdayShort(v.k)} ${v.k}: ${v.s > 0 ? `${fmtDuration(v.s)} active${v.ai > 0 ? `, ${fmtDuration(v.ai)} on AI sites` : ''}` : 'no browsing tracked'}`;
      return `<div class="vbar-col${v.s > 0 ? '' : ' empty'}" title="${tip}">
        <span class="vbar-val" style="bottom:${h}%">${v.s > 0 ? barLabel(v.s) : '·'}</span>
        ${v.s > 0 ? `<div class="${cls}" style="height:${h.toFixed(1)}%">${aiH > 0 ? `<div class="vbar-ai" style="height:${aiH.toFixed(1)}%"></div>` : ''}</div>` : ''}
      </div>`;
    })
    .join('');

  const labels = values
    .map((v, i) => {
      const day = opts.dates ? `${weekdayShort(v.k)} ${Number(v.k.slice(8))}` : weekdayShort(v.k);
      return `<span class="vbar-label ${i === values.length - 1 ? 'today' : ''}">${i === values.length - 1 ? 'Today' : day}</span>`;
    })
    .join('');

  const goal = goalInView
    ? `<div class="goal-line" style="bottom:${goalPct}%" title="Your ${axisLabel(goalSec)} goal"></div>`
    : `<div class="goal-off" title="Your goal is above the highest bar">goal ${axisLabel(goalSec)} ↑</div>`;

  return `<div class="vbars" style="--plot-h:${opts.height ?? 140}px">
    <div class="vbars-plot">${grid}${goal}<div class="vbars-cols">${bars}</div></div>
    <div class="vbars-labels">${labels}</div>
  </div>`;
}
