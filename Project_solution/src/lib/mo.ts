// Mo the moth: a mood line and a tip, both computed from your own local data.

export interface MoInput {
  goalPct: number; // 0..∞ (% of the daily goal used)
  focus: boolean;
  prompts: number;
  aiSeconds: number;
  activeSeconds: number;
  empty: boolean;
}

export function moodLine(x: MoInput): string {
  if (x.empty) return 'Fresh start. Hi there!';
  if (x.focus) return 'Shh… Mo is guarding your focus';
  if (x.goalPct < 50) return 'Mo is calm. Nice pace today';
  if (x.goalPct < 90) return 'Mo is fluttering a bit';
  if (x.goalPct < 100) return 'Mo is getting dizzy from the glow';
  return 'Mo is circling the screen. Time for a break?';
}

/** 0..1, used to make Mo glow brighter as the screen time goes up. */
export function glow(goalPct: number): number {
  return Math.max(0.15, Math.min(1, goalPct / 100));
}

/** A tip that fits today's numbers. */
export function tip(x: MoInput): string {
  if (x.prompts >= 30) return 'That is a lot of prompts. One clear prompt with context beats five quick retries.';
  if (x.prompts > 0 && x.aiSeconds > 0 && x.aiSeconds / Math.max(1, x.prompts) < 40)
    return 'Lots of quick prompts. Try writing one longer, clearer prompt instead of many retries.';
  if (x.goalPct >= 100) return 'You passed your goal. Close the tabs you are not using and take a real break.';
  if (x.activeSeconds > 2 * 3600) return 'Two hours in. Look at something 20 m away for 20 seconds (the 20-20-20 rule).';
  if (x.prompts > 0) return 'Short text prompts are the cheapest. Images, files and "deep research" cost far more.';
  return 'Before you open the chatbot: could a quick search or your notes answer it?';
}
