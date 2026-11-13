// Day keys use the user's local calendar day, e.g. "2026-11-13".

export function dayKey(d: Date | number = new Date()): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}

/** Start of the next local day after `ts`, in epoch ms. */
export function nextMidnight(ts: number): number {
  const d = new Date(ts);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** The last `n` day keys, oldest first, ending today (or `offset` days ago). */
export function lastDays(n: number, offset = 0): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1 + offset; i >= offset; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

export function weekdayShort(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' });
}

/** 3725 → "1h 02m", 300 → "5m", 20 → "<1m" */
export function fmtDuration(seconds: number): string {
  const totalMin = Math.floor(seconds / 60);
  if (seconds > 0 && totalMin === 0) return '<1m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
