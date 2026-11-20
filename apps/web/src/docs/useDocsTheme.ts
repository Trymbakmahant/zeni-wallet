import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'zeni-docs-theme';
const SYSTEM_QUERY = '(prefers-color-scheme: dark)';

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function useDocsTheme() {
  const [preference, setPreference] = useState(savedTheme);
  const [systemTheme, setSystemTheme] = useState<Theme>(() =>
    window.matchMedia(SYSTEM_QUERY).matches ? 'dark' : 'light',
  );

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_QUERY);
    const updateSystem = () => setSystemTheme(media.matches ? 'dark' : 'light');
    const syncPreference = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setPreference(savedTheme());
    };
    updateSystem();
    media.addEventListener('change', updateSystem);
    window.addEventListener('storage', syncPreference);
    return () => {
      media.removeEventListener('change', updateSystem);
      window.removeEventListener('storage', syncPreference);
    };
  }, []);

  const theme = preference ?? systemTheme;
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setPreference(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep the switch usable when browser storage is unavailable.
    }
  }

  return { theme, toggleTheme };
}
