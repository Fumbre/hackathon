// The full dashboard: Today, Trends, AI use, Receipt, Privacy, How we calculate.

import { AI_HOST_PATTERNS, AI_PROVIDERS, canDetect, isAiHost, OTHER_PROVIDER_ID } from '../lib/ai-sites';
import { api, IS_FIREFOX } from '../lib/browser';
import { dayBars } from '../lib/charts';
import { fmtClock, fmtDuration, lastDays } from '../lib/dates';
import {
  estimatePrompts,
  fmtNum,
  fmtRange,
  GRIDS,
  gridIntensity,
  laptopEnergy,
  LED_BULB_W,
  ledMinutes,
  PER_PROMPT,
  PHONE_CHARGE_WH,
  phoneCharges,
  TEASPOON_ML,
  teaspoons,
  type GridCode,
} from '../lib/footprint';
import { loadModel, type Model } from '../lib/model';
import * as mo from '../lib/mo';
import { exportAll, saveSettings } from '../lib/storage';
import { activeSeconds, aiSeconds, pctChange, promptTotals, sumDays, topSites } from '../lib/stats';
import type { FigureChoice, HostStats, LogKind } from '../lib/types';
import { $, downloadJson, esc, fmtBytes, moHtml, send } from '../lib/ui';

let m: Model;

const bare = (h: string) => h.replace(/^www\./, '');

function moInput() {
  const secs = activeSeconds(m.today);
  const p = promptTotals(m.today).total;
  return {
    goalPct: (secs / (m.settings.goalHours * 3600)) * 100,
    focus: m.focus.active,
    prompts: p,
    aiSeconds: aiSeconds(m.today),
    activeSeconds: secs,
    empty: secs === 0 && p === 0,
  };
}

const kpi = (icon: string, label: string, value: string, note: string) =>
  `<div class="card elev-sm kpi"><div class="lbl"><i class="ph ${icon} icon-accent"></i>${label}</div><div class="val">${value}</div><div class="note">${note}</div></div>`;

// ── Today ──
function renderToday() {
  const secs = activeSeconds(m.today);
  const p = promptTotals(m.today);
  const s = m.settings;
  const est = estimatePrompts(p.total, s.figure, s.grid);
  const lap = laptopEnergy(secs, s.laptopWatts, s.grid);
  const goal = s.goalHours * 3600;
  const sites = topSites(m.today, 10);
  const max = sites[0]?.[1] ?? 1;

  const cmpMax = Math.max(lap.wh, est.wh[1], 0.001);
  const cmp = (label: string, lo: number, hi: number, cls: string, right: string) => `
    <div class="cmp-row"><span>${label}</span>
      <div class="cmp-track">
        ${hi > lo ? `<div class="cmp-fill range" style="width:${(hi / cmpMax) * 100}%"></div>` : ''}
        <div class="cmp-fill ${cls}" style="width:${(lo / cmpMax) * 100}%"></div>
      </div><span class="muted" style="text-align:right">${right}</span></div>`;

  $('#today').innerHTML = `
    <h2>Today</h2>
    <div class="kpis">
      ${kpi('ph-clock', 'Active browsing', fmtDuration(secs), `${Math.round((secs / goal) * 100)}% of your ${s.goalHours}h goal`)}
      ${kpi('ph-sparkle', 'AI prompts', String(p.total), `${p.detected} detected · ${p.manual} added by you`)}
      ${kpi('ph-lightning', 'AI energy', `${fmtRange(est.wh)} Wh`, `≈ ${fmtNum(phoneCharges(p.total * est.perPromptWh))} phone charges`)}
      ${kpi('ph-laptop', 'Laptop energy', `${fmtNum(lap.wh)} Wh`, `${s.laptopWatts} W × ${fmtDuration(secs)} active`)}
      ${kpi('ph-drop', 'AI water', `${fmtRange(est.ml)} mL`, `≈ ${fmtNum(teaspoons(est.ml[1]))} teaspoons`)}
      ${kpi('ph-cloud', 'Carbon (AI + laptop)', `${fmtRange([est.gco2[0] + lap.gco2, est.gco2[1] + lap.gco2])} g`, `CO₂e · grid: ${GRIDS[s.grid].name}`)}
      ${kpi('ph-moon', 'Focus', fmtDuration(m.today.focus.seconds), `${m.today.focus.sessions} session${m.today.focus.sessions === 1 ? '' : 's'} · ${fmtDuration(m.today.focus.browser ?? 0)} in the browser`)}
    </div>

    <div class="two">
      <div class="card elev-sm panel">
        <div class="card-kicker">Laptop vs AI</div>
        <div class="card-title">Your screen time has a footprint too</div>
        ${cmp('Your laptop', lap.wh, lap.wh, '', `${fmtNum(lap.wh)} Wh · ${fmtNum(lap.gco2)} g`)}
        ${cmp('AI prompts', est.wh[0], est.wh[1], 'ai', `${fmtRange(est.wh)} Wh · ${fmtRange(est.gco2)} g`)}
        <div style="font-size:14px">${ratioLine(lap.wh, est.wh)}</div>
        <p class="card-body pretty">The laptop number is ${s.laptopWatts} W (your setting) × the time you were active, with your grid at ${gridIntensity(s.grid)} g CO₂e/kWh.
        AI energy is used far away in data centres, and the light part of its bar is the uncertainty between the lowest and highest published figure.</p>
      </div>
      <div class="card elev-sm panel">
        <div class="card-kicker">Where it went</div>
        ${
          sites.length
            ? sites
                .map(
                  ([h, sec]) => `<div class="bar-row"><span class="bar-name" title="${esc(h)}">${isAiHost(h) ? '<i class="ph-fill ph-sparkle icon-accent"></i>' : ''}${esc(h)}</span>
                  <div class="bar-track"><div class="bar-fill ${isAiHost(h) ? 'ai' : ''}" style="width:${Math.max(2, (sec / max) * 100)}%"></div></div><span class="bar-val">${fmtDuration(sec)}</span></div>`,
                )
                .join('')
            : '<p class="faint">Nothing tracked yet today.</p>'
        }
        <div class="faint" style="font-size:12px"><i class="ph ph-pause-circle"></i> Idle (1 min without input), locked and unfocused time is not counted. A tab playing sound keeps counting.</div>
      </div>
    </div>`;
}

function ratioLine(laptopWh: number, ai: [number, number]): string {
  if (laptopWh <= 0 && ai[1] <= 0) return 'No energy counted yet today.';
  if (ai[1] <= 0) return `So far all of today's energy is your own screen time: ${fmtNum(laptopWh)} Wh.`;
  const lo = laptopWh / ai[1];
  const hi = laptopWh / Math.max(ai[0], 1e-9);
  if (lo >= 1) return `Today your laptop used <strong>${fmtRange([lo, hi])}×</strong> more energy than your AI prompts.`;
  return `Today your AI prompts used <strong>${fmtRange([ai[0] / laptopWh, ai[1] / laptopWh])}×</strong> more energy than your laptop.`;
}

// ── Trends ──
function renderTrends() {
  const s = m.settings;
  const goal = s.goalHours * 3600;
  const keys14 = lastDays(14);
  const values = keys14.map((k) => ({ k, s: activeSeconds(m.days[k]), ai: aiSeconds(m.days[k]) }));
  const top = Math.max(goal * 1.25, ...values.map((v) => v.s));

  const wk = lastDays(7);
  const prev = lastDays(7, 7);
  const a = sumDays(m.days, wk);
  const b = sumDays(m.days, prev);
  const under = (ks: string[]) => ks.filter((k) => activeSeconds(m.days[k]) > 0 && activeSeconds(m.days[k]) < goal).length;
  const laptopWh = (secs: number) => laptopEnergy(secs, s.laptopWatts, s.grid).wh;

  const row = (label: string, now: number, before: number, fmt: (n: number) => string, lowerIsBetter = true) => {
    const ch = pctChange(now, before);
    const cls = ch === null || ch === 0 ? '' : (ch < 0) === lowerIsBetter ? 'down' : 'up';
    return `<tr><td>${label}</td><td class="num">${fmt(now)}</td><td class="num">${fmt(before)}</td>
      <td class="num ${cls}">${ch === null ? '–' : `${ch > 0 ? '+' : ''}${ch}%`}</td></tr>`;
  };

  // best streak in the stored 60 days
  let best = 0;
  let run = 0;
  for (const k of lastDays(60)) {
    const sec = activeSeconds(m.days[k]);
    if (sec > 0 && sec < goal) best = Math.max(best, ++run);
    else run = 0;
  }

  $('#trends').innerHTML = `
    <h2>Trends</h2>
    <p class="section-lead">The last 14 days. The purple part of each bar is time on AI sites, and the line is your ${s.goalHours}h goal.</p>
    <div class="card elev-sm panel">${dayBars(values, goal, top, { dates: true })}</div>
    <div class="two">
      <div class="card elev-sm panel">
        <div class="card-kicker">This week vs the week before</div>
        <table class="table">
          <thead><tr><th></th><th class="num">Last 7 days</th><th class="num">7 days before</th><th class="num">Change</th></tr></thead>
          <tbody>
            ${row('Active time', a.secs, b.secs, fmtDuration)}
            ${row('Time on AI sites', a.ai, b.ai, fmtDuration)}
            ${row('AI prompts', a.prompts, b.prompts, String)}
            ${row('AI energy (central)', a.prompts * PER_PROMPT.gemini.wh, b.prompts * PER_PROMPT.gemini.wh, (n) => `${fmtNum(n)} Wh`)}
            ${row('Laptop energy', laptopWh(a.secs), laptopWh(b.secs), (n) => `${fmtNum(n)} Wh`)}
            ${row('Days under goal', under(wk), under(prev), String, false)}
          </tbody>
        </table>
      </div>
      <div class="card elev-sm panel">
        <div class="card-kicker">Goals &amp; streaks</div>
        <div class="row" style="gap:var(--space-8)">
          <div><div class="big">${m.streak}</div><div class="faint" style="font-size:12px">day streak now</div></div>
          <div><div class="big">${best}</div><div class="faint" style="font-size:12px">best streak (60 days)</div></div>
          <div><div class="big">${under(keys14)}/14</div><div class="faint" style="font-size:12px">days under ${s.goalHours}h</div></div>
        </div>
        <p class="card-body pretty">A streak counts the days in a row you stayed under your browsing goal. Change the goal in the popup's settings.</p>
      </div>
    </div>`;
}

// ── AI use ──
function renderAi() {
  const wk = lastDays(7);
  const rows = [...AI_PROVIDERS.map((p) => ({ id: p.id, name: p.name, hosts: p.hosts, auto: canDetect(p), figure: p.figure })), { id: OTHER_PROVIDER_ID, name: 'Other AI (+1 from popup)', hosts: [] as string[], auto: false, figure: 'other' as const }]
    .map((p) => {
      const count = (k: string) => {
        const c = m.days[k].ai[p.id];
        return (c?.detected ?? 0) + (c?.manual ?? 0);
      };
      const today = count(m.todayKey);
      const week = wk.reduce((a, k) => a + count(k), 0);
      const time = wk.reduce((a, k) => a + p.hosts.reduce((x, h) => x + (m.days[k].sites[bare(h)] ?? 0), 0), 0);
      return { ...p, today, week, time };
    });
  const used = rows.filter((r) => r.week > 0 || r.time > 0);
  const figLabel = (f: string) =>
    f === 'gemini' ? '0.24 Wh (Google)' : f === 'chatgpt' ? '0.34 Wh (OpenAI)' : f === 'claude' ? '≈0.8 Wh (independent estimate)' : 'not published → range';

  $('#ai').innerHTML = `
    <h2>AI use</h2>
    <p class="section-lead">Prompts are counted automatically where Mothlight can see that a chat request was sent. Where it can't, you can add them with "+1", and time on the site is always shown.</p>
    ${
      m.aiAccess
        ? ''
        : `<div class="card panel" style="background:var(--color-accent-900)"><div><i class="ph ph-warning"></i> ${IS_FIREFOX ? 'Firefox asks you separately to allow Mothlight on AI sites.' : 'Mothlight has no access to the AI sites.'} Until then, prompts are not detected.</div>
           <div><button class="btn btn-primary" data-action="grant">Allow on AI sites</button></div></div>`
    }
    <div class="card elev-sm panel">
      <table class="table">
        <thead><tr><th>Service</th><th>Counting</th><th class="num">Today</th><th class="num">Last 7 days</th><th class="num">Time (7 days)</th><th class="num">Energy (7 days)</th><th>Figure used</th></tr></thead>
        <tbody>
          ${(used.length ? used : rows.slice(0, 3))
            .map(
              (r) => `<tr><td>${esc(r.name)}</td><td>${r.auto ? '<span class="tag tag-accent">automatic</span>' : '<span class="tag tag-neutral">time + manual</span>'}</td>
              <td class="num">${r.today}</td><td class="num">${r.week}</td><td class="num">${fmtDuration(r.time)}</td>
              <td class="num">${fmtRange(estimatePrompts(r.week, 'range', m.settings.grid).wh)} Wh</td><td class="faint">${figLabel(r.figure)}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <div class="card elev-sm panel">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap">
        <div class="col" style="gap:2px">
          <div class="card-kicker">Detection helper</div>
          <div class="card-title" style="font-size:15px">A site isn't counted? Find its "send" request</div>
        </div>
        <button class="btn ${m.settings.detectHelper ? 'btn-primary' : 'btn-secondary'}" data-action="toggle-helper"><i class="ph ph-bug"></i>${m.settings.detectHelper ? 'Helper on: turn off' : 'Turn helper on'}</button>
      </div>
      <p class="card-body pretty">While it's on, the table below shows, per AI site, whether Mothlight has access and how many requests it can see. Every POST that was <em>not</em> counted is also listed in the live log (Privacy section) as <code>POST host /path</code>, with long IDs hidden. Never the query or the body. Turn it off when you're done.</p>
      <div id="helper-table">${m.settings.detectHelper ? '<p class="faint">Loading…</p>' : ''}</div>
    </div>`;
}

const FIGURE_NAMES: Record<FigureChoice, string> = { range: 'Range', gemini: 'Gemini', chatgpt: 'ChatGPT', claude: 'Claude' };

// ── Detection helper status (refreshed every 2 s while the helper is on) ──
async function renderHelperTable() {
  const el = document.getElementById('helper-table');
  if (!el || !m?.settings.detectHelper) return;
  const stats = ((await send({ type: 'detectStats' }).catch(() => ({}))) ?? {}) as Record<string, HostStats>;
  const rows = await Promise.all(
    AI_PROVIDERS.flatMap((p) =>
      p.hosts.map(async (h) => {
        const access = await api.permissions.contains({ origins: [`https://${h}/*`] }).catch(() => false);
        const st = stats[bare(h)] ?? { requests: 0, posts: 0, lastPost: '' };
        const verdict = !access
          ? '<span class="tag tag-neutral">no access: allow it</span>'
          : st.requests === 0
            ? '<span class="faint">open the site to test</span>'
            : '<span class="tag tag-accent">visible</span>';
        return `<tr><td>${esc(h)}</td><td>${access ? '✓' : '✗'}</td><td class="num">${st.requests}</td><td class="num">${st.posts}</td><td><code>${esc(st.lastPost || '–')}</code></td><td>${verdict}</td></tr>`;
      }),
    ),
  );
  el.innerHTML = `<table class="table"><thead><tr><th>Site</th><th>Access</th><th class="num">Requests seen</th><th class="num">POSTs</th><th>Last POST path</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <div class="row" style="margin-top:var(--space-3)"><button class="btn btn-primary" data-action="grant"><i class="ph ph-key"></i>Re-ask for access to all AI sites</button></div>`;
}
setInterval(() => void renderHelperTable(), 2000);

// ── Receipt ──
function renderReceipt() {
  const s = m.settings;
  const secs = activeSeconds(m.today);
  const ai = aiSeconds(m.today);
  const p = promptTotals(m.today).total;
  const est = estimatePrompts(p, s.figure, s.grid);
  const lap = laptopEnergy(secs, s.laptopWatts, s.grid);
  const totalWh: [number, number] = [est.wh[0] + lap.wh, est.wh[1] + lap.wh];
  const totalG: [number, number] = [est.gco2[0] + lap.gco2, est.gco2[1] + lap.gco2];
  const now = new Date();
  const ln = (l: string, r: string, cls = '') => `<div class="ln ${cls}"><span>${l}</span><span>${r}</span></div>`;

  $('#receipt').innerHTML = `
    <h2>Today's receipt</h2>
    <p class="section-lead">What today cost, itemised. Take a screenshot if you like. It never leaves your laptop unless you share it.</p>
    <div class="receipt-wrap">
      <div class="receipt" aria-label="Receipt for today">
        <h3>MOTHLIGHT</h3>
        <div class="c small">screen-time &amp; AI receipt</div>
        <div class="c small">${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${fmtClock(now.getTime())}</div>
        <div class="dash"></div>
        ${ln('Active browsing', fmtDuration(secs))}
        ${ln('  of which AI sites', fmtDuration(ai))}
        ${ln('AI prompts', `${p} ×`)}
        <div class="dash"></div>
        ${ln('Laptop energy', `${fmtNum(lap.wh)} Wh`)}
        ${ln('AI energy', `${fmtRange(est.wh)} Wh`)}
        ${ln('AI water', `${fmtRange(est.ml)} mL`)}
        ${ln('Carbon', `${fmtRange(totalG)} g`)}
        <div class="dash"></div>
        ${ln('TOTAL ENERGY', `${fmtRange(totalWh)} Wh`, 'tot')}
        <div class="dash"></div>
        <div class="small">That's about:</div>
        ${ln(' phone charges', fmtRange([phoneCharges(totalWh[0]), phoneCharges(totalWh[1])]), 'small')}
        ${ln(' minutes of a 10 W LED bulb', fmtRange([ledMinutes(totalWh[0]), ledMinutes(totalWh[1])]), 'small')}
        ${ln(' teaspoons of water', fmtRange([teaspoons(est.ml[0]), teaspoons(est.ml[1])]), 'small')}
        <div class="dash"></div>
        ${ln('Focus sessions', String(m.today.focus.sessions))}
        ${ln('  study time', fmtDuration(m.today.focus.seconds))}
        ${ln('  of which on screen', fmtDuration(m.today.focus.browser ?? 0))}
        ${ln('Breaks taken', String(m.today.breaks))}
        <div class="dash"></div>
        <div class="c small">PAID WITH: YOUR ATTENTION</div>
        <div class="c small">Thank you for browsing mindfully ✦</div>
      </div>
      <div class="maths">
        <div class="card-kicker">The maths</div>
        <div class="formula">laptop = ${s.laptopWatts} W × ${(secs / 3600).toFixed(2)} h = ${fmtNum(lap.wh)} Wh</div>
        <div class="formula">AI = ${p} prompts × ${s.figure === 'range' ? '0.10–0.34' : est.perPromptWh} Wh = ${fmtRange(est.wh)} Wh</div>
        <div class="formula">water = ${p} × ${s.figure === 'range' ? '0.26–0.32' : s.figure === 'gemini' ? PER_PROMPT.gemini.ml : s.figure === 'chatgpt' ? PER_PROMPT.chatgpt.ml : '0.26–0.32'} mL = ${fmtRange(est.ml)} mL</div>
        <div class="formula">CO₂e = Wh × ${gridIntensity(s.grid)} g/kWh ÷ 1000${s.figure === 'gemini' ? ' (AI part: Google\'s own 0.03 g per prompt)' : ''}</div>
        <div class="formula">phone charges = Wh ÷ ${PHONE_CHARGE_WH} Wh</div>
        <div class="formula">LED minutes = Wh ÷ ${LED_BULB_W} W × 60</div>
        <div class="formula">teaspoons = mL ÷ ${TEASPOON_ML} mL</div>
        <p class="faint pretty" style="font-size:13px">Figure in use: <strong>${FIGURE_NAMES[s.figure]}</strong>. ${esc(est.note)}</p>
      </div>
    </div>`;
}

// ── Privacy ──
const LOG_ICON: Record<LogKind, string> = {
  prompt: 'ph-paper-plane-tilt',
  manual: 'ph-plus-circle',
  pause: 'ph-pause-circle',
  resume: 'ph-play-circle',
  reminder: 'ph-bell',
  break: 'ph-coffee',
  focus: 'ph-moon',
  privacy: 'ph-lock-simple',
  debug: 'ph-bug',
};

function renderPrivacy() {
  const daysStored = Object.values(m.days).filter((d) => activeSeconds(d) > 0 || promptTotals(d).total > 0).length;
  const perms: [string, string, string][] = [
    ['storage', 'Keep your numbers', 'Day totals, settings and this log, in this browser only.'],
    ['tabs', 'Know which site is active', 'Reads the address of the active tab and keeps only the hostname (e.g. docs.google.com).'],
    ['idle', 'Stop counting when you step away', 'The browser says "active", "idle" or "locked". Nothing about what you do.'],
    ['alarms', 'A 1-minute heartbeat', 'Saves the running time once a minute and checks the reminder.'],
    ['notifications', 'The break reminder', 'Shows the "you\'ve been online for…" message.'],
    ['webRequest', 'Notice that a prompt was sent', 'Sees the method + address of requests to AI sites only. Never the body, so never your prompt.'],
    ['AI sites (host access)', 'Prompt detection + badge', 'On Claude and Gemini: a click on the site\'s own "Send message" button, or Enter in the chat box while that button is enabled. Never the text. Sites: only chatgpt.com, claude.ai, gemini.google.com, copilot.microsoft.com, perplexity.ai, chat.mistral.ai, chat.deepseek.com, grok.com.'],
  ];
  const log = [...m.log].reverse();

  $('#privacy').innerHTML = `
    <h2>Privacy: what Mothlight can see</h2>
    <p class="section-lead">No account, no server, no analytics. Mothlight makes zero network requests. Even its fonts and icons are bundled inside the extension.</p>
    <div class="card elev-sm panel">
      <table class="table">
        <thead><tr><th>Permission</th><th>Why</th><th>What it can see</th></tr></thead>
        <tbody>${perms.map(([p, why, what]) => `<tr><td><code>${p}</code></td><td>${why}</td><td class="muted">${what}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="two">
      <div class="card elev-sm panel">
        <div class="card-kicker">Live log: what was recorded</div>
        <div class="log">${
          log.length
            ? log
                .map(
                  (e) => `<div class="log-row"><time>${fmtClock(e.t)}</time><i class="ph ${LOG_ICON[e.kind]}"></i><span>${esc(e.text)}</span></div>`,
                )
                .join('')
            : '<p class="faint">Nothing logged yet.</p>'
        }</div>
      </div>
      <div class="card elev-sm panel">
        <div class="card-kicker">Your data</div>
        <div class="row" style="gap:var(--space-8)">
          <div><div class="big">${fmtBytes(m.bytes)}</div><div class="faint" style="font-size:12px">stored in this browser</div></div>
          <div><div class="big">${daysStored}</div><div class="faint" style="font-size:12px">days with data</div></div>
          <div><div class="big">0</div><div class="faint" style="font-size:12px">requests sent</div></div>
        </div>
        <p class="card-body pretty">Export gives you everything Mothlight knows about you in one JSON file. Delete wipes it all.</p>
        <div class="row" style="gap:var(--space-2)">
          <button class="btn btn-secondary" data-action="export"><i class="ph ph-download-simple"></i>Export JSON</button>
          <button class="btn btn-secondary" data-action="ask-delete"><i class="ph ph-trash"></i>Delete all</button>
        </div>
      </div>
    </div>`;
}

// ── Sources ──
function renderSources() {
  $('#sources').innerHTML = `
    <h2>How we calculate</h2>
    <p class="section-lead">Nobody knows exactly what one prompt costs. These are the best-known published figures for one <em>text</em> prompt. They are company figures and have not been checked independently, so Mothlight shows a range by default and always tells you which figure it used.</p>
    <div class="card elev-sm panel">
      <table class="table">
        <thead><tr><th>Figure</th><th class="num">Energy</th><th class="num">CO₂e</th><th class="num">Water</th><th>Source</th></tr></thead>
        <tbody>
          <tr><td>Low: chips only</td><td class="num">${PER_PROMPT.low.wh} Wh</td><td class="num">–</td><td class="num">–</td><td class="muted">Google: same median Gemini prompt, counting only the AI accelerators</td></tr>
          <tr><td>Gemini, median text prompt</td><td class="num">${PER_PROMPT.gemini.wh} Wh</td><td class="num">${PER_PROMPT.gemini.gco2} g</td><td class="num">${PER_PROMPT.gemini.ml} mL</td><td class="muted">Google, "Measuring the environmental impact of delivering AI at Google scale", Aug 2025 (arXiv 2508.15734)</td></tr>
          <tr><td>Claude, short prompt <span class="tag tag-neutral">independent</span></td><td class="num">≈ ${PER_PROMPT.claude.wh} Wh</td><td class="num">–</td><td class="num">–</td><td class="muted">Anthropic publishes no figure. Independent estimate: Jegham et al., "How Hungry is AI?", May 2025 (arXiv 2505.09598), Claude 3.7 Sonnet</td></tr>
          <tr><td>ChatGPT, average query</td><td class="num">${PER_PROMPT.chatgpt.wh} Wh</td><td class="num">not given</td><td class="num">${PER_PROMPT.chatgpt.ml} mL</td><td class="muted">Sam Altman (OpenAI CEO), "The Gentle Singularity", blog, June 2025</td></tr>
        </tbody>
      </table>
    </div>
    <div class="two">
      <div class="card elev-sm panel">
        <div class="card-kicker">The three settings</div>
        <ul class="src-list">
          <li><strong>Range</strong> (default): 0.10 → 0.34 Wh per prompt, water 0.26 → 0.32 mL. It shows how big the uncertainty is.</li>
          <li><strong>Gemini</strong>: Google's full-stack median, including its own CO₂e figure.</li>
          <li><strong>ChatGPT</strong>: OpenAI's average. CO₂e = energy × your grid, because OpenAI gives none.</li>
          <li><strong>Claude</strong>: no company figure exists, so we use an independent study (≈ 0.8 Wh). It is higher than the company figures partly because outside researchers count the whole server, not just the chips. CO₂e = energy × your grid.</li>
        </ul>
      </div>
      <div class="card elev-sm panel">
        <div class="card-kicker">Not counted (so the real total is higher)</div>
        <ul class="src-list">
          <li>Long answers, images, files, voice and "deep research" (these cost much more than a text prompt)</li>
          <li>Training the models, building the data centres and hardware</li>
          <li>The network between you and the data centre</li>
          <li>Prompts on sites Mothlight can't detect, unless you add them with +1</li>
        </ul>
      </div>
      <div class="card elev-sm panel">
        <div class="card-kicker">Electricity grid (g CO₂e per kWh)</div>
        <table class="table"><tbody>${(Object.keys(GRIDS) as GridCode[]).map((c) => `<tr><td>${GRIDS[c].name}</td><td class="num">${GRIDS[c].g}</td></tr>`).join('')}</tbody></table>
        <p class="card-body pretty">Ember, European Electricity Review (2023 data) for EU, NL, DE, PL. FR and SE are rounded values for low-carbon (nuclear and hydro) grids. Used for your laptop's energy, and for AI where the company gives no CO₂e.</p>
      </div>
      <div class="card elev-sm panel">
        <div class="card-kicker">Comparisons</div>
        <ul class="src-list">
          <li>Phone charge ≈ ${PHONE_CHARGE_WH} Wh (4000 mAh × 3.85 V)</li>
          <li>Teaspoon = ${TEASPOON_ML} mL</li>
          <li>LED bulb = ${LED_BULB_W} W</li>
          <li>Laptop power: ${m.settings.laptopWatts} W (your setting, an assumption. Many laptops use 10–30 W while browsing.)</li>
        </ul>
      </div>
    </div>`;
}

function renderHeader() {
  const x = moInput();
  $('#mo').innerHTML = moHtml(mo.glow(x.goalPct));
  $('#mood').textContent = mo.moodLine(x);
  $('#date').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#streak').innerHTML = `<i class="ph-fill ph-fire"></i><span>${m.streak}-day streak</span>`;
  $('#side-bytes').textContent = `${fmtBytes(m.bytes)} stored`;
}

function render() {
  renderHeader();
  renderToday();
  renderTrends();
  renderAi();
  renderReceipt();
  renderPrivacy();
  renderSources();
}

async function refresh(flush = false) {
  m = await loadModel({ flush });
  render();
  void renderHelperTable();
}

// ── events ──
document.addEventListener('click', async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'export':
      await send({ type: 'logExport' });
      downloadJson(`mothlight-export-${m.todayKey}.json`, await exportAll());
      break;
    case 'ask-delete':
      $('#dialog').classList.remove('hidden');
      ($('#dialog [data-action="cancel-delete"]') as HTMLButtonElement).focus();
      return;
    case 'cancel-delete':
      $('#dialog').classList.add('hidden');
      return;
    case 'do-delete':
      $('#dialog').classList.add('hidden');
      await send({ type: 'wipe' });
      break;
    case 'toggle-helper':
      await saveSettings({ detectHelper: !m.settings.detectHelper });
      break;
    case 'grant':
      await api.permissions.request({ origins: AI_HOST_PATTERNS }).catch(() => false);
      break;
  }
  await refresh();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('#dialog').classList.add('hidden');
});

let pending = false;
api.storage.onChanged.addListener(() => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    void refresh();
  }, 500);
});

// Highlight the section you're looking at in the side nav.
const links = [...document.querySelectorAll<HTMLAnchorElement>('.side-nav a')];
const observer = new IntersectionObserver(
  (entries) => {
    for (const en of entries) {
      if (en.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.hash === `#${en.target.id}`));
    }
  },
  { rootMargin: '-30% 0px -60% 0px' },
);
document.querySelectorAll('.section').forEach((s) => observer.observe(s));

void refresh(true).then(() => {
  // Jump to the requested section (e.g. #privacy from the popup) after it has content.
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
});
