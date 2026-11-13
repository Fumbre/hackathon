// Prompt detection: notice that a prompt was SENT, never read WHAT was sent.
//
// We observe (not block, not modify) outgoing requests to the AI hosts listed in
// lib/ai-sites.ts. For each request we look at exactly two things:
//   • the HTTP method (we only care about POST)
//   • the URL path (does it match that site's "send prompt" endpoint?)
// We do NOT ask for the request body ("requestBody" is not in extraInfoSpec), so the
// browser never even hands the text of a prompt to this extension.

import { AI_HOST_PATTERNS, providerForHost } from '../lib/ai-sites';
import { api } from '../lib/browser';
import { dayKey } from '../lib/dates';
import { appendLog, updateDay, withLock } from '../lib/storage';

/** Some sites send a second request for the same prompt (retry, stream resume). Ignore repeats within this window. */
const DEBOUNCE_MS = 1500;
const lastHit = new Map<string, number>();

export function recordPrompt(providerId: string, kind: 'detected' | 'manual', label: string): Promise<void> {
  return withLock(async () => {
    await updateDay(dayKey(), (d) => {
      const c = (d.ai[providerId] ??= { detected: 0, manual: 0 });
      c[kind]++;
    });
    await appendLog(kind === 'detected' ? 'prompt' : 'manual', kind === 'detected' ? `Prompt detected · ${label}` : `+1 prompt added by you · ${label}`);
  });
}

export function registerDetector(): void {
  api.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.method !== 'POST') return undefined;
      let url: URL;
      try {
        url = new URL(details.url);
      } catch {
        return undefined;
      }
      const provider = providerForHost(url.hostname);
      if (!provider?.sendPattern || !provider.sendPattern.test(url.pathname + url.search)) return undefined;

      const key = `${provider.id}:${details.tabId}`;
      const now = Date.now();
      if (now - (lastHit.get(key) ?? 0) < DEBOUNCE_MS) return undefined;
      lastHit.set(key, now);

      void recordPrompt(provider.id, 'detected', provider.name);
      return undefined;
    },
    { urls: AI_HOST_PATTERNS, types: ['xmlhttprequest'] },
  );
}
