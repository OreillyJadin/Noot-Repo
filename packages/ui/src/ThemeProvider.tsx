// ThemeProvider — resolves a direction + dark mode into flat tokens and exposes
// them via context. Works in RN and RN Web. Ported concept from the handoff's
// themeStyle() root-swap. Port the rest of app/kit.jsx into sibling files.
import React, { createContext, useContext, useMemo } from 'react';
import { resolveTheme, type Direction, type Theme } from '@noot/theme';

const ThemeContext = createContext<Theme>(resolveTheme('sage', false));
const DirectionContext = createContext<Direction>('sage');

export interface ThemeProviderProps {
  direction?: Direction;
  dark?: boolean;
  children: React.ReactNode;
}

export function ThemeProvider({ direction = 'sage', dark = false, children }: ThemeProviderProps) {
  const theme = useMemo(() => resolveTheme(direction, dark), [direction, dark]);
  return <DirectionContext.Provider value={direction}><ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider></DirectionContext.Provider>;
}

export function useThemeDirection(): Direction {
  return useContext(DirectionContext);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
