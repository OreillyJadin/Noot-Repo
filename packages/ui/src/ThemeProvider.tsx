// ThemeProvider — resolves a direction + dark mode into flat tokens and exposes
// them via context. Works in RN and RN Web. Ported concept from the handoff's
// themeStyle() root-swap. Port the rest of app/kit.jsx into sibling files.
import React, { createContext, useContext, useMemo } from 'react';
import { resolveTheme, type Direction, type Theme } from '@noot/theme';

const ThemeContext = createContext<Theme>(resolveTheme('sage', false));

export interface ThemeProviderProps {
  direction?: Direction;
  dark?: boolean;
  children: React.ReactNode;
}

export function ThemeProvider({ direction = 'sage', dark = false, children }: ThemeProviderProps) {
  const theme = useMemo(() => resolveTheme(direction, dark), [direction, dark]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
