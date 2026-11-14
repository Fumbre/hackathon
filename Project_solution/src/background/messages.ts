// Messages from the popup, dashboard and the AI-site badge.
// The background is the only writer of day data, so every change goes through here.

import { OTHER_PROVIDER_ID, providerById, providerForHost } from '../lib/ai-sites';
import { api } from '../lib/browser';
import { appendLog, getFocus, wipeAll, withLock } from '../lib/storage';
import type { Message } from '../lib/types';
import { detected, detectStats, recordPrompt } from './ai-detector';
import { getSettings } from '../lib/storage';
import { pauseFocus, resumeFocus, startFocus, stopFocus } from './focus';
import { showReminder, snooze, takeBreak } from './reminders';
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
      await evaluate(); // close the time counted so far, so it doesn't leak into the session
      return withLock(async () => {
        if (!(await getFocus()).active) await startFocus(Date.now());
        return true;
      });

    case 'focusStop':
      await evaluate(); // count the time up to this second first
      return withLock(async () => {
        await stopFocus(Date.now());
        return true;
      });

    case 'focusPause':
      await evaluate(); // what happened up to now still belongs to the session
      return withLock(async () => {
        await pauseFocus(Date.now());
        return true;
      });

    case 'focusResume':
      await evaluate();
      return withLock(async () => {
        await resumeFocus(Date.now());
        return true;
      });

    case 'breakTaken':
      return withLock(() => takeBreak()).then(() => true);

    case 'testReminder':
      return withLock(async () => showReminder((await getSettings()).intervalMin, true)).then(() => true);

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
