import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('mdds-theme') as Theme | null;
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}
  // default to dark per spec
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem('mdds-theme', t);
    } catch {}
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.colorScheme = t;
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute('content', t);
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.backgroundColor = theme === 'dark' ? '#080c16' : '#FAFAF8';
    document.body.style.backgroundColor = theme === 'dark' ? '#080c16' : '#FAFAF8';
  }, [theme]);

  // listen for storage changes across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'mdds-theme' && (e.newValue === 'dark' || e.newValue === 'light')) {
        setThemeState(e.newValue as Theme);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // initialize attribute synchronously on first mount (for SSR/hydration safety, useEffect already handles)
  useEffect(() => {
    const t = getInitialTheme();
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.colorScheme = t;
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
