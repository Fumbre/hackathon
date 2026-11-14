// Turning a focus session into "where the time went" rows + a stacked bar.

import { isAiHost } from './ai-sites';
import { fmtDuration } from './dates';
import type { AwayKind, FocusSession, FocusState } from './types';
import { esc } from './ui';

export const AWAY: Record<AwayKind, { label: string; icon: string; note: string }> = {
  unfocused: { label: 'Outside the browser', icon: 'ph-app-window', note: 'another app was in front' },
  idle: { label: 'Away from keyboard', icon: 'ph-coffee', note: 'no mouse or keyboard for 1 min+' },
  locked: { label: 'Screen locked', icon: 'ph-lock-simple', note: 'the screen was locked' },
  'no-site': { label: 'Browser pages', icon: 'ph-browser', note: 'new tab, settings, files' },
  off: { label: 'Browser closed or asleep', icon: 'ph-power', note: 'Mothlight was not running' },
};
const AWAY_ORDER: AwayKind[] = ['unfocused', 'idle', 'locked', 'no-site', 'off'];

export interface SessionRow {
  kind: 'site' | 'away';
  key: string;
  label: string;
  icon: string;
  secs: number;
  ai: boolean;
  /** CSS class for its colour in the stacked bar. */
  cls: string;
}

export interface Breakdown {
  start: number;
  end: number;
  /** Session time: wall clock between Start and End minus pauses. */
  total: number;
  /** Seconds the session was paused (not part of `total`). */
  paused: number;
  browser: number;
  away: number;
  rows: SessionRow[];
}

/** Seconds paused so far, including a pause that is still running. */
export function pausedSoFar(f: FocusState, now = Date.now()): number {
  return (f.pausedSec ?? 0) + (f.paused && f.pausedAt ? Math.max(0, (now - f.pausedAt) / 1000) : 0);
}

/** Focus time on the clock: wall clock since Start minus pauses. */
export function focusElapsed(f: FocusState, now = Date.now()): number {
  return Math.max(0, (now - f.start) / 1000 - pausedSoFar(f, now));
}

/** The running session so far, in the same shape as a finished one. */
export function liveSession(f: FocusState, now = Date.now()): FocusSession {
  return { start: f.start, end: now, sites: f.sites ?? {}, away: f.away ?? {}, paused: pausedSoFar(f, now) };
}

export function breakdown(s: FocusSession, maxSites = 6): Breakdown {
  const sites = Object.entries(s.sites).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
  const shown = sites.slice(0, maxSites);
  const restSecs = sites.slice(maxSites).reduce((a, [, v]) => a + v, 0);
  const rows: SessionRow[] = shown.map(([h, v], i) => ({
    kind: 'site',
    key: h,
    label: h,
    icon: isAiHost(h) ? 'ph-sparkle' : 'ph-globe-simple',
    secs: v,
    ai: isAiHost(h),
    cls: isAiHost(h) ? 'stk-ai' : `stk-site${Math.min(i, 4)}`,
  }));
  if (restSecs >= 1)
    rows.push({ kind: 'site', key: '_other', label: `${sites.length - maxSites} other site${sites.length - maxSites === 1 ? "" : "s"}`, icon: 'ph-dots-three', secs: restSecs, ai: false, cls: 'stk-site4' });
  for (const k of AWAY_ORDER) {
    const v = s.away[k] ?? 0;
    if (v >= 1) rows.push({ kind: 'away', key: k, label: AWAY[k].label, icon: AWAY[k].icon, secs: v, ai: false, cls: `stk-away stk-${k}` });
  }
  const browser = sites.reduce((a, [, v]) => a + v, 0);
  const away = AWAY_ORDER.reduce((a, k) => a + (s.away[k] ?? 0), 0);
  // The wall-clock span minus pauses is the truth; tiny rounding gaps are left out of the rows.
  const paused = Math.round(s.paused ?? 0);
  const total = Math.max(1, Math.round((s.end - s.start) / 1000) - paused, Math.round(browser + away));
  return { start: s.start, end: s.end, total, paused, browser, away, rows };
}

const pct = (n: number, total: number) => Math.round((n / total) * 100);

/** A horizontal stacked bar: sites in purple shades, time away in grey stripes. */
export function stackBar(b: Breakdown): string {
  const segs = b.rows
    .map((r) => `<span class="stk-seg ${r.cls}" style="flex-grow:${r.secs}" title="${esc(r.label)} · ${fmtDuration(r.secs)}"></span>`)
    .join('');
  return `<div class="stack" role="img" aria-label="${pct(b.browser, b.total)}% in the browser, ${pct(b.away, b.total)}% away">${segs}</div>`;
}

/** The rows as a list: colour dot, icon, name, time, share. */
export function rowsHtml(b: Breakdown, opts: { notes?: boolean } = {}): string {
  return b.rows
    .map(
      (r) => `<div class="srow">
        <span class="sdot ${r.cls}"></span>
        <i class="${r.ai ? 'ph-fill' : 'ph'} ${r.icon} ${r.ai ? 'icon-accent' : 'faint'}"></i>
        <span class="sname" title="${esc(r.label)}">${esc(r.label)}${opts.notes && r.kind === 'away' ? ` <span class="faint">· ${AWAY[r.key as AwayKind].note}</span>` : ''}</span>
        <span class="sval">${fmtDuration(r.secs)}</span>
        <span class="spct faint">${pct(r.secs, b.total)}%</span>
      </div>`,
    )
    .join('');
}

export function summaryLine(b: Breakdown): string {
  return `${fmtDuration(b.browser)} in the browser (${pct(b.browser, b.total)}%) · ${fmtDuration(b.away)} away${b.paused >= 1 ? ` · paused ${fmtDuration(b.paused)}` : ''}`;
}
