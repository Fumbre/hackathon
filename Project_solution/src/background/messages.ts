// Messages from the popup, dashboard and the AI-site badge.
// The background is the only writer of day data, so every change goes through here.

import { OTHER_PROVIDER_ID, providerById, providerForHost } from '../lib/ai-sites';
import { api } from '../lib/browser';
import { dayKey, fmtDuration } from '../lib/dates';
import { appendLog, getFocus, getReminder, setFocus, setReminder, updateDay, wipeAll, withLock } from '../lib/storage';
import type { Message } from '../lib/types';
import { detected, detectStats, recordPrompt } from './ai-detector';
import { snooze } from './reminders';
import { evaluate, hostOf } from './tracker';

const EXTENSION_ORIGIN = api.runtime.getURL('');

async function handle(msg: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const fromOwnPage = (sender.url ?? '').startsWith(EXTENSION_ORIGIN);
  const senderHost = hostOf(sender.tab?.url ?? sender.url);

  switch (msg.type) {
    case 'flush':
      await evaluate();
      return true;

    case 'promptSent': {
      // Only the content script running ON that AI site may report a prompt for it.
      const p = senderHost ? providerForHost(senderHost) : undefined;
      if (!p || p.id !== msg.provider || !p.sendButton) return false;
      detected(p.id, p.name, sender.tab?.id ?? -1, 'send button');
      return true;
    }

    case 'addPrompt': {
      // A content script may only add a prompt for the AI site it is running on.
      if (!fromOwnPage) {
        const p = senderHost ? providerForHost(senderHost) : undefined;
        if (!p || p.id !== msg.provider) return false;
      }
      const id = providerById(msg.provider) ? msg.provider : OTHER_PROVIDER_ID;
      await recordPrompt(id, 'manual', providerById(id)?.name ?? 'other AI');
      return true;
    }
  }

  // Everything below is only allowed from Mothlight's own pages.
  if (!fromOwnPage) return false;

  switch (msg.type) {
    case 'focusStart':
      return withLock(async () => {
        await setFocus({ active: true, start: Date.now(), browserSec: 0 });
        await appendLog('focus', 'Focus session started: reminders muted');
        return true;
      });

    case 'focusStop':
      await evaluate(); // count the browsing time up to this second first
      return withLock(async () => {
        const f = await getFocus();
        if (!f.active) return true;
        const secs = Math.round((Date.now() - f.start) / 1000);
        await updateDay(dayKey(), (d) => {
          d.focus.sessions++;
          d.focus.seconds += secs;
          d.focus.browser = Math.round((d.focus.browser ?? 0) + (f.browserSec ?? 0));
        });
        await setFocus({ active: false, start: 0, browserSec: 0 });
        const r = await getReminder();
        await setReminder({ ...r, activeSec: 0 }); // you were studying: start the break timer fresh
        await appendLog('focus', `Focus session ended after ${Math.round(secs / 60)} min (${fmtDuration(f.browserSec ?? 0)} of it in the browser)`);
        return true;
      });

    case 'snooze':
      return withLock(() => snooze(msg.minutes)).then(() => true);

    case 'wipe':
      await withLock(() => wipeAll());
      await evaluate(); // start counting again from zero
      return true;

    case 'logExport':
      await withLock(() => appendLog('privacy', 'You exported your data'));
      return true;

    case 'detectStats':
      return detectStats();
  }
  return false;
}

export function registerMessages(): void {
  api.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
    handle(msg, sender).then(sendResponse, (e) => {
      console.error('[Mothlight]', e);
      sendResponse(false);
    });
    return true; // keep the channel open for the async answer
  });
}
