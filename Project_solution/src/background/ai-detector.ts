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
import { appendLog, getSettings, updateDay, withLock } from '../lib/storage';
import type { HostStats, Settings } from '../lib/types';

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

/**
 * Detection helper (off by default, switch in the dashboard → AI use).
 * While it is on we count, per AI host, how many requests the browser lets us see,
 * and log "POST host /path" for POSTs that did NOT match a send pattern. Long IDs are
 * replaced by ":id"; the query string and the body are never logged.
 * This tells you at a glance whether a site is invisible to us (no access) or just
 * uses a different "send" address.
 */
let helperOn = false;
const stats = new Map<string, HostStats>();

export function cleanPath(url: URL): string {
  return url.pathname.replace(/[0-9a-zA-Z_-]{20,}|[0-9a-f]{8}-[0-9a-f-]{27,}/g, ':id').slice(0, 90);
}

export function detectStats(): Record<string, HostStats> {
  return Object.fromEntries(stats);
}

function setHelper(on: boolean) {
  if (on && !helperOn) stats.clear();
  helperOn = on;
}

function observe(url: URL, method: string) {
  const host = url.hostname.replace(/^www\./, '');
  const st = stats.get(host) ?? { requests: 0, posts: 0, lastPost: '' };
  st.requests++;
  if (method === 'POST') {
    st.posts++;
    st.lastPost = cleanPath(url);
  }
  stats.set(host, st);
}

/**
 * One detected prompt, from the network observer or from the Send-button detector.
 * Both can fire for the same prompt, so repeats per site + tab within DEBOUNCE_MS count once.
 */
export function detected(providerId: string, name: string, tabId: number, via: 'network' | 'send button'): void {
  const key = `${providerId}:${tabId}`;
  const now = Date.now();
  if (now - (lastHit.get(key) ?? 0) < DEBOUNCE_MS) return;
  lastHit.set(key, now);
  void recordPrompt(providerId, 'detected', `${name} (${via})`);
}

export function registerDetector(): void {
  void getSettings().then((s) => setHelper(s.detectHelper));
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) setHelper(Boolean((changes.settings.newValue as Settings | undefined)?.detectHelper));
  });

  api.webRequest.onBeforeRequest.addListener(
    (details) => {
      let url: URL;
      try {
        url = new URL(details.url);
      } catch {
        return undefined;
      }
      const provider = providerForHost(url.hostname);
      if (!provider) return undefined;
      if (helperOn) observe(url, details.method);
      if (details.method !== 'POST') return undefined;
      if (!provider.sendPattern || !provider.sendPattern.test(url.pathname + url.search)) {
        if (helperOn) {
          const line = `POST ${url.hostname.replace(/^www\./, '')} ${cleanPath(url)}`;
          void withLock(() => appendLog('debug', line));
        }
        return undefined;
      }

      detected(provider.id, provider.name, details.tabId, 'network');
      return undefined;
    },
    // No `types` filter: some sites send prompts with fetch, XHR, or from a worker. Method + path decide.
    { urls: AI_HOST_PATTERNS },
  );
}
