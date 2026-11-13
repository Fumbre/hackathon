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

export type FigureKey = 'gemini' | 'chatgpt' | 'claude' | 'other';

export interface AiProvider {
  id: string;
  name: string;
  hosts: string[];
  /** Matches the URL path (+ query) of a "send prompt" POST. null = cannot be detected (e.g. WebSocket chat). */
  sendPattern: RegExp | null;
  /**
   * CSS selector of the site's "Send" button, for sites whose network request we can't see.
   * The content script notices a click on it (or Enter in the chat box while it is enabled).
   * It never reads the text. null = not used.
   */
  sendButton: string | null;
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
    sendButton: null, // the network pattern works
    figure: 'chatgpt',
  },
  {
    id: 'claude',
    name: 'Claude',
    hosts: ['claude.ai'],
    // e.g. /api/organizations/<org>/chat_conversations/<id>/completion (also retry_completion)
    sendPattern: /\/(retry_)?completion(\?|$)/,
    sendButton: 'button[data-testid="chat-input-send"], button[aria-label="Send message"]',
    figure: 'claude',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    hosts: ['gemini.google.com'],
    // e.g. /_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=…
    sendPattern: /StreamGenerate/,
    // Gemini now sends prompts through geminiweb-pa.clients6.google.com/v1/processSession
    // (a long-lived channel that also carries other traffic), so we watch the Send button instead.
    sendButton: 'button[aria-label="Send message"]',
    figure: 'gemini',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    hosts: ['www.perplexity.ai'],
    sendPattern: /^\/rest\/sse\/perplexity_ask(\?|$)/,
    sendButton: null,
    figure: 'other',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    sendPattern: /^\/api\/v0\/chat\/completion(\?|$)/,
    sendButton: null,
    figure: 'other',
  },
  {
    id: 'grok',
    name: 'Grok',
    hosts: ['grok.com'],
    sendPattern: /^\/rest\/app-chat\/conversations\/(new|[^/]+\/responses)(\?|$)/,
    sendButton: null,
    figure: 'other',
  },
  {
    id: 'mistral',
    name: 'Le Chat (Mistral)',
    hosts: ['chat.mistral.ai'],
    sendPattern: null, // not verified yet: time on site + "+1" only
    sendButton: null,
    figure: 'other',
  },
  {
    id: 'copilot',
    name: 'Copilot',
    hosts: ['copilot.microsoft.com'],
    sendPattern: null, // chats over a WebSocket: one connection, many prompts → not countable
    sendButton: null,
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

/** Can Mothlight count this provider's prompts automatically? */
export function canDetect(p: AiProvider): boolean {
  return p.sendPattern !== null || p.sendButton !== null;
}

export function isAiHost(host: string): boolean {
  return providerForHost(host) !== undefined;
}
