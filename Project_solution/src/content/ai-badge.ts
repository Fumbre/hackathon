// The prompt-cost badge on AI sites.
//
// What this script does on the page: it adds ONE small element (inside a closed
// Shadow DOM so the site's CSS can't touch it) that shows today's running total.
// What it does NOT do: it never reads the page, the chat, or what you type.
// Its only inputs are Mothlight's own storage and which site it runs on.

import { providerForHost } from '../lib/ai-sites';
import { api } from '../lib/browser';
import { estimatePrompts, fmtRange } from '../lib/footprint';
import { getDay, getSettings } from '../lib/storage';
import { promptTotals } from '../lib/stats';

const provider = providerForHost(location.hostname);

const CSS = `
:host { all: initial; }
.pill {
  position: fixed; right: 16px; bottom: 96px; z-index: 2147483647;
  display: flex; align-items: center; gap: 8px; padding: 5px 6px 5px 10px;
  border-radius: 999px; background: #232532; color: #e9e9ed;
  box-shadow: 0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55);
  font: 500 12px/1.2 Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  user-select: none;
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: #d2cefd; box-shadow: 0 0 8px #9184d9; flex: none; cursor: pointer; }
button {
  font: inherit; font-size: 11px; color: #9184d9; background: transparent; cursor: pointer;
  border: 1px solid #9184d9; border-radius: 999px; padding: 2px 8px;
}
button:hover { background: rgba(145,132,217,.12); }
button:focus-visible { outline: 2px solid #9184d9; outline-offset: 2px; }
.x { border: none; color: #9397ab; padding: 2px 4px; }
.collapsed .txt, .collapsed button { display: none; }
.collapsed { padding: 7px; }
`;

let root: ShadowRoot | null = null;
let host: HTMLElement | null = null;
let collapsed = false;

function mount(): ShadowRoot {
  if (root) return root;
  host = document.createElement('mothlight-badge');
  root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${CSS}</style>
    <div class="pill" role="status" aria-live="polite">
      <span class="dot" title="Mothlight: click to expand or collapse"></span>
      <span class="txt"></span>
      <button class="plus" title="Count a prompt Mothlight did not detect">+1</button>
      <button class="x" title="Collapse" aria-label="Collapse">×</button>
    </div>`;
  const pill = root.querySelector('.pill') as HTMLElement;
  const toggle = () => {
    collapsed = !collapsed;
    pill.classList.toggle('collapsed', collapsed);
  };
  root.querySelector('.dot')!.addEventListener('click', toggle);
  root.querySelector('.x')!.addEventListener('click', toggle);
  root.querySelector('.plus')!.addEventListener('click', () => {
    if (provider) void api.runtime.sendMessage({ type: 'addPrompt', provider: provider.id });
  });
  document.documentElement.appendChild(host);
  return root;
}

function unmount() {
  host?.remove();
  host = null;
  root = null;
}

async function update() {
  const [settings, day] = await Promise.all([getSettings(), getDay()]);
  if (!settings.badge) return unmount();
  const p = promptTotals(day).total;
  const est = estimatePrompts(p, settings.figure, settings.grid);
  const r = mount();
  (r.querySelector('.txt') as HTMLElement).textContent = `${p} prompt${p === 1 ? '' : 's'} today · ${fmtRange(est.wh)} Wh`;
}

if (provider) {
  void update();
  api.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') void update();
  });
}
