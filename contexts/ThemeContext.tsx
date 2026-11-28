import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme as nwColorScheme, vars } from 'nativewind';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Platform, useColorScheme as useSystemColorScheme } from 'react-native';

import {
  getThemeColors,
  getThemeCssVariables,
  type ResolvedColorScheme,
  type ThemeColors,
  type ThemePreference,
} from '@/constants/theme';

const THEME_STORAGE_KEY = 'docudash.theme_preference';

export interface ThemeContextValue {
  preference: ThemePreference;
  resolvedScheme: ResolvedColorScheme;
  isDark: boolean;
  colors: ThemeColors;
  themeVars: ReturnType<typeof vars>;
  setPreference: (next: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readWebPreference(): ThemePreference | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : null;
  } catch {
    return null;
  }
}

async function persistPreference(preference: ThemePreference): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, preference);
      } catch {
        // Ignore storage quota / privacy mode failures.
      }
    }
    return;
  }

  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore persistence failures on native.
  }
}

export function useTheme(): ThemeContextValue {
  const value = use(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside <AppThemeProvider>.');
  }
  return value;
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => readWebPreference() ?? 'light'
  );

  // Hydrate persisted preference on native after mount.
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    let isActive = true;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (isActive && isThemePreference(stored)) {
          setPreferenceState(stored);
        }
      } catch {
        // Keep default light preference on storage read error.
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const resolvedScheme: ResolvedColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  // Keep NativeWind's `dark:` utilities and web document root class in sync.
  useEffect(() => {
    try {
      nwColorScheme.set(preference);
    } catch {
      // Ignore if NativeWind darkMode flag hasn't mounted yet.
    }

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const root = document.documentElement;
      root.classList.toggle('dark', resolvedScheme === 'dark');
      root.style.colorScheme = resolvedScheme;
    }
  }, [preference, resolvedScheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    void persistPreference(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(resolvedScheme === 'dark' ? 'light' : 'dark');
  }, [resolvedScheme, setPreference]);

  const colors = useMemo(() => getThemeColors(resolvedScheme), [resolvedScheme]);
  const themeVars = useMemo(() => vars(getThemeCssVariables(resolvedScheme)), [resolvedScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolvedScheme,
      isDark: resolvedScheme === 'dark',
      colors,
      themeVars,
      setPreference,
      toggleTheme,
    }),
    [preference, resolvedScheme, colors, themeVars, setPreference, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
