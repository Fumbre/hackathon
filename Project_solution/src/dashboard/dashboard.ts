// The full dashboard: Today, Trends, AI use, Receipt, Privacy, How we calculate.

import { AI_HOST_PATTERNS, AI_PROVIDERS, canDetect, isAiHost, OTHER_PROVIDER_ID } from '../lib/ai-sites';
import { api, IS_FIREFOX } from '../lib/browser';
import { dayBars } from '../lib/charts';
import { fmtClock, fmtDuration, lastDays } from '../lib/dates';
import {
  estimateAi,
  estimateDays,
  fmtNum,
  GRIDS,
  gridIntensity,
  laptopEnergy,
  LED_BULB_W,
  ledMinutes,
  PER_PROMPT,
  PHONE_CHARGE_WH,
  phoneCharges,
  SERVICE_FIGURES,
  TEASPOON_ML,
  teaspoons,
  type GridCode,
} from '../lib/footprint';
import { loadModel, type Model } from '../lib/model';
import * as mo from '../lib/mo';
import { exportAll, saveSettings } from '../lib/storage';
import { activeSeconds, aiSeconds, pctChange, promptTotals, sumDays, topSites } from '../lib/stats';
import type { HostStats, LogKind } from '../lib/types';
import { AWAY, breakdown, liveSession, rowsHtml, stackBar, summaryLine, type Breakdown } from '../lib/sessions';
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
  const est = estimateAi(m.today.ai, s.grid);
  const lap = laptopEnergy(secs, s.laptopWatts, s.grid);
  const goal = s.goalHours * 3600;
  const all = topSites(m.today, 999);
  const sites = all.slice(0, 10);
  const rest = all.slice(10);
  const restSecs = rest.reduce((a, [, v]) => a + v, 0);
  const max = sites[0]?.[1] ?? 1;

  const cmpMax = Math.max(lap.wh, est.wh, 0.001);
  const cmp = (label: string, v: number, cls: string, right: string) => `
    <div class="cmp-row"><span>${label}</span>
      <div class="cmp-track"><div class="cmp-fill ${cls}" style="width:${Math.max(v > 0 ? 1 : 0, (v / cmpMax) * 100)}%"></div></div>
      <span class="muted cmp-val">${right}</span></div>`;
  const siteRow = (name: string, sec: number, ai: boolean, icon: string) =>
    `<div class="bar-row"><span class="bar-name" title="${esc(name)}">${icon}${esc(name)}</span>
      <div class="bar-track"><div class="bar-fill ${ai ? 'ai' : ''}" style="width:${Math.max(2, (sec / max) * 100)}%"></div></div>
      <span class="bar-val">${fmtDuration(sec)} <span class="faint">${Math.round((sec / Math.max(1, secs)) * 100)}%</span></span></div>`;

  $('#today').innerHTML = `
    <h2>Today</h2>
    <div class="kpis">
      ${kpi('ph-clock', 'Active browsing', fmtDuration(secs), `${Math.round((secs / goal) * 100)}% of your ${s.goalHours}h goal`)}
      ${kpi('ph-sparkle', 'AI prompts', String(p.total), `${p.detected} detected · ${p.manual} added by you`)}
      ${kpi('ph-lightning', 'AI energy', `${fmtNum(est.wh)} Wh`, `≈ ${fmtNum(phoneCharges(est.wh))} phone charges`)}
      ${kpi('ph-laptop', 'Laptop energy', `${fmtNum(lap.wh)} Wh`, `${s.laptopWatts} W × ${fmtDuration(secs)} active`)}
      ${kpi('ph-drop', 'AI water', `${fmtNum(est.ml)} mL`, `≈ ${fmtNum(teaspoons(est.ml))} teaspoons`)}
      ${kpi('ph-cloud', 'Carbon (AI + laptop)', `${fmtNum(est.gco2 + lap.gco2)} g`, `CO₂e · grid: ${GRIDS[s.grid].name}`)}
      ${kpi('ph-moon', 'Focus', fmtDuration(m.today.focus.seconds), `${m.today.focus.sessions} session${m.today.focus.sessions === 1 ? '' : 's'} · ${fmtDuration(m.today.focus.browser ?? 0)} in the browser${(m.today.focus.paused ?? 0) >= 60 ? ` · ${fmtDuration(m.today.focus.paused ?? 0)} paused` : ''}`)}
    </div>

    <div class="two">
      <div class="card elev-sm panel">
        <div class="card-kicker">Laptop vs AI</div>
        <div class="card-title">Your screen time has a footprint too</div>
        ${cmp('Your laptop', lap.wh, '', `${fmtNum(lap.wh)} Wh · ${fmtNum(lap.gco2)} g`)}
        ${cmp('AI prompts', est.wh, 'ai', `${fmtNum(est.wh)} Wh · ${fmtNum(est.gco2)} g`)}
        <div style="font-size:14px">${ratioLine(lap.wh, est.wh)}</div>
        <p class="card-body pretty">The laptop number is ${s.laptopWatts} W (your setting) × the time you were active, with your grid at ${gridIntensity(s.grid)} g CO₂e/kWh.
        AI energy is used far away in data centres: each service's prompts × its own per-prompt figure.</p>
      </div>
      <div class="card elev-sm panel">
        <div class="row" style="justify-content:space-between"><div class="card-kicker">Where it went</div><span class="faint" style="font-size:12px">${all.length} site${all.length === 1 ? '' : 's'} · ${fmtDuration(secs)}</span></div>
        ${
          sites.length
            ? sites.map(([h, sec]) => siteRow(h, sec, isAiHost(h), isAiHost(h) ? '<i class="ph-fill ph-sparkle icon-accent"></i>' : '')).join('') +
              (rest.length ? siteRow(`${rest.length} more site${rest.length === 1 ? '' : 's'}`, restSecs, false, '<i class="ph ph-dots-three faint"></i>') : '')
            : '<p class="faint">Nothing tracked yet today.</p>'
        }
        <div class="faint explain-note"><i class="ph ph-info"></i><span>Only <strong>active</strong> time counts: the tab in front, the browser focused, and mouse or keyboard used in the last minute (a tab playing sound keeps counting). The <strong>focus timer</strong> is a stopwatch instead: it also runs while you are away from the browser.</span></div>
      </div>
    </div>`;
}

function ratioLine(laptopWh: number, ai: number): string {
  if (laptopWh <= 0 && ai <= 0) return 'No energy counted yet today.';
  if (ai <= 0) return `So far all of today's energy is your own screen time: ${fmtNum(laptopWh)} Wh.`;
  if (laptopWh <= 0) return `So far all of today's energy is your AI prompts: ${fmtNum(ai)} Wh.`;
  if (laptopWh >= ai) return `Today your laptop used <strong>${fmtNum(laptopWh / ai)}×</strong> more energy than your AI prompts.`;
  return `Today your AI prompts used <strong>${fmtNum(ai / laptopWh)}×</strong> more energy than your laptop.`;
}

// ── Focus sessions: where the time went between Start and End ──
function sessionTitle(b: Breakdown): string {
  const d = new Date(b.start);
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${date} · ${fmtClock(b.start)}–${fmtClock(b.end)}`;
}

function sessionCard(b: Breakdown, live: boolean): string {
  const pausedNow = live && !!m.focus.paused;
  return `<div class="card elev-sm panel session${live ? ' live' : ''}">
    <div class="row session-head">
      <div class="col" style="gap:2px">
        <div class="card-kicker">${live ? (pausedNow ? '<i class="ph-fill ph-pause icon-accent"></i> Paused now' : '<i class="ph-fill ph-circle icon-accent" style="font-size:8px"></i> Running now') : sessionTitle(b)}</div>
        <div class="card-title row" style="gap:var(--space-2)">${fmtDuration(b.total)} of focus${b.paused >= 1 ? `<span class="tag tag-neutral" title="Paused time is not part of the session"><i class="ph ph-pause"></i>&nbsp;paused ${fmtDuration(b.paused)}</span>` : ''}</div>
      </div>
      <div class="faint" style="font-size:13px;text-align:right">${summaryLine(b)}</div>
    </div>
    ${stackBar(b)}
    <div class="col" style="gap:6px">${b.rows.length ? rowsHtml(b, { notes: true }) : '<p class="faint">Nothing counted yet. It fills in every minute.</p>'}</div>
  </div>`;
}

function renderFocus() {
  const finished = m.sessions.slice().reverse().map((s) => breakdown(s));
  const live = m.focus.active ? breakdown(liveSession(m.focus)) : null;
  const week = finished.filter((b) => b.start >= Date.now() - 7 * 86400_000);
  const wTotal = week.reduce((a, b) => a + b.total, 0);
  const wBrowser = week.reduce((a, b) => a + b.browser, 0);
  const wPaused = week.reduce((a, b) => a + b.paused, 0);
  const wAway: Record<string, number> = {};
  for (const b of week) for (const r of b.rows) if (r.kind === 'away') wAway[r.key] = (wAway[r.key] ?? 0) + r.secs;
  const topAway = Object.entries(wAway).sort((a, b) => b[1] - a[1])[0];

  $('#focus').innerHTML = `
    <h2>Focus sessions</h2>
    <p class="section-lead">Where your time went between <strong>Start</strong> and <strong>End</strong>: the websites you were active on, and the time you were away from the browser (another app, away from the keyboard, screen locked). Time while the session was <strong>paused</strong> is left out and shown separately. Only site names are kept, as everywhere else.</p>
    ${
      week.length
        ? `<div class="kpis">
      ${kpi('ph-timer', 'Focus this week', fmtDuration(wTotal), `${week.length} session${week.length === 1 ? '' : 's'}`)}
      ${kpi('ph-globe-simple', 'In the browser', fmtDuration(wBrowser), `${Math.round((wBrowser / Math.max(1, wTotal)) * 100)}% of your focus time`)}
      ${kpi('ph-book-open-text', 'Away from the browser', fmtDuration(Math.max(0, wTotal - wBrowser)), topAway ? `mostly: ${AWAY[topAway[0] as keyof typeof AWAY].label.toLowerCase()}` : 'none')}
      ${kpi('ph-pause-circle', 'Paused', fmtDuration(wPaused), wPaused > 0 ? 'not counted as focus' : 'no pauses this week')}
    </div>`
        : ''
    }
    ${live ? sessionCard(live, true) : ''}
    ${
      finished.length
        ? finished.slice(0, 10).map((b) => sessionCard(b, false)).join('')
        : live
          ? ''
          : '<div class="card panel"><p class="faint" style="margin:0">No focus sessions yet. Press <strong>Start</strong> on the Today tab of the popup, study, then press <strong>End</strong>: the breakdown appears here.</p></div>'
    }
    ${finished.length > 10 ? `<p class="faint" style="font-size:12px">Showing the last 10 of ${finished.length} stored sessions.</p>` : ''}`;
}

// ── Trends ──
function renderTrends() {
  const s = m.settings;
  const goal = s.goalHours * 3600;
  const keys14 = lastDays(14);
  const values = keys14.map((k) => ({ k, s: activeSeconds(m.days[k]), ai: aiSeconds(m.days[k]) }));
  const tracked14 = values.filter((v) => v.s > 0).length;

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
    <p class="section-lead">Active browsing over the last 14 days. The light part of each bar is time on AI sites, and the dashed line is your ${s.goalHours}h goal. Hover a bar for details.</p>
    <div class="card elev-sm panel">
      ${dayBars(values, goal, { dates: true, height: 220 })}
      <div class="row legend"><span class="row"><span class="legend-sq" style="background:var(--color-neutral-600)"></span>Active browsing</span><span class="row"><span class="legend-sq" style="background:var(--color-accent-300)"></span>AI sites</span><span class="row"><span class="legend-sq" style="background:var(--color-accent-500)"></span>Today</span><span class="row"><span class="legend-line"></span>${s.goalHours}h goal</span><span class="faint">${tracked14} of 14 days with data</span></div>
    </div>
    <div class="two">
      <div class="card elev-sm panel">
        <div class="card-kicker">This week vs the week before</div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th></th><th class="num">Last 7 days</th><th class="num">7 days before</th><th class="num">Change</th></tr></thead>
          <tbody>
            ${row('Active time', a.secs, b.secs, fmtDuration)}
            ${row('Time on AI sites', a.ai, b.ai, fmtDuration)}
            ${row('AI prompts', a.prompts, b.prompts, String)}
            ${row('AI energy', estimateDays(m.days, wk, s.grid).wh, estimateDays(m.days, prev, s.grid).wh, (n) => `${fmtNum(n)} Wh`)}
            ${row('Laptop energy', laptopWh(a.secs), laptopWh(b.secs), (n) => `${fmtNum(n)} Wh`)}
            ${row('Days under goal', under(wk), under(prev), String, false)}
          </tbody>
        </table></div>
      </div>
      <div class="card elev-sm panel">
        <div class="card-kicker">Goals &amp; streaks</div>
        <div class="row stat-row">
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
  const weekEst = estimateDays(m.days, wk, m.settings.grid);
  const rows = [...AI_PROVIDERS.map((p) => ({ id: p.id, name: p.name, hosts: p.hosts, auto: canDetect(p), figure: p.figure })), { id: OTHER_PROVIDER_ID, name: 'Other AI (+1 from popup)', hosts: [] as string[], auto: false, figure: 'other' as const }]
    .map((p) => {
      const count = (k: string) => {
        const c = m.days[k].ai[p.id];
        return (c?.detected ?? 0) + (c?.manual ?? 0);
      };
      const today = count(m.todayKey);
      const week = wk.reduce((a, k) => a + count(k), 0);
      const time = wk.reduce((a, k) => a + p.hosts.reduce((x, h) => x + (m.days[k].sites[bare(h)] ?? 0), 0), 0);
      return { ...p, today, week, time, wh: weekEst.rows.find((r) => r.id === p.id)?.wh ?? 0 };
    });
  const used = rows.filter((r) => r.week > 0 || r.time > 0);
  const figLabel = (f: keyof typeof SERVICE_FIGURES) => `${SERVICE_FIGURES[f].wh} Wh · ${SERVICE_FIGURES[f].label}`;

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
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Service</th><th>Counting</th><th class="num">Today</th><th class="num">Last 7 days</th><th class="num">Time (7 days)</th><th class="num">Energy (7 days)</th><th>Figure used</th></tr></thead>
        <tbody>
          ${(used.length ? used : rows.slice(0, 3))
            .map(
              (r) => `<tr><td>${esc(r.name)}</td><td>${r.auto ? '<span class="tag tag-accent">automatic</span>' : '<span class="tag tag-neutral">time + manual</span>'}</td>
              <td class="num">${r.today}</td><td class="num">${r.week}</td><td class="num">${fmtDuration(r.time)}</td>
              <td class="num">${fmtNum(r.wh)} Wh</td><td class="faint">${figLabel(r.figure)}</td></tr>`,
            )
            .join('')}
        </tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num">${promptTotals(m.today).total}</td><td class="num">${weekEst.prompts}</td><td class="num">${fmtDuration(wk.reduce((a, k) => a + aiSeconds(m.days[k]), 0))}</td><td class="num">${fmtNum(weekEst.wh)} Wh</td><td></td></tr></tfoot>
      </table></div>
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
  el.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Site</th><th>Access</th><th class="num">Requests seen</th><th class="num">POSTs</th><th>Last POST path</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <div class="row" style="margin-top:var(--space-3)"><button class="btn btn-primary" data-action="grant"><i class="ph ph-key"></i>Re-ask for access to all AI sites</button></div>`;
}
setInterval(() => void renderHelperTable(), 2000);

// ── Receipt ──
function renderReceipt() {
  const s = m.settings;
  const secs = activeSeconds(m.today);
  const ai = aiSeconds(m.today);
  const p = promptTotals(m.today).total;
  const est = estimateAi(m.today.ai, s.grid);
  const lap = laptopEnergy(secs, s.laptopWatts, s.grid);
  const totalWh = est.wh + lap.wh;
  const totalG = est.gco2 + lap.gco2;
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
        ${ln('AI energy', `${fmtNum(est.wh)} Wh`)}
        ${est.rows.map((r) => ln(`  ${esc(r.name)} ${r.prompts}×`, `${fmtNum(r.wh)} Wh`, 'small')).join('')}
        ${ln('AI water', `${fmtNum(est.ml)} mL`)}
        ${ln('Carbon', `${fmtNum(totalG)} g`)}
        <div class="dash"></div>
        ${ln('TOTAL ENERGY', `${fmtNum(totalWh)} Wh`, 'tot')}
        <div class="dash"></div>
        <div class="small">That's about:</div>
        ${ln(' phone charges', fmtNum(phoneCharges(totalWh)), 'small')}
        ${ln(' minutes of a 10 W LED bulb', fmtNum(ledMinutes(totalWh)), 'small')}
        ${ln(' teaspoons of water', fmtNum(teaspoons(est.ml)), 'small')}
        <div class="dash"></div>
        ${ln('Focus sessions', String(m.today.focus.sessions))}
        ${ln('  study time', fmtDuration(m.today.focus.seconds))}
        ${ln('  of which on screen', fmtDuration(m.today.focus.browser ?? 0))}
        ${ln('  paused', fmtDuration(m.today.focus.paused ?? 0))}
        ${ln('Breaks taken', String(m.today.breaks))}
        <div class="dash"></div>
        <div class="c small">PAID WITH: YOUR ATTENTION</div>
        <div class="c small">Thank you for browsing mindfully ✦</div>
      </div>
      <div class="maths">
        <div class="card-kicker">The maths</div>
        <div class="formula">laptop = ${s.laptopWatts} W × ${(secs / 3600).toFixed(2)} h = ${fmtNum(lap.wh)} Wh</div>
        ${
          est.rows.length
            ? est.rows.map((r) => `<div class="formula">${esc(r.name)} = ${r.prompts} prompts × ${r.perWh} Wh = ${fmtNum(r.wh)} Wh · ${fmtNum(r.ml)} mL</div>`).join('')
            : `<div class="formula">AI = 0 prompts = 0 Wh</div>`
        }
        <div class="formula">CO₂e = Wh × ${gridIntensity(s.grid)} g/kWh ÷ 1000 (Gemini prompts: Google's own ${PER_PROMPT.gemini.gco2} g each)</div>
        <div class="formula">phone charges = Wh ÷ ${PHONE_CHARGE_WH} Wh</div>
        <div class="formula">LED minutes = Wh ÷ ${LED_BULB_W} W × 60</div>
        <div class="formula">teaspoons = mL ÷ ${TEASPOON_ML} mL</div>
        <p class="faint pretty" style="font-size:13px">Each service is priced with its own figure. See <a href="#sources">How we calculate</a>.</p>
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
    ['AI sites (host access)', 'Prompt detection + badge', 'On Claude, Gemini and ChatGPT: a click on the site\'s own "Send message" button, or Enter in the chat box while that button is enabled. Never the text. Sites: only chatgpt.com, claude.ai, gemini.google.com, copilot.microsoft.com, perplexity.ai, chat.mistral.ai, chat.deepseek.com, grok.com.'],
  ];
  const log = [...m.log].reverse();

  $('#privacy').innerHTML = `
    <h2>Privacy: what Mothlight can see</h2>
    <p class="section-lead">No account, no server, no analytics. Mothlight makes zero network requests. Even its fonts and icons are bundled inside the extension.</p>
    <div class="card elev-sm panel">
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Permission</th><th>Why</th><th>What it can see</th></tr></thead>
        <tbody>${perms.map(([p, why, what]) => `<tr><td><code>${p}</code></td><td>${why}</td><td class="muted">${what}</td></tr>`).join('')}</tbody>
      </table></div>
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
        <div class="row stat-row">
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
    <p class="section-lead">Nobody knows exactly what one prompt costs. These are the best-known published figures for one <em>text</em> prompt. Mothlight prices each service's prompts with that service's own figure, and uses a typical text prompt for services that publish nothing.</p>
    <div class="card elev-sm panel">
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Figure</th><th class="num">Energy</th><th class="num">CO₂e</th><th class="num">Water</th><th>Source</th></tr></thead>
        <tbody>
          <tr><td>Low: chips only</td><td class="num">${PER_PROMPT.low.wh} Wh</td><td class="num">–</td><td class="num">–</td><td class="muted">Google: same median Gemini prompt, counting only the AI accelerators</td></tr>
          <tr><td>Gemini, median text prompt</td><td class="num">${PER_PROMPT.gemini.wh} Wh</td><td class="num">${PER_PROMPT.gemini.gco2} g</td><td class="num">${PER_PROMPT.gemini.ml} mL</td><td class="muted">Google, "Measuring the environmental impact of delivering AI at Google scale", Aug 2025 (arXiv 2508.15734)</td></tr>
          <tr><td>Claude, short prompt <span class="tag tag-neutral">independent</span></td><td class="num">≈ ${PER_PROMPT.claude.wh} Wh</td><td class="num">–</td><td class="num">–</td><td class="muted">Anthropic publishes no figure. Independent estimate: Jegham et al., "How Hungry is AI?", May 2025 (arXiv 2505.09598), Claude 3.7 Sonnet</td></tr>
          <tr><td>ChatGPT, average query</td><td class="num">${PER_PROMPT.chatgpt.wh} Wh</td><td class="num">not given</td><td class="num">${PER_PROMPT.chatgpt.ml} mL</td><td class="muted">Sam Altman (OpenAI CEO), "The Gentle Singularity", blog, June 2025</td></tr>
        </tbody>
      </table></div>
    </div>
    <div class="two">
      <div class="card elev-sm panel">
        <div class="card-kicker">Which figure each service uses</div>
        <ul class="src-list">
          <li><strong>Gemini</strong>: ${SERVICE_FIGURES.gemini.wh} Wh, ${SERVICE_FIGURES.gemini.ml} mL, Google's full-stack median including its own CO₂e (${PER_PROMPT.gemini.gco2} g).</li>
          <li><strong>ChatGPT</strong>: ${SERVICE_FIGURES.chatgpt.wh} Wh, ${SERVICE_FIGURES.chatgpt.ml} mL, OpenAI's average. CO₂e = energy × your grid, because OpenAI gives none.</li>
          <li><strong>Claude</strong>: ≈ ${SERVICE_FIGURES.claude.wh} Wh from an independent study, because Anthropic publishes none. It is higher partly because outside researchers count the whole server, not just the chips. Water: ${fmtNum(SERVICE_FIGURES.claude.ml)} mL (middle of the company figures).</li>
          <li><strong>Everything else</strong> (Perplexity, DeepSeek, Grok, Copilot, Le Chat, +1 elsewhere): a typical text prompt, ${SERVICE_FIGURES.other.wh} Wh and ${fmtNum(SERVICE_FIGURES.other.ml)} mL.</li>
          <li>The real range is wide: from ${PER_PROMPT.low.wh} Wh (chips only) to ${PER_PROMPT.claude.wh} Wh (whole server) per prompt.</li>
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
  renderFocus();
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
