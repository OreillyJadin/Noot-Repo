// Dark-mode preference — a tiny persisted context so the Settings toggle can switch
// the whole app's theme and have the choice survive a restart. Non-sensitive UI
// preference, so it lives in AsyncStorage (not the encrypted session store); this
// also works on web via localStorage. Mounted ABOVE <ThemeProvider> in _layout so
// its value can drive the resolved theme.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'noot.theme.dark';

interface ThemePref {
  dark: boolean;
  setDark: (v: boolean) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemePref | null>(null);

export function ThemePrefProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDarkState] = useState(false);

  // Load the persisted choice once on startup.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY)
      .then((v) => { if (active && v != null) setDarkState(v === '1'); })
      .catch(() => { /* first run / unavailable → default light */ });
    return () => { active = false; };
  }, []);

  const setDark = (v: boolean) => {
    setDarkState(v);
    AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => { /* best-effort persist */ });
  };

  const value = useMemo<ThemePref>(() => ({ dark, setDark, toggle: () => setDark(!dark) }), [dark]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemePref(): ThemePref {
  const c = useContext(Ctx);
  if (!c) throw new Error('useThemePref must be used within <ThemePrefProvider>');
  return c;
}
