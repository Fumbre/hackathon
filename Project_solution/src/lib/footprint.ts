// Footprint maths. Every constant here is listed with its source in docs/SOURCES.md.
// Nobody knows exactly what one prompt costs, so we show a RANGE by default
// and always say which figure was used and why.

import type { FigureChoice } from './types';

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

export interface Estimate {
  wh: Range;
  gco2: Range;
  ml: Range;
  /** The single Wh-per-prompt used for "real life" comparisons. */
  perPromptWh: number;
  /** One-line explanation shown under the numbers. */
  note: string;
}

export function gridIntensity(code: GridCode): number {
  return (GRIDS[code] ?? GRIDS.EU).g;
}

/** Estimate the footprint of `prompts` text prompts with the chosen figure. */
export function estimatePrompts(prompts: number, figure: FigureChoice, grid: GridCode): Estimate {
  const g = gridIntensity(grid) / 1000; // g per Wh
  const p = prompts;
  if (figure === 'gemini') {
    const f = PER_PROMPT.gemini;
    return {
      wh: [p * f.wh, p * f.wh],
      gco2: [p * f.gco2, p * f.gco2],
      ml: [p * f.ml, p * f.ml],
      perPromptWh: f.wh,
      note: 'Gemini median text prompt: 0.24 Wh, 0.03 g CO₂e, 0.26 mL water (Google, Aug 2025). Company figure, not independently checked.',
    };
  }
  if (figure === 'chatgpt') {
    const f = PER_PROMPT.chatgpt;
    return {
      wh: [p * f.wh, p * f.wh],
      gco2: [p * f.wh * g, p * f.wh * g],
      ml: [p * f.ml, p * f.ml],
      perPromptWh: f.wh,
      note: `ChatGPT average query: 0.34 Wh, 0.32 mL water (OpenAI's CEO, June 2025). CO₂ not given, so it is estimated with your grid (${gridIntensity(grid)} g/kWh).`,
    };
  }
  if (figure === 'claude') {
    const f = PER_PROMPT.claude;
    return {
      wh: [p * f.wh, p * f.wh],
      gco2: [p * f.wh * g, p * f.wh * g],
      // No water figure for Claude: show the range of the two published company figures.
      ml: [p * PER_PROMPT.gemini.ml, p * PER_PROMPT.chatgpt.ml],
      perPromptWh: f.wh,
      note: `Claude: Anthropic publishes no per-prompt figure. 0.8 Wh is an independent estimate (Jegham et al., "How Hungry is AI?", 2025, Claude 3.7 Sonnet, short prompt). It is higher partly because outside studies count the whole server. CO₂ uses your grid; water uses the 0.26–0.32 mL company range.`,
    };
  }
  const lo = PER_PROMPT.low.wh;
  const hi = PER_PROMPT.chatgpt.wh;
  return {
    wh: [p * lo, p * hi],
    gco2: [p * lo * g, p * hi * g],
    ml: [p * PER_PROMPT.gemini.ml, p * PER_PROMPT.chatgpt.ml],
    perPromptWh: PER_PROMPT.gemini.wh,
    note: 'Low 0.10 Wh (Google, chips only) → high 0.34 Wh (OpenAI average). Company figures, not independently checked; long answers, images and files cost more.',
  };
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
