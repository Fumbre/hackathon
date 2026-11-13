// Focus sessions: a study timer (wall-clock time) that also remembers where the time went.
//
// While a session runs, every time the tracker re-checks (tab switch, focus change, idle,
// or the 1-minute heartbeat) it hands us the time since the last check:
//   • the part that was counted as active browsing → added to that site
//   • the rest → "away", with the reason the tracker saw (another app in front, idle,
//     screen locked, a browser page like a new tab, or the browser closed / laptop asleep)
// So at the end, sites + away ≈ the whole session. Hostnames only, as everywhere else.
// Call these only inside withLock (the background is the single writer).

import { dayKey, fmtDuration } from '../lib/dates';
import { addFocusSession, appendLog, getFocus, getReminder, setFocus, setReminder, updateDay } from '../lib/storage';
import type { AwayKind, FocusSession, TrackStatus } from '../lib/types';

/** The heartbeat runs every minute. A longer gap means the extension wasn't running. */
const OFF_GAP_SEC = 150;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Account the time between the last check and `now`.
 * @param host     the site whose segment was just closed (or null)
 * @param counted  active seconds counted for that site
 * @param prev     tracker status before this check
 * @param cur      tracker status now
 */
export async function accountFocus(now: number, host: string | null, counted: number, prev: TrackStatus, cur: TrackStatus): Promise<void> {
  const f = await getFocus();
  if (!f.active) return;
  const sites = { ...(f.sites ?? {}) };
  const away = { ...(f.away ?? {}) };
  const elapsed = Math.max(0, (now - (f.mark ?? f.start)) / 1000);

  if (host && counted > 0) sites[host] = round1((sites[host] ?? 0) + counted);

  const rest = elapsed - counted;
  if (rest >= 1) {
    let kind: AwayKind;
    if (elapsed > OFF_GAP_SEC) kind = 'off'; // no heartbeat for minutes: browser closed or laptop asleep
    else if (prev !== 'active') kind = prev; // we were already away for this whole slice
    else if (cur !== 'active') kind = cur; // just went away (e.g. the idle minute taken back)
    else kind = 'off'; // active before and after, yet time is missing: the laptop slept
    away[kind] = round1((away[kind] ?? 0) + rest);
  }

  await setFocus({ ...f, browserSec: round1((f.browserSec ?? 0) + counted), sites, away, mark: now });
}

/** Start a session. The caller has just closed the open segment, so nothing earlier leaks in. */
export async function startFocus(now: number): Promise<void> {
  await setFocus({ active: true, start: now, browserSec: 0, sites: {}, away: {}, mark: now });
  await appendLog('focus', 'Focus session started: reminders muted');
}

/** End the session and save its breakdown. The caller has just run the tracker up to `now`. */
export async function stopFocus(now: number): Promise<FocusSession | null> {
  const f = await getFocus();
  if (!f.active) return null;
  const secs = Math.round((now - f.start) / 1000);
  const session: FocusSession = { start: f.start, end: now, sites: f.sites ?? {}, away: f.away ?? {} };
  await addFocusSession(session);
  await updateDay(dayKey(), (d) => {
    d.focus.sessions++;
    d.focus.seconds += secs;
    d.focus.browser = Math.round((d.focus.browser ?? 0) + (f.browserSec ?? 0));
  });
  await setFocus({ active: false, start: 0, browserSec: 0 });
  const r = await getReminder();
  await setReminder({ ...r, activeSec: 0 }); // you were studying: start the break timer fresh
  await appendLog('focus', `Focus session ended after ${fmtDuration(secs)} (${fmtDuration(f.browserSec ?? 0)} of it in the browser)`);
  return session;
}
