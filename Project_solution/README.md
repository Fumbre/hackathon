# Mothlight 🦋

**See the real cost of your time online and your AI use: in minutes, and in the energy, carbon and water behind it.**
A browser extension for **Chrome and Firefox**, built for the *Campus Unleashed* hackathon (Team 1, theme *"Student Life, Fixed"*).

Mo the moth is drawn to your screen's glow. The longer you browse, the brighter Mo glows and the dizzier Mo gets.
Everything stays on your laptop: **no account, no server, zero network requests.**

---

## Install (1 minute)

### Option A: prebuilt zip
Download from `release/` (create it with `npm run zip`, see below):

- **Chrome:** unzip `mothlight-chrome-*.zip`. Go to `chrome://extensions`, switch on **Developer mode**, click **Load unpacked**, and pick the unzipped folder.
- **Firefox:** go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and pick `mothlight-firefox-*.zip` (or `manifest.json` inside `dist/firefox`).
  On the welcome page, click **Allow on AI sites**. Firefox asks for this separately.

### Option B: build from source
```bash
cd Project_solution
npm install
npm run build        # → dist/chrome and dist/firefox
```
Then load `dist/chrome` (Chrome) or `dist/firefox/manifest.json` (Firefox) as described above.

Pin Mothlight to the toolbar (puzzle-piece icon → pin) and browse as usual.

---

## What it does

| Core feature | How |
|---|---|
| **Active time per website** | Counts only the active tab of the focused window. It stops after 60 s idle (and takes those 60 s back off), on a locked screen, or when the browser is in the background. A tab playing sound still counts. |
| **Break reminder** | After 1 h of *active* time (you can choose 30 min to 2 h), you get a notification. Chrome adds *Take a break* and *Snooze 15m* buttons. |
| **Spot AI use** | Recognises ChatGPT, Claude, Gemini, Perplexity, DeepSeek, Grok, Copilot and Le Chat. Prompts are **detected** on the first six. **+1** works everywhere. Time on each site is always shown. |
| **Footprint** | Energy (Wh), carbon (g CO₂e) and water (mL), shown as a **range** by default, with the figure used and its source. See [docs/SOURCES.md](docs/SOURCES.md). |
| **Dashboard** | The popup has Today / AI / Week / Settings tabs. The full dashboard adds a 14-day trend, this week vs last week, a per-service table, a receipt, a privacy page and the maths. |
| **Private** | `storage.local` only, plus Export JSON and Delete all. The code has no `fetch` and nothing loads from a CDN. |

### Our own spin
- **Laptop vs AI:** we also estimate your *own laptop's* energy (watts × active time, with your country's grid). The result surprises most people: the screen time itself usually outweighs the AI prompts.
- **Today's receipt:** the day itemised like a shop receipt, with phone charges, LED-bulb minutes and teaspoons of water, and the maths shown next to it.
- **Prompt-cost badge** on AI sites, showing today's running total with a **+1** button. It sits inside a closed Shadow DOM and reads nothing from the page.
- **Focus sessions:** a study timer that mutes reminders and is logged.
- **Goals & streaks:** "under 4 h today", with a day streak and your best streak.
- **Privacy page with a live log** of exactly what was recorded ("Prompt detected · Claude · 14:02", "Paused: browser not in focus").
- **Mo the moth** has a mood line and a glow that react to your day, plus tips based on your own numbers.

---

## What can Mothlight see? (and why)

| Permission | Why | What it can see |
|---|---|---|
| `storage` | Keep your numbers | Day totals, settings and the log, in this browser only |
| `tabs` | Which site is active | The active tab's address, of which **only the hostname** is kept (`docs.google.com`) |
| `idle` | Stop counting when you step away | Only "active", "idle" or "locked" |
| `alarms` | 1-minute heartbeat | Nothing. It is a timer |
| `notifications` | Break reminder | Nothing. It only shows a message |
| `webRequest` | Notice that a prompt was **sent** | The method and URL of requests to the AI sites only. **Never the body**: we don't request `requestBody`, so the browser never gives us your prompt |
| host access: AI sites only | Detection and the badge | chatgpt.com, claude.ai, gemini.google.com, copilot.microsoft.com, perplexity.ai, chat.mistral.ai, chat.deepseek.com, grok.com |

Prompt detection is a list of known "send" endpoints in [`src/lib/ai-sites.ts`](src/lib/ai-sites.ts), for example
`POST /backend-api/conversation` on chatgpt.com. If a site changes its API, detection for that site stops, while time on the site and +1 keep working.

---

## Project structure

```
Project_solution/
  build.mjs              esbuild: one codebase → dist/chrome (service worker) + dist/firefox (event page)
  manifest.base.json     shared manifest; build.mjs adds the browser-specific keys
  static/                icons, Nocturne design-system CSS, app.css
  src/lib/               browser shim, storage, footprint maths, AI site list, stats, Mo
  src/background/        tracker (time), reminders, ai-detector (prompts), messages
  src/content/ai-badge   the badge on AI sites
  src/popup/             toolbar popup (Today / AI / Week / Settings)
  src/dashboard/         full dashboard page
  src/onboarding/        first-run page (and the Firefox permission step)
  scripts/simulate.mjs   headless test of the real background script with a fake browser + clock
  docs/SOURCES.md        every number and where it comes from
```

### Scripts
| Command | What it does |
|---|---|
| `npm run build` | Builds both browsers into `dist/` |
| `npm run watch` | Rebuilds on change |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Builds Chrome, then runs `scripts/simulate.mjs` (14 checks: focus, idle, audible, sleep, midnight, detection, reminders, wipe) |
| `npm run lint:firefox` | Mozilla's `web-ext lint` |
| `npm run run:firefox` | Opens Firefox with the extension loaded |
| `npm run zip` | Builds `release/mothlight-{chrome,firefox}-*.zip` |

### Design
The UI follows our prototype (`../prototype/Mothlight Extension.dc.html`) and the **Nocturne** design system. Inter and the Phosphor icons are bundled locally.

### Known limitations
- The prompt endpoints must be checked against the live sites (DevTools → Network). They break when a site changes its API.
- Copilot chats over a WebSocket and Le Chat is not mapped yet, so those two are time + manual only.
- We can't tell short prompts from images or deep research without reading content, so the numbers are for text prompts (see SOURCES.md).

---

## AI declaration

Per the event rules, these AI tools were used:

- **Claude Code** (Anthropic, model *Claude Opus 5.5*) for planning the architecture, writing most of the TypeScript/HTML/CSS, the build script, the headless test and these docs. The team reviewed, tested and adjusted the output.
- **Prototype:** `prototype/Mothlight Extension.dc.html` (the UI mock-up the extension follows). *Team: add which tool made it.*
- *Team: list any other AI tools you used here.*
