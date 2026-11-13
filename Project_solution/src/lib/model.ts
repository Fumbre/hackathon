// Loads everything a page needs to render, in one go.

import { AI_HOST_PATTERNS } from './ai-sites';
import { api } from './browser';
import { dayKey, lastDays } from './dates';
import { bytesStored, getDays, getFocus, getLog, getReminder, getSettings } from './storage';
import { streak } from './stats';
import type { DayBucket, FocusState, LogEvent, ReminderState, Settings } from './types';
import { send } from './ui';

export interface Model {
  todayKey: string;
  today: DayBucket;
  /** The last 60 days, keyed by day; missing days are empty buckets. */
  days: Record<string, DayBucket>;
  settings: Settings;
  focus: FocusState;
  reminder: ReminderState;
  streak: number;
  bytes: number;
  log: LogEvent[];
  /** Can we see the AI sites? (Firefox asks for this separately.) */
  aiAccess: boolean;
}

export async function loadModel(opts: { flush?: boolean } = {}): Promise<Model> {
  // Ask the background to write the time counted so far, so the numbers are up to the second.
  if (opts.flush) await send({ type: 'flush' }).catch(() => undefined);
  const keys = lastDays(60);
  const [days, settings, focus, reminder, bytes, log, aiAccess] = await Promise.all([
    getDays(keys),
    getSettings(),
    getFocus(),
    getReminder(),
    bytesStored(),
    getLog(),
    api.permissions.contains({ origins: AI_HOST_PATTERNS }).catch(() => false),
  ]);
  const todayKey = dayKey();
  return {
    todayKey,
    today: days[todayKey],
    days,
    settings,
    focus,
    reminder,
    streak: streak(days, settings.goalHours),
    bytes,
    log,
    aiAccess,
  };
}
