import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AccentKey,
  DEFAULT_ACCENT,
  DEFAULT_MODE,
  ResolvedMode,
  Theme,
  ThemeMode,
  buildTheme,
} from './theme';

const STORAGE_KEY = '@expense_tracker:appearance';

interface ThemeContextValue {
  theme: Theme;
  /** What the user picked: system | light | dark. */
  mode: ThemeMode;
  /** What is actually rendered (system resolved). */
  resolvedMode: ResolvedMode;
  accentKey: AccentKey;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: AccentKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_MODE);
  const [accentKey, setAccentState] = useState<AccentKey>(DEFAULT_ACCENT);

  // Restore the saved appearance once, before the user can change it.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw) as { mode?: ThemeMode; accent?: AccentKey };
        if (saved.mode) setModeState(saved.mode);
        if (saved.accent) setAccentState(saved.accent);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: { mode: ThemeMode; accent: AccentKey }) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      persist({ mode: next, accent: accentKey });
    },
    [accentKey, persist],
  );

  const setAccent = useCallback(
    (next: AccentKey) => {
      setAccentState(next);
      persist({ mode, accent: next });
    },
    [mode, persist],
  );

  const resolvedMode: ResolvedMode =
    mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;

  const theme = useMemo(() => buildTheme(resolvedMode, accentKey), [resolvedMode, accentKey]);

  const value = useMemo(
    () => ({ theme, mode, resolvedMode, accentKey, setMode, setAccent }),
    [theme, mode, resolvedMode, accentKey, setMode, setAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside a <ThemeProvider>');
  }
  return ctx;
}

/**
 * Build a StyleSheet from the active theme, memoised per theme.
 * Pass a module-level factory so the reference stays stable:
 *
 *   const styles = useThemedStyles(createStyles);
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const { theme } = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
