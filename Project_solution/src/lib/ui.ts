// Small helpers shared by the popup, dashboard and onboarding pages.

import { api } from './browser';
import type { Message } from './types';

/** Escape text before putting it into innerHTML (hostnames, labels). */
export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function send<T = unknown>(msg: Message): Promise<T> {
  return api.runtime.sendMessage(msg) as Promise<T>;
}

/** Mo the moth, drawn in CSS (styles in static/styles/app.css). `glow` 0..1 */
export function moHtml(glow = 0.4, size: 'sm' | 'lg' = 'sm'): string {
  return `<div class="mo mo-${size}" style="--glow:${glow.toFixed(2)}" aria-hidden="true">
    <span class="mo-wing mo-wing-l"></span><span class="mo-wing mo-wing-r"></span>
    <span class="mo-body"></span><span class="mo-eye mo-eye-l"></span><span class="mo-eye mo-eye-r"></span>
    <span class="mo-ant mo-ant-l"></span><span class="mo-ant mo-ant-r"></span>
  </div>`;
}

/** Offer a JSON file to save, without the `downloads` permission. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
}

export function $(sel: string, root: ParentNode = document): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

export function openDashboard(hash = ''): void {
  void api.tabs.create({ url: api.runtime.getURL(`dashboard/dashboard.html${hash}`) });
}
