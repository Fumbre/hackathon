// Active-time tracking.
//
// Model: at any moment at most ONE "segment" is open: { host, start }.
// Whenever something changes (tab switch, URL change, window focus, idle state,
// or the 1-minute heartbeat) we:
//   1. close the open segment and add its seconds to today's bucket for that host
//   2. look at the browser again and open a new segment only if the user is really active:
//        • a browser window has focus         (otherwise: "unfocused")
//        • the active tab is an http(s) page   (otherwise: "no-site")
//        • the system is not idle or locked    (otherwise: "idle"/"locked")
//          …except an AUDIBLE tab (a lecture video) still counts while idle.
//
// Only the hostname is kept (e.g. "docs.google.com"). Never paths, titles or content.

import { api } from '../lib/browser';
import { dayKey, nextMidnight } from '../lib/dates';
import { appendLog, getSegment, getStatus, setSegment, setStatus, updateDay, withLock } from '../lib/storage';
import type { TrackStatus } from '../lib/types';
import { onActiveSeconds } from './reminders';

/** After this many seconds without keyboard/mouse input the system counts as idle. */
export const IDLE_SECONDS = 60;

/** The heartbeat flushes every minute. A longer gap means the laptop slept: don't count it. */
const MAX_SLICE_MS = 2 * 60_000;

export function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

interface Observation {
  status: TrackStatus;
  host: string | null;
}

async function observe(): Promise<Observation> {
  const win = await api.windows.getLastFocused().catch(() => null);
  if (!win || !win.focused || win.id === undefined) return { status: 'unfocused', host: null };

  const [tab] = await api.tabs.query({ active: true, windowId: win.id });
  const host = hostOf(tab?.url);
  if (!tab || !host) return { status: 'no-site', host: null };

  const idle = await api.idle.queryState(IDLE_SECONDS);
  if (idle === 'locked') return { status: 'locked', host };
  if (idle === 'idle' && !tab.audible) return { status: 'idle', host };
  return { status: 'active', host };
}

/** Close the open segment at `end`, splitting it at midnight. Returns the seconds counted. */
async function closeSegment(end: number): Promise<number> {
  const seg = await getSegment();
  if (!seg) return 0;
  let start = seg.start;
  if (end - start > MAX_SLICE_MS) end = start + 60_000; // laptop slept: count at most one heartbeat
  let counted = 0;
  while (start < end) {
    const boundary = Math.min(end, nextMidnight(start));
    const secs = Math.round((boundary - start) / 100) / 10; // 0.1 s precision
    if (secs > 0) {
      await updateDay(dayKey(start), (d) => {
        d.sites[seg.host] = Math.round(((d.sites[seg.host] ?? 0) + secs) * 10) / 10;
      });
      counted += secs;
    }
    start = boundary;
  }
  await setSegment(null);
  return counted;
}

const PAUSE_TEXT: Record<Exclude<TrackStatus, 'active'>, string> = {
  idle: 'Paused: no keyboard or mouse for 1 min',
  locked: 'Paused: screen locked',
  unfocused: 'Paused: browser not in focus',
  'no-site': 'Paused: not on a website',
};

/** Re-check everything. Safe to call as often as you like. */
export function evaluate(): Promise<void> {
  return withLock(async () => {
    const now = Date.now();
    const obs = await observe();

    // When we only now notice the user went idle, the last IDLE_SECONDS were not active:
    // close the segment at the moment the inactivity started, not now.
    const end = obs.status === 'idle' || obs.status === 'locked' ? now - IDLE_SECONDS * 1000 : now;
    const seg = await getSegment();
    const counted = await closeSegment(Math.max(end, seg?.start ?? end));
    if (counted > 0) await onActiveSeconds(counted);

    if (obs.status === 'active' && obs.host) await setSegment({ host: obs.host, start: now });

    const prev = await getStatus();
    if (prev !== obs.status) {
      await setStatus(obs.status);
      if (obs.status === 'active' && prev !== 'no-site') await appendLog('resume', 'Counting again');
      else if (obs.status !== 'active' && obs.status !== 'no-site' && prev === 'active')
        await appendLog('pause', PAUSE_TEXT[obs.status]);
    }
  });
}

/** Flush the open segment into storage without changing what is being tracked (used by the popup). */
export function flush(): Promise<void> {
  return evaluate();
}
