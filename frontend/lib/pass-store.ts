/**
 * Where this browser keeps its demo access pass (docs/DEMO_ACCESS.md).
 *
 * The API lives on another domain, so a cookie would be third-party; the pass is
 * kept in localStorage and sent as the X-Demo-Pass header instead. Storage can be
 * blocked (private windows), so every access is guarded and the app still works.
 */

const KEY = "demo_pass";

export function getPass(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setPass(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {}
}

export function clearPass(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/** Store a pass arriving on the emailed link (?pass=...) and drop it from the address bar. */
export function takePassFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("pass");
  if (!token) return null;
  setPass(token);
  url.searchParams.delete("pass");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  return token;
}
