// The AI services Mothlight recognises, and how a "prompt sent" looks on the network.
//
// How detection works (and what it can NOT see):
//   The background script observes outgoing requests to these hosts only.
//   It looks at the request METHOD and URL PATH, e.g. "POST /backend-api/conversation".
//   It never reads the request body, so it never sees what you typed.
//
// Endpoints change when the sites update. The patterns below are the best-known
// "send prompt" requests; check each one in DevTools → Network while sending a
// prompt (the live log on the Privacy page shows every detection). If a site
// changes, detection for that site stops, while time on site and "+1" still work.

export type FigureKey = 'gemini' | 'chatgpt' | 'other';

export interface AiProvider {
  id: string;
  name: string;
  hosts: string[];
  /** Matches the URL path (+ query) of a "send prompt" POST. null = cannot be detected (e.g. WebSocket chat). */
  sendPattern: RegExp | null;
  /** Which published per-prompt figure applies as the central estimate. */
  figure: FigureKey;
}

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    // logged-in: /backend-api/conversation or /backend-api/f/conversation; logged-out: /backend-anon/...
    sendPattern: /^\/backend-(api|anon)\/(f\/)?conversation(\?|$)/,
    figure: 'chatgpt',
  },
  {
    id: 'claude',
    name: 'Claude',
    hosts: ['claude.ai'],
    sendPattern: /\/chat_conversations\/[^/]+\/(completion|retry_completion)(\?|$)/,
    figure: 'other',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    hosts: ['gemini.google.com'],
    sendPattern: /\/StreamGenerate(\?|$)/,
    figure: 'gemini',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    hosts: ['www.perplexity.ai'],
    sendPattern: /^\/rest\/sse\/perplexity_ask(\?|$)/,
    figure: 'other',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    sendPattern: /^\/api\/v0\/chat\/completion(\?|$)/,
    figure: 'other',
  },
  {
    id: 'grok',
    name: 'Grok',
    hosts: ['grok.com'],
    sendPattern: /^\/rest\/app-chat\/conversations\/(new|[^/]+\/responses)(\?|$)/,
    figure: 'other',
  },
  {
    id: 'mistral',
    name: 'Le Chat (Mistral)',
    hosts: ['chat.mistral.ai'],
    sendPattern: null, // not verified yet: time on site + "+1" only
    figure: 'other',
  },
  {
    id: 'copilot',
    name: 'Copilot',
    hosts: ['copilot.microsoft.com'],
    sendPattern: null, // chats over a WebSocket: one connection, many prompts → not countable
    figure: 'other',
  },
];

/** Used for "+1" from the popup when you are not on a known AI site. */
export const OTHER_PROVIDER_ID = 'other';

export const AI_HOST_PATTERNS: string[] = AI_PROVIDERS.flatMap((p) => p.hosts.map((h) => `https://${h}/*`));

const bare = (h: string) => h.replace(/^www\./, '');

export function providerForHost(host: string): AiProvider | undefined {
  const h = bare(host);
  return AI_PROVIDERS.find((p) => p.hosts.some((x) => bare(x) === h));
}

export function providerById(id: string): AiProvider | undefined {
  return AI_PROVIDERS.find((p) => p.id === id);
}

export function providerName(id: string): string {
  return providerById(id)?.name ?? 'Other AI';
}

export function isAiHost(host: string): boolean {
  return providerForHost(host) !== undefined;
}
