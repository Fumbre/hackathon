// All persistence. Everything lives in the browser's own extension storage:
//   storage.local   → day buckets, settings, the event log, focus + reminder state
//   storage.session → the time-slice currently being counted (cleared when the browser closes)
// Nothing is ever sent anywhere.

import { api } from './browser';
import { dayKey } from './dates';
import type { DayBucket, FocusState, LogEvent, LogKind, ReminderState, Segment, Settings, TrackStatus } from './types';

export const DEFAULT_SETTINGS: Settings = {
  intervalMin: 60,
  goalHours: 4,
  grid: 'NL',
  figure: 'range',
  laptopWatts: 15,
  badge: true,
  detectHelper: false,
};

const LOG_MAX = 60;

export const emptyDay = (): DayBucket => ({
  sites: {},
  ai: {},
  focus: { sessions: 0, seconds: 0 },
  reminders: 0,
  breaks: 0,
});

const dayStorageKey = (key: string) => `day:${key}`;

/** Fill in fields that older stored buckets may be missing. */
function normaliseDay(raw: Partial<DayBucket> | undefined): DayBucket {
  const d = emptyDay();
  if (!raw) return d;
  return {
    sites: raw.sites ?? d.sites,
    ai: raw.ai ?? d.ai,
    focus: raw.focus ?? d.focus,
    reminders: raw.reminders ?? 0,
    breaks: raw.breaks ?? 0,
  };
}

// ── A tiny lock so two background events never overwrite each other's update ──
let chain: Promise<unknown> = Promise.resolve();
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

// ── days ──
export async function getDay(key = dayKey()): Promise<DayBucket> {
  const k = dayStorageKey(key);
  const res = await api.storage.local.get(k);
  return normaliseDay(res[k] as Partial<DayBucket> | undefined);
}

export async function getDays(keys: string[]): Promise<Record<string, DayBucket>> {
  const res = await api.storage.local.get(keys.map(dayStorageKey));
  const out: Record<string, DayBucket> = {};
  for (const key of keys) out[key] = normaliseDay(res[dayStorageKey(key)] as Partial<DayBucket> | undefined);
  return out;
}

/** Read-modify-write one day. Call only from the background (single writer), inside withLock. */
export async function updateDay(key: string, fn: (d: DayBucket) => void): Promise<DayBucket> {
  const d = await getDay(key);
  fn(d);
  await api.storage.local.set({ [dayStorageKey(key)]: d });
  return d;
}

/** All day keys that have data, oldest first. */
export async function allDayKeys(): Promise<string[]> {
  const all = await api.storage.local.get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith('day:'))
    .map((k) => k.slice(4))
    .sort();
}

// ── settings ──
export async function getSettings(): Promise<Settings> {
  const res = await api.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...((res.settings as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await api.storage.local.set({ settings: next });
  return next;
}

// ── focus + reminders ──
export async function getFocus(): Promise<FocusState> {
  const res = await api.storage.local.get('focus');
  return (res.focus as FocusState) ?? { active: false, start: 0, browserSec: 0 };
}
export async function setFocus(f: FocusState): Promise<void> {
  await api.storage.local.set({ focus: f });
}

export async function getReminder(): Promise<ReminderState> {
  const res = await api.storage.local.get('reminder');
  return (res.reminder as ReminderState) ?? { activeSec: 0, snoozeUntil: 0 };
}
export async function setReminder(r: ReminderState): Promise<void> {
  await api.storage.local.set({ reminder: r });
}

// ── live segment (session storage: survives the service worker sleeping, not a browser restart) ──
export async function getSegment(): Promise<Segment | null> {
  const res = await api.storage.session.get('segment');
  return (res.segment as Segment) ?? null;
}
export async function setSegment(s: Segment | null): Promise<void> {
  if (s) await api.storage.session.set({ segment: s });
  else await api.storage.session.remove('segment');
}
export async function getStatus(): Promise<TrackStatus> {
  const res = await api.storage.session.get('status');
  return (res.status as TrackStatus) ?? 'no-site';
}
export async function setStatus(s: TrackStatus): Promise<void> {
  await api.storage.session.set({ status: s });
}

// ── event log (what the extension recorded, shown on the Privacy page) ──
export async function getLog(): Promise<LogEvent[]> {
  const res = await api.storage.local.get('log');
  return (res.log as LogEvent[]) ?? [];
}

export async function appendLog(kind: LogKind, text: string): Promise<void> {
  const log = await getLog();
  log.push({ t: Date.now(), kind, text });
  await api.storage.local.set({ log: log.slice(-LOG_MAX) });
}

// ── privacy: export + wipe + size ──
export async function exportAll(): Promise<Record<string, unknown>> {
  return api.storage.local.get(null);
}

export async function wipeAll(): Promise<void> {
  await api.storage.local.clear();
  await api.storage.session.clear();
}

export async function bytesStored(): Promise<number> {
  // Firefox has no storage.local.getBytesInUse, so measure the JSON ourselves (same idea).
  const all = await api.storage.local.get(null);
  return new Blob([JSON.stringify(all)]).size;
}
