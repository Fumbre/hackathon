// Pure helpers that turn stored day buckets into the numbers the UI shows.

import { isAiHost } from './ai-sites';
import { dayKey, lastDays } from './dates';
import type { DayBucket } from './types';

export function activeSeconds(d: DayBucket): number {
  return Object.values(d.sites).reduce((a, s) => a + s, 0);
}

export function aiSeconds(d: DayBucket): number {
  return Object.entries(d.sites).reduce((a, [host, s]) => a + (isAiHost(host) ? s : 0), 0);
}

export function promptTotals(d: DayBucket) {
  let detected = 0;
  let manual = 0;
  for (const c of Object.values(d.ai)) {
    detected += c.detected;
    manual += c.manual;
  }
  return { detected, manual, total: detected + manual };
}

export function topSites(d: DayBucket, n: number): [string, number][] {
  return Object.entries(d.sites)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/**
 * Streak = consecutive days (ending today) that stayed under the browsing goal.
 * Today counts while it is still under the goal. A day with no data ends the streak,
 * because we can't know whether you stayed under it.
 */
export function streak(days: Record<string, DayBucket>, goalHours: number): number {
  const limit = goalHours * 3600;
  const keys = Object.keys(days).sort().reverse(); // newest first
  let n = 0;
  for (const key of keys) {
    const secs = activeSeconds(days[key]);
    const isToday = key === dayKey();
    if (secs === 0 && !isToday) break;
    if (secs >= limit) {
      if (isToday) continue; // over today: not yet a broken streak, just not counting today
      break;
    }
    if (secs > 0) n++;
  }
  return n;
}

/** Sum seconds + prompts over a list of day keys. */
export function sumDays(days: Record<string, DayBucket>, keys: string[]) {
  let secs = 0;
  let prompts = 0;
  let ai = 0;
  for (const k of keys) {
    const d = days[k];
    if (!d) continue;
    secs += activeSeconds(d);
    ai += aiSeconds(d);
    prompts += promptTotals(d).total;
  }
  return { secs, prompts, ai };
}

/** Relative change in %, or null when there is nothing to compare with. */
export function pctChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export { lastDays };
