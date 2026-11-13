// The break reminder: after N minutes of ACTIVE browsing (idle and unfocused time
// don't count), show a notification. Muted while a focus session runs or while snoozed.

import { api, SUPPORTS_NOTIFICATION_BUTTONS } from '../lib/browser';
import { dayKey, fmtDuration } from '../lib/dates';
import { appendLog, getDay, getFocus, getReminder, getSettings, setReminder, updateDay, withLock } from '../lib/storage';
import { activeSeconds, promptTotals } from '../lib/stats';

const NOTIF_ID = 'mothlight-reminder';

export function intervalLabel(min: number): string {
  if (min < 60) return `${min} min`;
  if (min === 60) return '1 hour';
  return `${min / 60} hours`;
}

/** Called by the tracker with every chunk of active seconds it counts. */
export async function onActiveSeconds(secs: number): Promise<void> {
  const [r, focus, settings] = await Promise.all([getReminder(), getFocus(), getSettings()]);
  if (focus.active) return; // studying: no reminders, and the counter waits
  r.activeSec += secs;
  if (r.activeSec >= settings.intervalMin * 60 && Date.now() >= r.snoozeUntil) {
    r.activeSec = 0;
    await setReminder(r);
    await showReminder(settings.intervalMin);
    return;
  }
  await setReminder(r);
}

async function showReminder(intervalMin: number): Promise<void> {
  const today = await getDay();
  const p = promptTotals(today).total;
  const options: chrome.notifications.NotificationCreateOptions = {
    type: 'basic',
    iconUrl: api.runtime.getURL('icons/icon-128.png'),
    title: `You've been online for ${intervalLabel(intervalMin)}`,
    message: `Mo's wings are tired. Look away for 20 seconds? Today: ${fmtDuration(activeSeconds(today))} active · ${p} AI prompt${p === 1 ? '' : 's'}.`,
  };
  if (SUPPORTS_NOTIFICATION_BUTTONS) options.buttons = [{ title: 'Take a break' }, { title: 'Snooze 15m' }];
  await api.notifications.clear(NOTIF_ID);
  await api.notifications.create(NOTIF_ID, options);
  await updateDay(dayKey(), (d) => void d.reminders++);
  await appendLog('reminder', `Reminder after ${intervalLabel(intervalMin)} of active time`);
}

export async function snooze(minutes: number): Promise<void> {
  const r = await getReminder();
  r.snoozeUntil = Date.now() + minutes * 60_000;
  await setReminder(r);
  await appendLog('reminder', `Reminders snoozed for ${minutes} min`);
}

export async function takeBreak(): Promise<void> {
  await updateDay(dayKey(), (d) => void d.breaks++);
  await appendLog('break', 'Took a break. Nice!');
}

export function registerReminderHandlers(): void {
  api.notifications.onButtonClicked?.addListener((id, button) => {
    if (id !== NOTIF_ID) return;
    void api.notifications.clear(id);
    void withLock(() => (button === 0 ? takeBreak() : snooze(15)));
  });
  api.notifications.onClicked.addListener((id) => {
    if (id !== NOTIF_ID) return;
    void api.notifications.clear(id);
    void api.tabs.create({ url: api.runtime.getURL('dashboard/dashboard.html') });
  });
}
