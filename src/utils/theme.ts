import { useState, useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

// Keep in sync with the inline script in index.html, which applies the theme before the first paint.
const KEY = 'theme';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Sets <html data-theme> to the resolved theme; index.css keys the dark tokens off it. */
export function applyTheme(pref: ThemePref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'system' && darkQuery().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // storage blocked: the choice still applies to this page
  }
  applyTheme(pref);
}

/** Follow OS light/dark changes while the preference is "system". Call once at startup. */
export function watchSystemTheme() {
  darkQuery().addEventListener('change', () => {
    if (getThemePref() === 'system') applyTheme('system');
  });
}

const resolvedTheme = (): 'light' | 'dark' =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/** Subscribe to <html data-theme> changes (theme switch or OS change while on "system"). */
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** The theme currently applied to the page, re-rendering when it changes. */
export function useResolvedTheme() {
  return useSyncExternalStore(subscribeTheme, resolvedTheme);
}

/** The stored preference plus a setter, for the System / Light / Dark switch. */
export function useThemePref(): [ThemePref, (pref: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(getThemePref);
  return [pref, (next) => { setThemePref(next); setPref(next); }];
}
