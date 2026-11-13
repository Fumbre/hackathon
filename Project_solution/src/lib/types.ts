import type { GridCode } from './footprint';

/** Prompt counts for one AI provider on one day. */
export interface AiCount {
  /** Seen by the network observer: a "send prompt" request left the browser. */
  detected: number;
  /** Added by the user with the "+1" button. */
  manual: number;
}

/** Everything Mothlight stores about one calendar day (local time). */
export interface DayBucket {
  /** hostname → active seconds. Hostnames only: never paths, titles or page content. */
  sites: Record<string, number>;
  /** provider id → prompt counts. */
  ai: Record<string, AiCount>;
  focus: { sessions: number; seconds: number };
  reminders: number;
  breaks: number;
}

export type FigureChoice = 'range' | 'gemini' | 'chatgpt';

export interface Settings {
  /** Reminder after this many minutes of *active* browsing. */
  intervalMin: number;
  /** Daily browsing goal in hours ("under N hours"). */
  goalHours: number;
  grid: GridCode;
  figure: FigureChoice;
  /** Assumed laptop power draw while browsing, in watts. */
  laptopWatts: number;
  /** Show the small prompt-cost badge on AI sites. */
  badge: boolean;
}

/** The time-slice that is currently being counted (kept in storage.session). */
export interface Segment {
  host: string;
  start: number; // epoch ms
}

export type TrackStatus = 'active' | 'idle' | 'locked' | 'unfocused' | 'no-site';

export interface FocusState {
  active: boolean;
  start: number; // epoch ms
}

export interface ReminderState {
  /** Active seconds counted since the last reminder. */
  activeSec: number;
  snoozeUntil: number; // epoch ms
}

export type LogKind = 'prompt' | 'manual' | 'pause' | 'resume' | 'reminder' | 'break' | 'focus' | 'privacy';

export interface LogEvent {
  t: number;
  kind: LogKind;
  text: string;
}

/** Messages from extension pages / content script to the background. */
export type Message =
  | { type: 'flush' }
  | { type: 'addPrompt'; provider: string }
  | { type: 'focusStart' }
  | { type: 'focusStop' }
  | { type: 'snooze'; minutes: number }
  | { type: 'wipe' }
  | { type: 'logExport' };
