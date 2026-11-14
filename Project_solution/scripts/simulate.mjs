// Headless test: runs the REAL built background script (dist/chrome/background.js)
// against a fake browser API with a controllable clock, then checks what was stored.
// Usage: npm run build:chrome && node scripts/simulate.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// ── fake clock ──
let now = new Date(2026, 10, 13, 10, 0, 0).getTime(); // 13 Nov 2026, 10:00 local
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [now])); }
  static now() { return now; }
}

// ── fake events + storage ──
const ev = () => { const ls = []; return { addListener: (f) => ls.push(f), fire: (...a) => ls.forEach((f) => f(...a)), ls }; };
const area = () => {
  let data = {};
  const pick = (keys) => {
    if (keys === null || keys === undefined) return structuredClone(data);
    const ks = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(ks.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
  };
  return {
    get: async (k) => pick(k),
    set: async (o) => {
      Object.assign(data, structuredClone(o));
      onChanged.fire(Object.fromEntries(Object.keys(o).map((k) => [k, { newValue: structuredClone(o[k]) }])), 'local');
    },
    remove: async (k) => { for (const x of [].concat(k)) delete data[x]; },
    clear: async () => { data = {}; },
    _data: () => data,
  };
};
const onChanged = ev();

const state = {
  focused: true,
  tab: { id: 1, url: 'https://docs.google.com/document/d/secret', audible: false, active: true },
  idle: 'active',
  notifications: [],
};

const chrome = {
  runtime: { getURL: (p) => `chrome-extension://test/${p}`, onMessage: ev(), onInstalled: ev(), onStartup: ev() },
  storage: { local: area(), session: area(), onChanged },
  tabs: {
    onActivated: ev(), onUpdated: ev(), onRemoved: ev(),
    query: async () => (state.tab ? [state.tab] : []),
    create: async () => ({}),
  },
  windows: { onFocusChanged: ev(), getLastFocused: async () => ({ id: 1, focused: state.focused }) },
  idle: { setDetectionInterval() {}, onStateChanged: ev(), queryState: async () => state.idle },
  alarms: { onAlarm: ev(), get: async () => undefined, create: async () => {} },
  notifications: {
    onButtonClicked: ev(), onClicked: ev(),
    clear: async () => true,
    create: async (id, o) => { state.notifications.push(o); return id; },
  },
  webRequest: { onBeforeRequest: ev() },
  permissions: { contains: async () => true },
};

const ctx = vm.createContext({ chrome, Date: FakeDate, URL, console, setTimeout, structuredClone, Blob, Promise });
vm.runInContext(readFileSync(new URL('../dist/chrome/background.js', import.meta.url), 'utf8'), ctx);

const settle = () => new Promise((r) => setTimeout(r, 30));
const tick = async (sec) => { now += sec * 1000; chrome.alarms.onAlarm.fire({ name: 'mothlight-tick' }); await settle(); };
const local = () => chrome.storage.local._data();
const day = () => local()['day:2026-11-13'];
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

await settle();
console.log('Mothlight background simulation');

// 1. 5 minutes active on docs → 300 s, hostname only
for (let i = 0; i < 5; i++) await tick(60);
check('counts active time per hostname', () => assert.equal(day().sites['docs.google.com'], 300));
check('stores only the hostname, never the path', () => assert.ok(!JSON.stringify(local()).includes('secret')));

// 2. Browser loses focus for 3 minutes → not counted
state.focused = false; chrome.windows.onFocusChanged.fire(-1); await settle();
for (let i = 0; i < 3; i++) await tick(60);
check('pauses when the browser is not in focus', () => assert.equal(day().sites['docs.google.com'], 300));
state.focused = true; chrome.windows.onFocusChanged.fire(1); await settle();

// 3. Switch to YouTube for 2 min, then go idle: the last 60 s before idle is removed
state.tab = { id: 2, url: 'https://www.youtube.com/watch?v=x', audible: false, active: true };
chrome.tabs.onActivated.fire({ tabId: 2 }); await settle();
await tick(60); await tick(60);
now += 90_000; state.idle = 'idle'; chrome.idle.onStateChanged.fire('idle'); await settle();
check('idle: stops and removes the idle detection minute', () => assert.equal(day().sites['youtube.com'], 120 + 30));
await tick(60); await tick(60);
check('idle time is not counted', () => assert.equal(day().sites['youtube.com'], 150));

// 4. Idle but a lecture video is playing (audible) → counts
state.tab.audible = true; chrome.tabs.onUpdated.fire(2, { audible: true }, state.tab); await settle();
await tick(60); await tick(60);
check('audible tab keeps counting while idle', () => assert.equal(day().sites['youtube.com'], 270));
state.tab.audible = false; state.idle = 'active'; chrome.idle.onStateChanged.fire('active'); await settle();

// 5. Laptop sleeps 2 hours (no heartbeat) → counts at most 60 s
now += 2 * 3600_000; await tick(0);
check('a sleeping laptop is not counted', () => assert.equal(day().sites['youtube.com'], 330));

// 6. Prompt detection: POST to ChatGPT conversation counts, GETs and other paths don't, duplicates debounced
const req = (method, url, tabId = 3) => chrome.webRequest.onBeforeRequest.ls[0]({ method, url, tabId });
req('POST', 'https://chatgpt.com/backend-api/f/conversation');
req('POST', 'https://chatgpt.com/backend-api/f/conversation'); // duplicate within 1.5 s
req('GET', 'https://chatgpt.com/backend-api/conversation');
req('POST', 'https://chatgpt.com/backend-api/conversation/init');
req('POST', 'https://claude.ai/api/organizations/o1/chat_conversations/c1/completion', 4);
req('POST', 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=x', 5);
req('POST', 'https://claude.ai/api/organizations/o1/chat_conversations/c1/retry_completion', 7);
req('POST', 'https://claude.ai/api/organizations/o1/chat_conversations/c1/completion_status', 8); // not a prompt
await settle();
check('detects prompts (ChatGPT, Claude, Gemini) and ignores repeats/other requests', () => {
  assert.equal(day().ai.chatgpt.detected, 1);
  assert.equal(day().ai.claude.detected, 2);
  assert.equal(day().ai.gemini.detected, 1);
});

// 6b. Detection helper logs unmatched POSTs (path only, IDs hidden) when switched on
await chrome.storage.local.set({ settings: { detectHelper: true } });
req('POST', 'https://claude.ai/api/organizations/0f8e2b7a-1111-2222-3333-444455556666/new_send?secret=1', 9);
await settle();
check('detection helper logs method + path, hides IDs and query', () => {
  const last = local().log.at(-1).text;
  assert.equal(last, 'POST claude.ai /api/organizations/:id/new_send');
});
await chrome.storage.local.set({ settings: {} });

// 7. Manual +1 from a content script on a different site is refused; from our own page accepted
const msg = (m, sender) => new Promise((r) => chrome.runtime.onMessage.ls[0](m, sender, r));
assert.equal(await msg({ type: 'addPrompt', provider: 'claude' }, { tab: { url: 'https://evil.example/' }, url: 'https://evil.example/' }), false);
assert.equal(await msg({ type: 'addPrompt', provider: 'claude' }, { url: 'chrome-extension://test/popup/popup.html' }), true);
check('+1 is only accepted from Mothlight pages or the matching AI site', () => assert.equal(day().ai.claude.manual, 1));

// 7b. Send-button reports (Claude/Gemini): only from the matching site; network + button for one prompt count once
const geminiBefore = day().ai.gemini.detected;
assert.equal(await msg({ type: 'promptSent', provider: 'gemini' }, { tab: { id: 20, url: 'https://evil.example/' } }), false);
assert.equal(await msg({ type: 'promptSent', provider: 'gemini' }, { tab: { id: 20, url: 'https://gemini.google.com/app' } }), true);
await settle();
check('send-button report counts, and only from the AI site itself', () => assert.equal(day().ai.gemini.detected, geminiBefore + 1));
now += 5000;
const claudeBefore = day().ai.claude.detected;
req('POST', 'https://claude.ai/api/organizations/o1/chat_conversations/c9/completion', 21);
await msg({ type: 'promptSent', provider: 'claude' }, { tab: { id: 21, url: 'https://claude.ai/chat/c9' } });
await settle();
check('one prompt seen by both network and send button counts once', () => assert.equal(day().ai.claude.detected, claudeBefore + 1));
now += 5000;
const gptBefore = day().ai.chatgpt.detected;
await msg({ type: 'promptSent', provider: 'chatgpt' }, { tab: { id: 22, url: 'https://chatgpt.com/' } }); // logged out: button only
await settle();
check('ChatGPT send-button report counts (logged-out ChatGPT)', () => assert.equal(day().ai.chatgpt.detected, gptBefore + 1));
now += 5000;
await msg({ type: 'promptSent', provider: 'chatgpt' }, { tab: { id: 22, url: 'https://chatgpt.com/c/1' } });
req('POST', 'https://chatgpt.com/backend-api/f/conversation', 22);                                        // logged in: both fire
await settle();
check('ChatGPT prompt seen by button + network counts once', () => assert.equal(day().ai.chatgpt.detected, gptBefore + 2));

// 8. Reminder after the interval of active time; muted during focus
await chrome.storage.local.set({ settings: { intervalMin: 30 } });
await chrome.storage.local.set({ reminder: { activeSec: 0, snoozeUntil: 0 } });
state.tab = { id: 6, url: 'https://github.com/', audible: false, active: true };
chrome.tabs.onActivated.fire({ tabId: 6 }); await settle();
await msg({ type: 'focusStart' }, { url: 'chrome-extension://test/popup/popup.html' });
for (let i = 0; i < 20; i++) await tick(60);                                   // 20 min on GitHub
state.focused = false; chrome.windows.onFocusChanged.fire(-1); await settle();
for (let i = 0; i < 10; i++) await tick(60);                                   // 10 min in another app
state.focused = true; chrome.windows.onFocusChanged.fire(1); await settle();
state.idle = 'idle';
for (let i = 0; i < 5; i++) await tick(60);                                    // 5 min away from the keyboard
state.idle = 'active'; chrome.idle.onStateChanged.fire('active'); await settle();
now += 9 * 60_000; await tick(60);                                             // laptop asleep 9 min (+1 counted)
for (let i = 0; i < 4; i++) await tick(60);                                    // 4 more min on GitHub
state.tab = { id: 7, url: 'https://stackoverflow.com/questions/1', audible: false, active: true };
chrome.tabs.onActivated.fire({ tabId: 7 }); await settle();
for (let i = 0; i < 10; i++) await tick(60);                                   // 10 min on Stack Overflow
check('focus session tracks where the time went while it runs', () => {
  const f = local().focus;
  assert.equal(f.sites['github.com'], 25 * 60);
  assert.equal(f.away.unfocused, 600);
});
state.tab = { id: 6, url: 'https://github.com/', audible: false, active: true };
chrome.tabs.onActivated.fire({ tabId: 6 }); await settle();
check('no reminder during a focus session', () => assert.equal(state.notifications.length, 0));
await msg({ type: 'focusStop' }, { url: 'chrome-extension://test/popup/popup.html' });
check('focus session is logged', () => assert.equal(day().focus.sessions, 1));
check('focus session records its screen time (35 min active in the browser)', () => assert.equal(day().focus.browser, 35 * 60));
check('focus study timer is wall-clock time (59 min)', () => assert.equal(day().focus.seconds, 59 * 60));
check('finished session: time per site', () =>
  assert.deepEqual(local().focusSessions[0].sites, { 'github.com': 25 * 60, 'stackoverflow.com': 10 * 60 }));
check('finished session: time away, by reason (other app, idle, asleep)', () =>
  assert.deepEqual(local().focusSessions[0].away, { unfocused: 600, idle: 300, off: 540 }));
check('finished session: sites + away = the whole session', () => {
  const s = local().focusSessions[0];
  const sum = [...Object.values(s.sites), ...Object.values(s.away)].reduce((a, b) => a + b, 0);
  assert.equal(sum, (s.end - s.start) / 1000);
});
for (let i = 0; i < 31; i++) await tick(60);
check('reminder fires after 30 min of active time', () => assert.equal(state.notifications.length, 1));

// 8b. Break timer: 5+ min away from the browser counts as a break; "I took a break" resets it
const POPUP = { url: 'chrome-extension://test/popup/popup.html' };
for (let i = 0; i < 10; i++) await tick(60);
check('break timer counts active time', () => assert.ok(local().reminder.activeSec >= 600));
state.focused = false; chrome.windows.onFocusChanged.fire(-1); await settle();
for (let i = 0; i < 6; i++) await tick(60);                                    // 6 min in another app
state.focused = true; chrome.windows.onFocusChanged.fire(1); await settle();
await tick(60);
check('6 min away resets the break timer', () => assert.equal(local().reminder.activeSec, 60));
state.focused = false; chrome.windows.onFocusChanged.fire(-1); await settle();
for (let i = 0; i < 2; i++) await tick(60);                                    // only 2 min away
state.focused = true; chrome.windows.onFocusChanged.fire(1); await settle();
await tick(60);
check('a short 2 min gap does not reset it', () => assert.equal(local().reminder.activeSec, 120));
const breaksBefore = day().breaks;
await msg({ type: 'breakTaken' }, POPUP);
check('"I took a break" resets the timer and counts a break', () => {
  assert.equal(local().reminder.activeSec, 0);
  assert.equal(day().breaks, breaksBefore + 1);
});
const notesBefore = state.notifications.length;
await msg({ type: 'testReminder' }, POPUP);
check('test notification shows without counting a reminder', () => assert.equal(state.notifications.length, notesBefore + 1));

// 8c. Focus pause: paused time is left out of the session, but recorded
const focusSecsBefore = day().focus.seconds;
await msg({ type: 'focusStart' }, POPUP);
for (let i = 0; i < 10; i++) await tick(60);                                   // 10 min focused
await msg({ type: 'focusPause' }, POPUP);
for (let i = 0; i < 15; i++) await tick(60);                                   // 15 min paused (still browsing)
await msg({ type: 'focusResume' }, POPUP);
for (let i = 0; i < 5; i++) await tick(60);                                    // 5 more min
await msg({ type: 'focusStop' }, POPUP);
const paused = local().focusSessions.at(-1);
check('pause: session records how long it was paused', () => assert.equal(paused.paused, 15 * 60));
check('pause: nothing is counted for the session while paused', () => assert.equal(paused.sites['github.com'], 15 * 60));
check('pause: study time leaves the pause out', () => assert.equal(day().focus.seconds - focusSecsBefore, 15 * 60));
check('pause: daily total still counts browsing during the pause', () => assert.ok(day().sites['github.com'] >= 30 * 60));

// 9. Midnight split
now = new Date(2026, 10, 13, 23, 59, 30).getTime(); await tick(0);
await tick(60);
check('time is split at midnight', () => assert.ok(local()['day:2026-11-14']?.sites['github.com'] > 0));

// 10. Wipe
await msg({ type: 'wipe' }, { url: 'chrome-extension://test/popup/popup.html' });
check('delete all wipes stored data', () => assert.ok(!Object.keys(local()).some((k) => k.startsWith('day:2026-11-13'))));

console.log(`\n${passed} checks passed`);
