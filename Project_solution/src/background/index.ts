// Background entry point (Chrome: service worker, Firefox: event page).
// All listeners are registered synchronously at the top level, so the browser can
// wake this script up for any of them after it has been unloaded.

import { api } from '../lib/browser';
import { registerDetector } from './ai-detector';
import { registerMessages } from './messages';
import { registerReminderHandlers } from './reminders';
import { evaluate, IDLE_SECONDS } from './tracker';

const TICK = 'mothlight-tick';

// ── tracking triggers ──
api.tabs.onActivated.addListener(() => void evaluate());
api.tabs.onUpdated.addListener((_id, change, tab) => {
  // Only the changes that matter: a new address, or sound starting/stopping.
  if (tab.active && (change.url !== undefined || change.audible !== undefined)) void evaluate();
});
api.tabs.onRemoved.addListener(() => void evaluate());
api.windows.onFocusChanged.addListener(() => void evaluate());
api.idle.setDetectionInterval(IDLE_SECONDS);
api.idle.onStateChanged.addListener(() => void evaluate());

// ── 1-minute heartbeat: flushes time to storage and catches anything we missed ──
api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK) void evaluate();
});
async function ensureHeartbeat() {
  // Re-creating an alarm resets its timer, so only create it when missing.
  if (!(await api.alarms.get(TICK))) await api.alarms.create(TICK, { periodInMinutes: 1 });
}

// ── features ──
registerDetector();
registerReminderHandlers();
registerMessages();

// ── lifecycle ──
api.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void api.tabs.create({ url: api.runtime.getURL('onboarding/onboarding.html') });
  }
});
api.runtime.onStartup.addListener(() => void evaluate());

void ensureHeartbeat();
void evaluate();
