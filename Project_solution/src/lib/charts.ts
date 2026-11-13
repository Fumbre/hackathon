// Hand-made bar charts (plain HTML + CSS, no chart library to explain or load).

import { fmtDuration, weekdayShort } from './dates';

export interface BarDay {
  k: string; // day key
  s: number; // active seconds
  ai: number; // seconds on AI sites
}

/** Vertical bars: one per day, AI share shaded inside, a dashed goal line. Last bar = today. */
export function dayBars(values: BarDay[], goalSec: number, top: number, opts: { dates?: boolean } = {}): string {
  const goalPct = Math.min(100, (goalSec / top) * 100).toFixed(1);
  const bars = values
    .map((v, i) => {
      const isToday = i === values.length - 1;
      const h = Math.round((v.s / top) * 100);
      const aiH = v.s > 0 ? Math.round((v.ai / v.s) * 100) : 0;
      return `<div class="vbar-col" title="${weekdayShort(v.k)} ${v.k}: ${fmtDuration(v.s)} active, ${fmtDuration(v.ai)} on AI sites">
        <div class="vbar-fill ${isToday ? 'today' : v.s > goalSec ? 'over' : ''}" style="height:${h}%"><div class="vbar-ai" style="height:${aiH}%"></div></div>
      </div>`;
    })
    .join('');
  const labels = values
    .map((v, i) => {
      const day = opts.dates ? `${weekdayShort(v.k)} ${Number(v.k.slice(8))}` : weekdayShort(v.k);
      return `<span class="vbar-label ${i === values.length - 1 ? 'today' : ''}">${day}</span>`;
    })
    .join('');
  return `<div class="vbars">
    <div class="vbars-plot"><div class="goal-line" style="bottom:${goalPct}%"></div>${bars}</div>
    <div class="vbars-labels">${labels}</div>
  </div>`;
}
