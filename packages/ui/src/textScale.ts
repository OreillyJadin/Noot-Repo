// Large-text (Dynamic Type / Android font size) support. See docs/qa/DYNAMIC_TYPE.md.
//
// Text scales with the OS setting everywhere. Two tools keep layouts intact at the largest sizes:
//  • useLargeText(): past LARGE_TEXT_SCALE, rows that can't hold their content side by side
//    (button pairs, stat cards, header + trailing control) stack or wrap instead.
//  • TEXT_CAPS: maxFontSizeMultiplier for the few slots whose width is fixed by design
//    (tab bar cells, week-strip day cells) and for screen titles, which otherwise split a
//    single long word mid-word. Each cap still lets the text grow well past the default.
import { useWindowDimensions } from 'react-native';

/** OS font scale from which layouts switch to their stacked/wrapping arrangement. */
export const LARGE_TEXT_SCALE = 1.4;

export const TEXT_CAPS = {
  /** Tab bar labels: five equal cells across the screen width. */
  tabLabel: 1.3,
  /** Large screen titles (H1, admin headers, nav bar titles): keeps whole words on a line. */
  screenTitle: 1.6,
  /** Section headings (H2). */
  heading: 2,
  /** Labels inside fixed-width cells, e.g. the seven-day strip on the tutor calendar. */
  cell: 1.4,
} as const;

export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= LARGE_TEXT_SCALE;
}
