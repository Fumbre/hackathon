// The toolbar popup: Today / AI / Week / Settings (layout follows the prototype).

import { AI_PROVIDERS, canDetect, isAiHost, OTHER_PROVIDER_ID, providerForHost } from '../lib/ai-sites';
import { api, IS_FIREFOX } from '../lib/browser';
import { BREAK_GAP_MS, fmtClock, fmtDuration, intervalLabel, lastDays } from '../lib/dates';
import { estimateAi, estimateDays, fmtNum, GRIDS, phoneCharges, SERVICE_FIGURES, teaspoons, type GridCode } from '../lib/footprint';
import { loadModel, type Model } from '../lib/model';
import * as mo from '../lib/mo';
import { exportAll, saveSettings } from '../lib/storage';
import { activeSeconds, aiSeconds, pctChange, promptTotals, sumDays, topSites } from '../lib/stats';
import type { Settings } from '../lib/types';
import { dayBars } from '../lib/charts';
import { breakdown, focusElapsed, liveSession, pausedSoFar, rowsHtml, stackBar, summaryLine } from '../lib/sessions';
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

/** "12:34" or "1:02:03": focus time on the clock, pauses left out. */
function focusClock(): string {
  const s = Math.floor(focusElapsed(m.focus));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hh > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** While a session runs: where it has gone so far. After End: the last session (for 12 h). */
function focusBreakdown(): string {
  const last = m.sessions[m.sessions.length - 1];
  const s = m.focus.active ? liveSession(m.focus) : last && Date.now() - last.end < 12 * 3600_000 ? last : null;
  if (!s) return '';
  const b = breakdown(s, 3);
  if (m.focus.active && b.rows.length === 0) return '';
  return `<div class="card focus-sum">
    <div class="row between">
      <span class="kicker">${m.focus.active ? 'This session so far' : `Last session · ${fmtClock(b.start)}–${fmtClock(b.end)}`}</span>
      <button class="btn btn-ghost btn-xs" data-action="focus-details">Details <i class="ph ph-arrow-right"></i></button>
    </div>
    ${stackBar(b)}
    <div class="col" style="gap:4px">${rowsHtml(b)}</div>
    <div class="faint xs">${summaryLine(b)}</div>
  </div>`;
}

function focusCard(): string {
  const f = m.focus;
  if (!f.active) {
    return `<div class="card elev-sm focus-card">
      <i class="ph ph-moon icon-accent focus-ico"></i>
      <div class="col grow">
        <div class="card-line">Focus session</div>
        <div class="faint xs">A study timer. Keeps running when you leave the browser and mutes break reminders.</div>
      </div>
      <button class="btn btn-primary btn-sm" data-action="focus-start"><i class="ph-fill ph-play"></i>Start</button>
    </div>`;
  }
  const paused = !!f.paused;
  return `<div class="card elev-sm focus-card ${paused ? 'is-paused' : 'is-running'}">
    <i class="ph ${paused ? 'ph-pause-circle' : 'ph-timer'} icon-accent focus-ico"></i>
    <div class="col grow">
      <div class="card-line">${paused ? '<span class="tag tag-neutral">Paused</span>' : '<span class="live-dot"></span>Focus'} <span id="focus-clock" class="clock">${focusClock()}</span></div>
      <div class="faint xs">${
        paused
          ? `Clock stopped. Paused ${fmtDuration(pausedSoFar(f))} so far`
          : `${fmtDuration(f.browserSec ?? 0)} of it in the browser · reminders muted`
      }</div>
    </div>
    <div class="row btn-pair">
      <button class="btn btn-secondary btn-sm" data-action="${paused ? 'focus-resume' : 'focus-pause'}" title="${paused ? 'Resume the session' : 'Pause: the clock stops and nothing is counted for this session'}">
        <i class="ph-fill ${paused ? 'ph-play' : 'ph-pause'}"></i>${paused ? 'Resume' : 'Pause'}</button>
      <button class="btn btn-primary btn-sm" data-action="focus-stop"><i class="ph-fill ph-stop"></i>End</button>
    </div>
  </div>`;
}

/** The break timer: active minutes since your last break, as a progress bar. */
function breakCard(): string {
  if (m.focus.active) return '';
  const r = m.reminder;
  const now = Date.now();
  const interval = m.settings.intervalMin * 60;
  const rested = !!r.lastActive && now - r.lastActive >= BREAK_GAP_MS;
  const active = rested ? 0 : r.activeSec;
  const snoozed = r.snoozeUntil > now;
  const due = active >= interval;
  const pct = Math.min(100, (active / interval) * 100);
  const left = Math.max(0, interval - active);

  const title = snoozed
    ? `Snoozed until ${fmtClock(r.snoozeUntil)}`
    : due
      ? 'Break due: look away for a bit'
      : rested
        ? 'Fresh start: you just had a break'
        : `Next break in ${fmtDuration(left)}`;

  return `<div class="card elev-sm timer-card ${due && !snoozed ? 'due' : ''}">
    <div class="row between">
      <span class="card-line"><i class="ph ${due && !snoozed ? 'ph-bell-ringing' : snoozed ? 'ph-bell-slash' : 'ph-bell'} icon-accent"></i>${title}</span>
      <span class="faint xs">${fmtDuration(active)} / ${intervalLabel(m.settings.intervalMin)}</span>
    </div>
    <div class="progress"><span style="width:${pct.toFixed(1)}%"></span></div>
    <div class="row between">
      <span class="faint xs">Counts active browsing only. Resets after ${BREAK_GAP_MS / 60_000} min away.</span>
      <span class="row" style="gap:4px">
        ${due && !snoozed ? '<button class="btn btn-ghost btn-xs" data-action="snooze">Snooze 15m</button>' : ''}
        ${active >= 60 || due ? '<button class="btn btn-ghost btn-xs" data-action="break-taken"><i class="ph ph-coffee"></i>I took a break</button>' : ''}
      </span>
    </div>
  </div>`;
}

function siteRows(sites: [string, number][], total: number): string {
  const shown = sites.slice(0, 7);
  const max = shown[0]?.[1] ?? 1;
  const rest = sites.slice(7);
  const restSecs = rest.reduce((a, [, v]) => a + v, 0);
  const row = (name: string, s: number, ai: boolean, icon = '') => `<div class="bar-row">
      <span class="bar-name" title="${esc(name)}">${icon}${esc(name)}</span>
      <div class="bar-track"><div class="bar-fill ${ai ? 'ai' : ''}" style="width:${Math.max(2, (s / max) * 100).toFixed(1)}%"></div></div>
      <span class="bar-val">${fmtDuration(s)} <span class="faint">${Math.round((s / Math.max(1, total)) * 100)}%</span></span>
    </div>`;
  return (
    shown.map(([h, s]) => row(h, s, isAiHost(h), isAiHost(h) ? '<i class="ph-fill ph-sparkle icon-accent"></i>' : '')).join('') +
    (rest.length ? row(`${rest.length} more site${rest.length === 1 ? '' : 's'}`, restSecs, false, '<i class="ph ph-dots-three faint"></i>') : '')
  );
}

function viewToday(): string {
  const secs = activeSeconds(m.today);
  const goal = m.settings.goalHours * 3600;
  const pct = Math.min(100, Math.round((secs / goal) * 100));
  const left = goal - secs;
  const sites = topSites(m.today, 999);

  return `
    <div class="row hero">
      <div class="ring" style="background:conic-gradient(var(--color-accent) ${pct}%, var(--color-neutral-800) 0)">
        <div class="ring-inner"><div><div class="ring-val">${Math.round((secs / goal) * 100)}%</div><div class="faint" style="font-size:10px">of goal</div></div></div>
      </div>
      <div class="col" style="gap:2px;min-width:0">
        <div class="kicker">Active today</div>
        <div class="big">${fmtDuration(secs)}</div>
        <div class="sub">Goal: under ${m.settings.goalHours}h · ${left >= 0 ? `${fmtDuration(left)} left` : `${fmtDuration(-left)} over`}</div>
      </div>
    </div>

    <div class="col" style="gap:var(--space-3)">
      ${focusCard()}
      ${focusBreakdown()}
      ${breakCard()}
    </div>

    <div class="col" style="gap:var(--space-3)">
      <div class="row between">
        <span class="kicker">Where it went</span>
        <span class="faint xs">${sites.length} site${sites.length === 1 ? '' : 's'} · ${fmtDuration(secs)}</span>
      </div>
      ${
        sites.length === 0
          ? '<div class="empty">Nothing yet. Browse a bit and Mo will count your active time here.</div>'
          : siteRows(sites, secs)
      }
      <details class="explain">
        <summary><i class="ph ph-info"></i>How is this time counted?</summary>
        <p>Only <strong>active</strong> time counts: the tab in front, the browser window focused, and mouse or keyboard used in the last minute (a tab playing sound keeps counting). Idle, locked and other-app time is skipped.</p>
        <p>The <strong>focus timer</strong> is different: it is a stopwatch, so it also runs while you read a book or use another app. Pauses are left out.</p>
      </details>
    </div>`;
}

function viewAi(): string {
  const p = promptTotals(m.today);
  const est = estimateAi(m.today.ai, m.settings.grid);
  const aiTime = aiSeconds(m.today);
  const timeOn = (hosts: string[]) => hosts.reduce((a, h) => a + (m.today.sites[h.replace(/^www\./, '')] ?? 0), 0);
  const services = AI_PROVIDERS.map((prov) => {
    const row = est.rows.find((r) => r.id === prov.id);
    return { name: prov.name, n: row?.prompts ?? 0, perWh: row?.perWh ?? SERVICE_FIGURES[prov.figure].wh, wh: row?.wh ?? 0, t: timeOn(prov.hosts), auto: canDetect(prov) };
  }).filter((s) => s.n > 0 || s.t > 0);
  const other = est.rows.find((r) => r.id === OTHER_PROVIDER_ID);
  if (other) services.push({ name: 'Other AI', n: other.prompts, perWh: other.perWh, wh: other.wh, t: 0, auto: false });
  services.sort((a, b) => b.wh - a.wh || b.t - a.t);

  const stat = (icon: string, val: string, unit: string) =>
    `<div class="card elev-sm stat-card"><i class="ph ${icon} icon-accent"></i><div class="stat-val">${val}</div><div class="faint xs">${unit}</div></div>`;

  return `
    ${
      m.aiAccess
        ? ''
        : `<div class="card banner"><div><i class="ph ph-warning"></i> Mothlight can't see AI sites yet, so prompts are not counted automatically.</div>
           <button class="btn btn-primary btn-sm" data-action="grant">Allow on AI sites</button></div>`
    }
    <div class="row between" style="align-items:flex-end">
      <div>
        <div class="kicker">AI prompts today</div>
        <div class="big">${p.total}</div>
      </div>
      <button class="btn btn-primary btn-sm" data-action="add-prompt" title="Count a prompt Mothlight could not detect"><i class="ph ph-plus"></i>1 prompt</button>
    </div>
    <div class="sub" style="margin-top:calc(-1 * var(--space-4))">${p.detected} detected · ${p.manual} added by you · ${fmtDuration(aiTime)} on AI sites</div>

    <div class="grid-3">
      ${stat('ph-lightning', fmtNum(est.wh), 'Wh energy')}
      ${stat('ph-cloud', fmtNum(est.gco2), 'g CO₂e')}
      ${stat('ph-drop', fmtNum(est.ml), 'mL water')}
    </div>

    <div class="card irl-card">
      <div class="card-kicker">In real life</div>
      <div style="font-size:14px">≈ ${fmtNum(phoneCharges(est.wh))} phone charges · ${fmtNum(teaspoons(est.ml))} teaspoons of water</div>
    </div>

    <div class="col" style="gap:var(--space-2)">
      <div class="row between"><span class="kicker">By service</span><span class="faint xs">prompts × Wh each</span></div>
      ${
        services.length
          ? services
              .map(
                (s) => `<div class="svc-row">
                  <span class="svc-name">${esc(s.name)}${s.auto ? '' : ' <span class="faint" title="This site cannot be detected automatically. Use +1.">(manual)</span>'}</span>
                  <span class="svc-calc">${s.n} × ${s.perWh} = <strong>${fmtNum(s.wh)} Wh</strong></span>
                  <span class="svc-time faint">${fmtDuration(s.t)}</span>
                </div>`,
              )
              .join('')
          : '<div class="empty">No AI use today.</div>'
      }
      <div class="faint xs pretty">Each service is priced with its own published figure (Claude has none, so an independent estimate is used). <a href="#" data-action="sources">How we calculate</a></div>
    </div>

    <div class="row tip"><i class="ph ph-leaf icon-accent"></i><span class="muted pretty">Mo's tip: ${esc(mo.tip(moInput()))}</span></div>`;
}

function viewWeek(): string {
  const keys = lastDays(7);
  const prevKeys = lastDays(7, 7);
  const now = sumDays(m.days, keys);
  const prev = sumDays(m.days, prevKeys);
  const change = pctChange(now.secs, prev.secs);
  const goal = m.settings.goalHours * 3600;
  const values = keys.map((k) => ({ k, s: activeSeconds(m.days[k]), ai: aiSeconds(m.days[k]) }));
  const under = values.filter((v) => v.s > 0 && v.s < goal).length;
  const tracked = values.filter((v) => v.s > 0).length;
  const est = estimateDays(m.days, keys, m.settings.grid);
  const promptDelta = now.prompts - prev.prompts;

  return `
    <div class="row between" style="align-items:flex-end">
      <div><div class="kicker">Last 7 days</div><div class="big">${fmtDuration(now.secs)}</div></div>
      ${
        change === null
          ? '<span class="tag tag-neutral">first week</span>'
          : `<span class="tag tag-accent" style="gap:4px;white-space:nowrap" title="Compared with the 7 days before"><i class="ph ${change <= 0 ? 'ph-trend-down' : 'ph-trend-up'}"></i>${change > 0 ? '+' : change < 0 ? '−' : '±'}${Math.abs(change)}% vs last week</span>`
      }
    </div>
    <div class="card elev-sm chart-card">${dayBars(values, goal, { height: 130 })}</div>
    <div class="row legend">
      <span class="row"><span class="legend-line"></span>${m.settings.goalHours}h goal · under it ${under} of ${tracked || 7} day${(tracked || 7) === 1 ? '' : 's'}</span>
      <span class="row"><span class="legend-sq" style="background:var(--color-accent-300)"></span>AI sites</span>
    </div>
    <div class="grid-2">
      <div class="card elev-sm stat-card"><div class="faint xs">AI prompts</div><div class="stat-val">${now.prompts}</div><div class="xs accent-soft">${prev.prompts || now.prompts ? `${promptDelta > 0 ? '+' : promptDelta < 0 ? '−' : '±'}${Math.abs(promptDelta)} vs week before` : 'no prompts yet'}</div></div>
      <div class="card elev-sm stat-card"><div class="faint xs">AI energy</div><div class="stat-val">${fmtNum(est.wh)} Wh</div><div class="xs accent-soft">≈ ${fmtNum(phoneCharges(est.wh))} phone charges</div></div>
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
    <div class="field"><label>Break reminder after (active time)</label>${seg('intervalMin', [[30, '30m'], [60, '1h'], [90, '1.5h'], [120, '2h']])}
      <div class="row between" style="margin-top:6px">
        <span class="faint xs">${IS_FIREFOX ? 'Firefox notifications have no buttons: click one to open the dashboard.' : 'The notification has Take a break and Snooze buttons.'}</span>
        <button class="btn btn-ghost btn-xs" data-action="test-reminder"><i class="ph ph-bell-ringing"></i>Test</button>
      </div>
    </div>
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
        <button class="btn btn-secondary btn-sm" data-action="export" style="flex:1"><i class="ph ph-download-simple"></i>Export JSON</button>
        <button class="btn btn-secondary btn-sm" data-action="ask-delete" style="flex:1"><i class="ph ph-trash"></i>Delete all</button>
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
    case 'focus-details':
      return openDashboard('#focus');
    case 'grant':
      return void api.tabs.create({ url: api.runtime.getURL('onboarding/onboarding.html') });
    case 'focus-start':
      await send({ type: 'focusStart' });
      break;
    case 'focus-stop':
      await send({ type: 'focusStop' });
      break;
    case 'focus-pause':
      await send({ type: 'focusPause' });
      break;
    case 'focus-resume':
      await send({ type: 'focusResume' });
      break;
    case 'break-taken':
      await send({ type: 'breakTaken' });
      break;
    case 'test-reminder':
      await send({ type: 'testReminder' });
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
  if (clock && m?.focus.active && !m.focus.paused) clock.textContent = focusClock();
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
