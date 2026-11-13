// The toolbar popup: Today / AI / Week / Settings (layout follows the prototype).

import { AI_PROVIDERS, canDetect, isAiHost, OTHER_PROVIDER_ID, providerForHost } from '../lib/ai-sites';
import { api } from '../lib/browser';
import { fmtClock, fmtDuration, lastDays } from '../lib/dates';
import { estimatePrompts, fmtNum, fmtRange, GRIDS, phoneCharges, teaspoons, type GridCode } from '../lib/footprint';
import { loadModel, type Model } from '../lib/model';
import * as mo from '../lib/mo';
import { exportAll, saveSettings } from '../lib/storage';
import { activeSeconds, aiSeconds, pctChange, promptTotals, sumDays, topSites } from '../lib/stats';
import type { FigureChoice, Settings } from '../lib/types';
import { dayBars } from '../lib/charts';
import { $, downloadJson, esc, fmtBytes, moHtml, openDashboard, send } from '../lib/ui';

type Tab = 'today' | 'ai' | 'week' | 'settings';

let tab: Tab = 'today';
let m: Model;
/** The AI provider of the tab the popup was opened on (for "+1"). */
let currentProvider = OTHER_PROVIDER_ID;

try {
  const saved = localStorage.getItem('tab') as Tab | null;
  if (saved && ['today', 'ai', 'week', 'settings'].includes(saved)) tab = saved;
} catch {
  /* storage blocked: start on Today */
}

// ── rendering ──

function moInput() {
  const secs = activeSeconds(m.today);
  return {
    goalPct: (secs / (m.settings.goalHours * 3600)) * 100,
    focus: m.focus.active,
    prompts: promptTotals(m.today).total,
    aiSeconds: aiSeconds(m.today),
    activeSeconds: secs,
    empty: secs === 0 && promptTotals(m.today).total === 0,
  };
}

function renderHeader() {
  const x = moInput();
  $('#mo').innerHTML = moHtml(mo.glow(x.goalPct));
  $('#mood').textContent = mo.moodLine(x);
  $('#streak').innerHTML = `<i class="ph-fill ph-fire"></i><span>${m.streak}-day streak</span>`;
  document.querySelectorAll<HTMLElement>('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
}

function focusClock(): string {
  const s = Math.max(0, Math.floor((Date.now() - m.focus.start) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function viewToday(): string {
  const secs = activeSeconds(m.today);
  const goal = m.settings.goalHours * 3600;
  const pct = Math.min(100, Math.round((secs / goal) * 100));
  const left = goal - secs;
  const sites = topSites(m.today, 7);
  const max = sites[0]?.[1] ?? 1;

  const r = m.reminder;
  const snoozed = r.snoozeUntil > Date.now();
  const nextIn = Math.max(0, m.settings.intervalMin * 60 - r.activeSec);
  const reminderLine = m.focus.active
    ? ''
    : `<div class="row sub" style="justify-content:space-between">
        <span><i class="ph ph-bell"></i> ${snoozed ? `Reminders snoozed until ${fmtClock(r.snoozeUntil)}` : `Break reminder in ${fmtDuration(nextIn)} of active time`}</span>
        ${snoozed ? '' : '<button class="btn btn-ghost" data-action="snooze" style="font-size:12px">Snooze 15m</button>'}
      </div>`;

  return `
    <div class="row" style="gap:var(--space-6)">
      <div class="ring" style="background:conic-gradient(var(--color-accent) ${pct}%, var(--color-neutral-800) 0)">
        <div class="ring-inner"><div><div style="font-size:18px;font-weight:500;line-height:1">${Math.round((secs / goal) * 100)}%</div><div style="font-size:10px" class="faint">of goal</div></div></div>
      </div>
      <div class="col" style="gap:2px">
        <div class="kicker">Active today</div>
        <div class="big">${fmtDuration(secs)}</div>
        <div class="sub">Goal: under ${m.settings.goalHours}h · ${left >= 0 ? `${fmtDuration(left)} left` : `${fmtDuration(-left)} over`}</div>
      </div>
    </div>

    <div class="col" style="gap:var(--space-2)">
      <div class="card elev-sm" style="flex-direction:row;align-items:center;gap:var(--space-3)">
        <i class="ph ${m.focus.active ? 'ph-timer' : 'ph-moon'} icon-accent" style="font-size:20px"></i>
        <div class="col" style="flex:1">
          <div style="font-size:13px;font-weight:500">${m.focus.active ? `Focus · <span id="focus-clock">${focusClock()}</span>` : 'Focus session'}</div>
          <div style="font-size:11px" class="faint">${m.focus.active ? `${fmtDuration(m.focus.browserSec ?? 0)} of it in the browser · reminders muted` : 'Study timer: keeps running off-screen, mutes reminders'}</div>
        </div>
        <button class="btn btn-primary" data-action="${m.focus.active ? 'focus-stop' : 'focus-start'}" style="font-size:12px">${m.focus.active ? 'End' : 'Start'}</button>
      </div>
      ${reminderLine}
    </div>

    <div class="col" style="gap:var(--space-3)">
      <div class="kicker row" style="justify-content:space-between"><span>Where it went</span><span style="text-transform:none;letter-spacing:0;display:flex;align-items:center;gap:4px"><i class="ph ph-pause-circle"></i>idle &amp; unfocused time skipped</span></div>
      ${
        sites.length === 0
          ? '<div class="empty">Nothing yet. Browse a bit and Mo will count your active time here. Time stops when you are idle or the browser is in the background.</div>'
          : sites
              .map(([host, s]) => {
                const ai = isAiHost(host);
                return `<div class="bar-row">
                  <span class="bar-name" title="${esc(host)}">${ai ? '<i class="ph-fill ph-sparkle icon-accent"></i>' : ''}${esc(host)}</span>
                  <div class="bar-track"><div class="bar-fill ${ai ? 'ai' : ''}" style="width:${Math.max(2, Math.round((s / max) * 100))}%"></div></div>
                  <span class="bar-val">${fmtDuration(s)}</span>
                </div>`;
              })
              .join('')
      }
    </div>`;
}

function viewAi(): string {
  const p = promptTotals(m.today);
  const est = estimatePrompts(p.total, m.settings.figure, m.settings.grid);
  const aiTime = aiSeconds(m.today);
  const charges = phoneCharges(p.total * est.perPromptWh);
  const services = AI_PROVIDERS.map((prov) => {
    const c = m.today.ai[prov.id];
    const t = prov.hosts.reduce((a, h) => a + (m.today.sites[h.replace(/^www\./, '')] ?? 0), 0);
    return { name: prov.name, n: (c?.detected ?? 0) + (c?.manual ?? 0), t, auto: canDetect(prov) };
  }).filter((s) => s.n > 0 || s.t > 0);
  const other = m.today.ai[OTHER_PROVIDER_ID];
  if (other) services.push({ name: 'Other AI', n: other.manual, t: 0, auto: false });

  const fig = (id: FigureChoice, label: string) =>
    `<label class="seg-opt"><input type="radio" name="fig" value="${id}" data-setting="figure" ${m.settings.figure === id ? 'checked' : ''}>${label}</label>`;

  return `
    ${
      m.aiAccess
        ? ''
        : `<div class="card banner"><div><i class="ph ph-warning"></i> Mothlight can't see AI sites yet, so prompts are not counted automatically.</div>
           <button class="btn btn-primary" data-action="grant">Allow on AI sites</button></div>`
    }
    <div class="row" style="align-items:flex-end;justify-content:space-between">
      <div>
        <div class="kicker">AI prompts today</div>
        <div class="big">${p.total}</div>
      </div>
      <button class="btn btn-primary" data-action="add-prompt" style="font-size:12px;white-space:nowrap" title="Count a prompt Mothlight could not detect"><i class="ph ph-plus"></i><span>1 prompt</span></button>
    </div>
    <div class="sub" style="margin-top:calc(-1 * var(--space-4))">${p.detected} detected · ${p.manual} added by you · ${fmtDuration(aiTime)} on AI sites</div>

    <div class="grid-3">
      <div class="card elev-sm" style="gap:2px"><i class="ph ph-lightning icon-accent" style="font-size:18px"></i><div style="font-size:15px;font-weight:500;margin-top:4px">${fmtRange(est.wh)}</div><div style="font-size:11px" class="faint">Wh energy</div></div>
      <div class="card elev-sm" style="gap:2px"><i class="ph ph-cloud icon-accent" style="font-size:18px"></i><div style="font-size:15px;font-weight:500;margin-top:4px">${fmtRange(est.gco2)}</div><div style="font-size:11px" class="faint">g CO₂e</div></div>
      <div class="card elev-sm" style="gap:2px"><i class="ph ph-drop icon-accent" style="font-size:18px"></i><div style="font-size:15px;font-weight:500;margin-top:4px">${fmtRange(est.ml)}</div><div style="font-size:11px" class="faint">mL water</div></div>
    </div>

    <div class="col" style="gap:var(--space-2)">
      <div class="kicker">Per-prompt figure</div>
      <div class="seg full">${fig('range', 'Range')}${fig('gemini', 'Gemini')}${fig('chatgpt', 'ChatGPT')}${fig('claude', 'Claude')}</div>
      <div class="pretty" style="font-size:11px;line-height:1.5"><span class="muted">${esc(est.note)}</span> <a href="#" data-action="sources">How we calculate</a></div>
    </div>

    <div class="card" style="background:var(--color-accent-900);gap:4px">
      <div class="card-kicker">In real life</div>
      <div style="font-size:14px">≈ ${charges.toFixed(2)} phone charges · ${fmtNum(teaspoons(est.ml[1]))} teaspoons of water</div>
      <div style="font-size:11px;color:var(--color-accent-300)">${p.total} prompts × ${est.perPromptWh} Wh = ${fmtNum(p.total * est.perPromptWh)} Wh ÷ 15 Wh per full charge</div>
    </div>

    ${
      services.length
        ? `<div class="col" style="gap:var(--space-2)"><div class="kicker">By service</div>${services
            .map(
              (s) => `<div class="row sub" style="justify-content:space-between"><span>${esc(s.name)}${s.auto ? '' : ' <span class="faint" title="This site cannot be detected automatically. Use +1.">(manual)</span>'}</span><span>${s.n} prompt${s.n === 1 ? '' : 's'} · ${fmtDuration(s.t)}</span></div>`,
            )
            .join('')}</div>`
        : ''
    }

    <div class="row" style="align-items:flex-start;gap:var(--space-2);font-size:12px"><i class="ph ph-leaf icon-accent" style="font-size:16px"></i><span class="muted pretty">Mo's tip: ${esc(mo.tip(moInput()))}</span></div>`;
}

function viewWeek(): string {
  const keys = lastDays(7);
  const prevKeys = lastDays(7, 7);
  const now = sumDays(m.days, keys);
  const prev = sumDays(m.days, prevKeys);
  const change = pctChange(now.secs, prev.secs);
  const goal = m.settings.goalHours * 3600;
  const values = keys.map((k) => ({ k, s: activeSeconds(m.days[k]), ai: aiSeconds(m.days[k]) }));
  const top = Math.max(goal * 1.25, ...values.map((v) => v.s));
  const under = values.filter((v) => v.s > 0 && v.s < goal).length;
  const est = estimatePrompts(now.prompts, 'range', m.settings.grid);
  const promptDelta = now.prompts - prev.prompts;

  return `
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div><div class="kicker">Last 7 days</div><div class="big">${fmtDuration(now.secs)}</div></div>
      ${
        change === null
          ? '<span class="tag tag-neutral">first week</span>'
          : `<span class="tag tag-accent" style="gap:4px;white-space:nowrap" title="Compared with the 7 days before"><i class="ph ${change <= 0 ? 'ph-trend-down' : 'ph-trend-up'}"></i>${change > 0 ? '+' : change < 0 ? '−' : '±'}${Math.abs(change)}% vs last week</span>`
      }
    </div>
    ${dayBars(values, goal, top)}
    <div class="row" style="font-size:11px;gap:var(--space-4)">
      <span class="faint row" style="gap:6px"><span class="legend-line"></span>${m.settings.goalHours}h goal · under it ${under} of 7 days</span>
      <span class="faint row" style="gap:6px"><span style="width:10px;height:10px;border-radius:2px;background:var(--color-accent-700)"></span>AI sites</span>
    </div>
    <div class="grid-2">
      <div class="card elev-sm" style="gap:2px"><div style="font-size:11px" class="faint">AI prompts</div><div style="font-size:18px;font-weight:500">${now.prompts}</div><div style="font-size:11px;color:var(--color-accent-300)">${prev.prompts || now.prompts ? `${promptDelta > 0 ? '+' : promptDelta < 0 ? '−' : '±'}${Math.abs(promptDelta)} vs week before` : 'no prompts yet'}</div></div>
      <div class="card elev-sm" style="gap:2px"><div style="font-size:11px" class="faint">AI energy</div><div style="font-size:18px;font-weight:500">${fmtRange(est.wh)} Wh</div><div style="font-size:11px;color:var(--color-accent-300)">≈ ${fmtRange([phoneCharges(est.wh[0]), phoneCharges(est.wh[1])])} phone charges</div></div>
    </div>
    <button class="btn btn-secondary" data-action="dashboard"><i class="ph ph-chart-line-up"></i>Open full dashboard</button>`;
}

function viewSettings(): string {
  const s = m.settings;
  const seg = (name: keyof Settings, values: [number, string][]) =>
    `<div class="seg full">${values
      .map(([v, l]) => `<label class="seg-opt"><input type="radio" name="${name}" value="${v}" data-setting="${name}" ${s[name] === v ? 'checked' : ''}>${l}</label>`)
      .join('')}</div>`;
  return `
    <div class="field"><label>Remind me after (active time)</label>${seg('intervalMin', [[30, '30m'], [60, '1h'], [90, '1.5h'], [120, '2h']])}</div>
    <div class="field"><label>Daily browsing goal</label>${seg('goalHours', [[3, '3h'], [4, '4h'], [5, '5h'], [6, '6h']])}</div>
    <div class="field"><label for="grid">Electricity grid (for CO₂e)</label>
      <select id="grid" class="input" data-setting="grid">
        ${(Object.keys(GRIDS) as GridCode[]).map((c) => `<option value="${c}" ${s.grid === c ? 'selected' : ''}>${GRIDS[c].name} · ${GRIDS[c].g} g/kWh</option>`).join('')}
      </select>
    </div>
    <div class="field"><label for="watts">Your laptop's power while browsing (W)</label>
      <input id="watts" class="input" type="number" min="3" max="150" step="1" value="${s.laptopWatts}" data-setting="laptopWatts">
    </div>
    <label class="toggle"><input type="checkbox" data-setting="badge" ${s.badge ? 'checked' : ''}>Show the prompt badge on AI sites</label>

    <div class="card elev-sm" style="gap:var(--space-2)">
      <div class="row" style="gap:var(--space-2)"><i class="ph ph-lock-simple icon-accent" style="font-size:18px"></i><div class="card-title" style="font-size:14px">Your data stays here</div></div>
      <div class="pretty muted" style="font-size:12px">Stored in this browser only. No account, no server. Mothlight sees site names and that a prompt was sent, never what you typed.</div>
      <div class="link-row"><span>${fmtBytes(m.bytes)} stored</span><span>·</span><span>0 requests sent</span><span>·</span><a href="#" data-action="privacy">What can Mothlight see?</a></div>
      <div class="row" style="gap:var(--space-2)">
        <button class="btn btn-secondary" data-action="export" style="flex:1;font-size:12px"><i class="ph ph-download-simple"></i>Export JSON</button>
        <button class="btn btn-secondary" data-action="ask-delete" style="flex:1;font-size:12px"><i class="ph ph-trash"></i>Delete all</button>
      </div>
    </div>`;
}

function render() {
  renderHeader();
  const view = $('#view');
  const scroll = view.scrollTop;
  view.innerHTML = tab === 'today' ? viewToday() : tab === 'ai' ? viewAi() : tab === 'week' ? viewWeek() : viewSettings();
  view.scrollTop = scroll;
}

async function refresh(flush = false) {
  m = await loadModel({ flush });
  render();
}

// ── events ──

document.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const tabBtn = target.closest<HTMLElement>('[data-tab]');
  if (tabBtn) {
    tab = tabBtn.dataset.tab as Tab;
    try {
      localStorage.setItem('tab', tab);
    } catch {
      /* ignore */
    }
    $('#view').scrollTop = 0;
    render();
    return;
  }
  const el = target.closest<HTMLElement>('[data-action]');
  if (!el) return;
  e.preventDefault();
  switch (el.dataset.action) {
    case 'dashboard':
      return openDashboard();
    case 'sources':
      return openDashboard('#sources');
    case 'privacy':
      return openDashboard('#privacy');
    case 'grant':
      return void api.tabs.create({ url: api.runtime.getURL('onboarding/onboarding.html') });
    case 'focus-start':
      await send({ type: 'focusStart' });
      break;
    case 'focus-stop':
      await send({ type: 'focusStop' });
      break;
    case 'snooze':
      await send({ type: 'snooze', minutes: 15 });
      break;
    case 'add-prompt':
      await send({ type: 'addPrompt', provider: currentProvider });
      break;
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
  }
  await refresh();
});

document.addEventListener('change', async (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const key = el.dataset.setting as keyof Settings | undefined;
  if (!key) return;
  let value: Settings[keyof Settings];
  if (key === 'badge') value = (el as HTMLInputElement).checked;
  else if (key === 'grid') value = el.value as GridCode;
  else if (key === 'figure') value = el.value as FigureChoice;
  else {
    const n = Number(el.value);
    if (!Number.isFinite(n) || n <= 0) return;
    value = key === 'laptopWatts' ? Math.min(150, Math.max(3, Math.round(n))) : n;
  }
  await saveSettings({ [key]: value } as Partial<Settings>);
  await refresh();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('#dialog').classList.add('hidden');
});

// Live updates: re-render when the background writes new data.
let pending = false;
api.storage.onChanged.addListener(() => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    void refresh();
  }, 250);
});

// The focus clock ticks every second without re-rendering everything.
setInterval(() => {
  const clock = document.getElementById('focus-clock');
  if (clock && m?.focus.active) clock.textContent = focusClock();
}, 1000);

// Which AI site (if any) is the popup opened on? Used so "+1" goes to the right service.
api.tabs
  .query({ active: true, currentWindow: true })
  .then(([t]) => {
    const host = t?.url ? new URL(t.url).hostname : '';
    currentProvider = providerForHost(host)?.id ?? OTHER_PROVIDER_ID;
  })
  .catch(() => undefined);

void refresh(true);
