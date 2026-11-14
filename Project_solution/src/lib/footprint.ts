// Footprint maths. Every constant here is listed with its source in docs/SOURCES.md.
// Nobody knows exactly what one prompt costs. Each service is priced with its own
// best-known figure, and the UI always says which figure was used and why.

import { AI_PROVIDERS, providerById, type FigureKey } from './ai-sites';
import type { AiCount, DayBucket } from './types';

/** Published per-text-prompt figures (company figures, not independently checked). */
export const PER_PROMPT = {
  /** Google: the same median Gemini prompt, counting only the AI chips (TPUs). The lowest credible number. */
  low: { wh: 0.1 },
  /** Google, Aug 2025 (arXiv 2508.15734): median Gemini Apps text prompt, full serving stack. */
  gemini: { wh: 0.24, gco2: 0.03, ml: 0.26 },
  /** Sam Altman, "The Gentle Singularity" (June 2025): average ChatGPT query. CO₂ not given. */
  chatgpt: { wh: 0.34, gco2: null as number | null, ml: 0.32 },
  /**
   * Anthropic publishes NO per-prompt figure. This is an INDEPENDENT estimate:
   * Jegham et al., "How Hungry is AI?" (arXiv 2505.09598, May 2025), Claude 3.7 Sonnet, short prompt
   * (as reported by secondary summaries of the paper). CO₂ and water not used from it.
   */
  claude: { wh: 0.8 },
} as const;

/** Electricity carbon intensity, gCO₂e per kWh. See docs/SOURCES.md. */
export const GRIDS = {
  EU: { name: 'EU average', g: 242 },
  NL: { name: 'Netherlands', g: 268 },
  DE: { name: 'Germany', g: 371 },
  PL: { name: 'Poland', g: 662 },
  FR: { name: 'France', g: 50 },
  SE: { name: 'Sweden', g: 30 },
} as const;
export type GridCode = keyof typeof GRIDS;

/** Comparison constants. */
export const PHONE_CHARGE_WH = 15; // ≈ 4000 mAh × 3.85 V, a typical smartphone battery
export const TEASPOON_ML = 5;
export const LED_BULB_W = 10;

export type Range = [number, number];

export function gridIntensity(code: GridCode): number {
  return (GRIDS[code] ?? GRIDS.EU).g;
}

/** Central per-prompt figure for each kind of service (one number each, no range). */
export const SERVICE_FIGURES: Record<FigureKey, { wh: number; gco2: number | null; ml: number; label: string }> = {
  gemini: { wh: PER_PROMPT.gemini.wh, gco2: PER_PROMPT.gemini.gco2, ml: PER_PROMPT.gemini.ml, label: "Google's own Gemini figure" },
  chatgpt: { wh: PER_PROMPT.chatgpt.wh, gco2: null, ml: PER_PROMPT.chatgpt.ml, label: "OpenAI's ChatGPT average" },
  claude: { wh: PER_PROMPT.claude.wh, gco2: null, ml: (PER_PROMPT.gemini.ml + PER_PROMPT.chatgpt.ml) / 2, label: 'independent estimate (Anthropic publishes none)' },
  other: { wh: PER_PROMPT.gemini.wh, gco2: null, ml: (PER_PROMPT.gemini.ml + PER_PROMPT.chatgpt.ml) / 2, label: 'no figure published: typical text prompt' },
};

export interface ServiceRow {
  id: string;
  name: string;
  figure: FigureKey;
  prompts: number;
  perWh: number;
  wh: number;
  gco2: number;
  ml: number;
}

export interface Footprint {
  prompts: number;
  wh: number;
  gco2: number;
  ml: number;
  /** One row per service with at least one prompt, biggest energy first. */
  rows: ServiceRow[];
}

/**
 * The footprint of a set of prompt counts, each service priced with ITS OWN figure:
 * Claude prompts × the Claude estimate, ChatGPT prompts × OpenAI's figure, and so on.
 * Services without a published figure use a typical text prompt (the Gemini median).
 */
export function estimateAi(ai: Record<string, AiCount>, grid: GridCode): Footprint {
  const g = gridIntensity(grid) / 1000;
  const byId = new Map<string, ServiceRow>();
  for (const [id, c] of Object.entries(ai)) {
    const n = (c?.detected ?? 0) + (c?.manual ?? 0);
    if (n <= 0) continue;
    const prov = providerById(id);
    const figure: FigureKey = prov?.figure ?? 'other';
    const f = SERVICE_FIGURES[figure];
    const wh = n * f.wh;
    const row: ServiceRow = byId.get(id) ?? { id, name: prov?.name ?? 'Other AI', figure, prompts: 0, perWh: f.wh, wh: 0, gco2: 0, ml: 0 };
    row.prompts += n;
    row.wh += wh;
    row.gco2 += f.gco2 !== null ? n * f.gco2 : wh * g;
    row.ml += n * f.ml;
    byId.set(id, row);
  }
  const rows = [...byId.values()].sort((a, b) => b.wh - a.wh || AI_PROVIDERS.findIndex((p) => p.id === a.id) - AI_PROVIDERS.findIndex((p) => p.id === b.id));
  const sum = (k: 'prompts' | 'wh' | 'gco2' | 'ml') => rows.reduce((a, r) => a + r[k], 0);
  return { prompts: sum('prompts'), wh: sum('wh'), gco2: sum('gco2'), ml: sum('ml'), rows };
}

/** Same as estimateAi, summed over several days. */
export function estimateDays(days: Record<string, DayBucket>, keys: string[], grid: GridCode): Footprint {
  const ai: Record<string, AiCount> = {};
  for (const k of keys) {
    for (const [id, c] of Object.entries(days[k]?.ai ?? {})) {
      const t = (ai[id] ??= { detected: 0, manual: 0 });
      t.detected += c.detected;
      t.manual += c.manual;
    }
  }
  return estimateAi(ai, grid);
}

/** Energy your own laptop used while you were actively browsing. */
export function laptopEnergy(activeSeconds: number, watts: number, grid: GridCode) {
  const wh = (watts * activeSeconds) / 3600;
  return { wh, gco2: (wh * gridIntensity(grid)) / 1000 };
}

export function phoneCharges(wh: number): number {
  return wh / PHONE_CHARGE_WH;
}

export function teaspoons(ml: number): number {
  return ml / TEASPOON_ML;
}

export function ledMinutes(wh: number): number {
  return (wh / LED_BULB_W) * 60;
}

/** 12.3 → "12", 1.234 → "1.2", 0.123 → "0.12" */
export function fmtNum(n: number): string {
  if (n === 0) return '0';
  if (n >= 10) return n.toFixed(0);
  if (n >= 1) return n.toFixed(1);
  return n.toFixed(2);
}

export function fmtRange([lo, hi]: Range): string {
  return lo === hi ? fmtNum(lo) : `${fmtNum(lo)}–${fmtNum(hi)}`;
}
