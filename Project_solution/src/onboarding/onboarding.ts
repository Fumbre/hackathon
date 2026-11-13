// First-run page. In Chrome the AI-site access is granted at install time.
// In Firefox (MV3) it is optional, so the user grants it here with one click.

import { AI_HOST_PATTERNS } from '../lib/ai-sites';
import { api } from '../lib/browser';
import { $, moHtml } from '../lib/ui';

$('#mo').innerHTML = moHtml(0.5, 'lg');

async function showState() {
  const ok = await api.permissions.contains({ origins: AI_HOST_PATTERNS });
  $('#grant').classList.toggle('hidden', ok);
  $('#granted').classList.toggle('hidden', !ok);
  if (ok) $('#access-title').textContent = 'Mo can count prompts on AI sites';
}

$('#grant').addEventListener('click', async () => {
  // Must run directly inside the click handler (a user gesture).
  await api.permissions.request({ origins: AI_HOST_PATTERNS }).catch(() => false);
  await showState();
});

void showState();
