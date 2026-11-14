// Tests the REAL built content script (dist/firefox/content/ai-badge.js) in a simulated page,
// using the Send-button markup copied from claude.ai, gemini.google.com and chatgpt.com (Nov 2026).
// It also proves the script never reads the chat box: any read of its text throws.
// Usage: npm run build && node scripts/test-content.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const script = readFileSync(new URL('../dist/firefox/content/ai-badge.js', import.meta.url), 'utf8');

// Real markup from the sites (classes trimmed). The chat box contains a "secret" prompt.
const PAGES = {
  'https://claude.ai/new': `
    <div contenteditable="true" class="ProseMirror" id="box"><p>my secret prompt</p></div>
    <div class="flex"><span><button type="button" disabled="" data-cds="Button" aria-label="Send message" aria-keyshortcuts="Enter" data-testid="chat-input-send"><span aria-hidden="true"><span data-cds-part="paint"></span></span><span class="inline-flex"><span data-cds="Icon" id="icon"></span></span></button></span></div>`,
  'https://gemini.google.com/app': `
    <rich-textarea><div class="ql-editor" contenteditable="true" id="box"><p>my secret prompt</p></div></rich-textarea>
    <button maticonbutton="" class="mdc-icon-button send-button" aria-label="Send message" aria-disabled="false"><span class="mat-mdc-button-persistent-ripple"></span><gem-icon><mat-icon role="img" id="icon" fonticon="arrow_upward"></mat-icon></gem-icon></button>`,
  'https://chatgpt.com/': `
    <form><div contenteditable="true" class="ProseMirror" id="prompt-textarea"><p>my secret prompt</p></div>
    <div id="slot"></div></form>`,
};

/** Logged-out ChatGPT ("lightweight composer", Nov 2026, copied from the live site; classes trimmed). Disabled while the box is empty. */
const CHATGPT_LIGHT = `<form><textarea id="prompt-textarea" name="prompt-textarea"></textarea>
  <button class="xjyslct" aria-label="Send message" data-composer-submit="" data-oai-tooltip="" data-send-label="Send message" data-stop-label="Stop generating" data-w-component="button" type="submit" data-visually-disabled="" aria-disabled="true"><span data-composer-send-icon=""><svg id="icon" aria-hidden="true"><use href="#lightweight-composer-send"></use></svg></span><span data-composer-stop-icon="" hidden=""><svg aria-hidden="true"><use href="#lightweight-composer-stop"></use></svg></span></button></form>`;

/** Logged-in ChatGPT shows its Send button only once the box has text (the voice button sits there otherwise). */
const CHATGPT_SEND = '<button id="composer-submit-button" aria-label="Send prompt" data-testid="send-button" class="composer-submit-btn"><svg id="icon"></svg></button>';

function load(url, html = PAGES[url]) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const sent = [];
  let clock = 1_000_000;
  window.Date.now = () => clock;
  const ev = () => ({ addListener() {} });
  window.chrome = {
    runtime: { sendMessage: async (m) => void sent.push(JSON.parse(JSON.stringify(m))), getURL: (p) => p },
    storage: { local: { get: async () => ({}) }, onChanged: ev() },
  };
  // Privacy proof: reading what is in the chat box is an error.
  const box = window.document.getElementById('box') ?? window.document.getElementById('prompt-textarea');
  for (const prop of ['textContent', 'innerText', 'innerHTML', 'outerHTML', 'value']) {
    Object.defineProperty(box, prop, { get() { throw new Error(`content script read the chat box (${prop})`); } });
  }
  window.eval(script);
  const btn = window.document.querySelector('button[aria-label="Send message"]');
  const icon = window.document.getElementById('icon');
  const enter = (opts = {}) => box.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...opts }));
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const later = (ms = 1500) => { clock += ms; };
  return { window, sent, btn, icon, box, enter, click, later };
}

const flush = () => new Promise((r) => setTimeout(r, 20));
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };

console.log('Mothlight content-script (Send button) test');

// ── Claude ──
{
  const t = load('https://claude.ai/new');
  await check('Claude: click on the disabled Send button (empty box) is not counted', async () => {
    t.click(t.icon); await flush();
    assert.equal(t.sent.length, 0);
  });
  await check('Claude: Enter while the Send button is disabled is not counted', async () => {
    t.enter(); await flush();
    assert.equal(t.sent.length, 0);
  });
  t.btn.removeAttribute('disabled'); // user typed something → site enables the button
  await check('Claude: click on the Send icon counts 1 prompt', async () => {
    t.click(t.icon); await flush();
    assert.deepEqual(t.sent, [{ type: 'promptSent', provider: 'claude' }]);
  });
  await check('Claude: Enter right after the click (same prompt) is not double-counted', async () => {
    t.enter(); await flush();
    assert.equal(t.sent.length, 1);
  });
  t.later();
  await check('Claude: Shift+Enter (new line) is not counted', async () => {
    t.enter({ shiftKey: true }); await flush();
    assert.equal(t.sent.length, 1);
  });
  await check('Claude: Enter in the chat box counts the next prompt', async () => {
    t.enter(); await flush();
    assert.equal(t.sent.length, 2);
  });
  t.later();
  await check('Claude: Enter outside the chat box is not counted', async () => {
    t.window.document.body.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await flush();
    assert.equal(t.sent.length, 2);
  });
}

// ── Gemini ──
{
  const t = load('https://gemini.google.com/app');
  await check('Gemini: click on the Send icon counts 1 prompt', async () => {
    t.click(t.icon); await flush();
    assert.deepEqual(t.sent, [{ type: 'promptSent', provider: 'gemini' }]);
  });
  t.later();
  await check('Gemini: Enter in the chat box counts', async () => {
    t.enter(); await flush();
    assert.equal(t.sent.length, 2);
  });
  t.later();
  t.btn.setAttribute('aria-disabled', 'true');
  await check('Gemini: aria-disabled Send button is not counted', async () => {
    t.click(t.icon); t.enter(); await flush();
    assert.equal(t.sent.length, 2);
  });
  t.btn.setAttribute('aria-label', 'Stop response');
  t.btn.setAttribute('aria-disabled', 'false');
  await check('Gemini: the "Stop response" button is not a prompt', async () => {
    t.click(t.icon); await flush();
    assert.equal(t.sent.length, 2);
  });
}

// ── ChatGPT (logged out: only the Send button tells us) ──
{
  const t = load('https://chatgpt.com/');
  await check('ChatGPT: Enter with an empty box (no Send button yet) is not counted', async () => {
    t.enter(); await flush();
    assert.equal(t.sent.length, 0);
  });
  t.window.document.getElementById('slot').innerHTML = CHATGPT_SEND; // user typed → Send button appears
  const icon = t.window.document.getElementById('icon');
  await check('ChatGPT: click on the Send button counts 1 prompt', async () => {
    t.click(icon); await flush();
    assert.deepEqual(t.sent, [{ type: 'promptSent', provider: 'chatgpt' }]);
  });
  t.later();
  await check('ChatGPT: Enter in the chat box counts', async () => {
    t.enter(); await flush();
    assert.equal(t.sent.length, 2);
  });
}

// ── ChatGPT logged out: the lightweight composer (real markup) ──
{
  const t = load('https://chatgpt.com/', CHATGPT_LIGHT);
  const btn = t.window.document.querySelector('button[data-composer-submit]');
  await check('ChatGPT (logged out): click on the disabled Send button (empty box) is not counted', async () => {
    t.click(t.icon); t.enter(); await flush();
    assert.equal(t.sent.length, 0);
  });
  btn.setAttribute('aria-disabled', 'false'); btn.removeAttribute('data-visually-disabled'); // user typed
  await check('ChatGPT (logged out): click on the Send icon counts 1 prompt', async () => {
    t.click(t.icon); await flush();
    assert.deepEqual(t.sent, [{ type: 'promptSent', provider: 'chatgpt' }]);
  });
  t.later();
  await check('ChatGPT (logged out): Enter in the chat box counts', async () => {
    t.enter(); await flush();
    assert.equal(t.sent.length, 2);
  });
  t.later();
  btn.setAttribute('aria-label', 'Stop generating'); // same button while it answers
  await check('ChatGPT (logged out): "Stop generating" is not a prompt', async () => {
    t.click(t.icon); await flush();
    assert.equal(t.sent.length, 2);
  });
}

console.log('  ✓ the chat box text was never read (any read would have thrown)');
console.log(`\n${passed + 1} checks passed`);
