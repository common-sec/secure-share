// Page addresses. Each tool has its own static page (/, /chat/, /passwords/); room secrets and
// settings live in the fragment (#r=…&k=…&h=…), which is never sent to a server.

export type Page = 'share' | 'chat' | 'passwords';

const PATHS: Record<Page, string> = { share: '', chat: 'chat/', passwords: 'passwords/' };

/** The site's root, from the page's data-root ("./" or "../"), so it works from any folder. */
export function siteRoot(): URL {
  return new URL(document.documentElement.dataset.root ?? './', location.href);
}

/** The absolute address of a tool's page, without a fragment. */
export function pageUrl(page: Page): string {
  return new URL(PATHS[page], siteRoot()).href;
}

/** The fragment's parameters: room secrets (`#r=…&k=…&h=…`) or the generator's settings. */
export function fragmentParams(): URLSearchParams {
  return new URLSearchParams(location.hash.replace(/^#/, ''));
}

/** Drops the fragment and mounts the current tool again, fresh (Cancel, Leave, Reset). */
export function restart(): void {
  history.replaceState(null, '', location.pathname + location.search);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/**
 * Where a link in the old single-page format (`/#/chat?r=…`, before 0.11.0) now lives:
 * `/chat/#r=…`. Null if the fragment isn't one, so new links are never rewritten.
 */
export function legacyRedirect(hash: string): string | null {
  const m = /^#\/(share|chat|password)?\/?(?:\?(.*))?$/.exec(hash);
  if (!m) return null;
  const page: Page = m[1] === 'chat' ? 'chat' : m[1] === 'password' ? 'passwords' : 'share';
  return pageUrl(page) + (m[2] ? `#${m[2]}` : '');
}
