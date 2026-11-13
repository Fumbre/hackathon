// Notice THAT a prompt was sent on sites whose network request we can't see (Claude, Gemini).
//
// What this code looks at:
//   • a click on the site's own "Send message" button (found with a CSS selector)
//   • the Enter key pressed inside the chat box, while that Send button is enabled
// What it never looks at: the text you typed. We don't read the chat box, its value,
// or the page. "Is the Send button enabled?" is how we know the box isn't empty,
// without looking inside it.

/** Ignore a second signal for the same prompt (Enter + click, double click) within this window. */
const SAME_PROMPT_MS = 1000;

function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  const h = el as HTMLElement;
  return h.isContentEditable || h.tagName === 'TEXTAREA' || h.closest('[contenteditable="true"], [contenteditable=""]') !== null;
}

/**
 * Start listening. `report` is called once per detected prompt.
 * Listeners use the capture phase so they run BEFORE the site's own handlers:
 * at that moment the Send button still shows whether there is something to send.
 */
export function installSendDetector(doc: Document, selector: string, report: () => void): () => void {
  let last = 0;
  const fire = () => {
    const now = Date.now();
    if (now - last < SAME_PROMPT_MS) return;
    last = now;
    report();
  };

  const onClick = (e: Event) => {
    const btn = (e.target as Element | null)?.closest?.(selector);
    if (btn && !isDisabled(btn)) fire();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.altKey) return;
    if (!isEditable(e.target)) return;
    const btn = doc.querySelector(selector);
    if (btn && !isDisabled(btn)) fire();
  };

  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKey as EventListener, true);
  return () => {
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKey as EventListener, true);
  };
}
