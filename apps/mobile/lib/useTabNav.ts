// Single source of truth for bottom-tab navigation. Every tab-root screen uses
// this instead of hand-rolling its own onTab handler (they used to — 9 copies of
// `router.replace('/'+key)`, one with a divergent switch).
//
// Behaviour, applied uniformly to every tab (Home, Search, Sessions, Profile, …):
//   - Tapping a DIFFERENT tab → client-side navigation (router.replace, no reload).
//   - Tapping the tab you're ALREADY on → smooth scroll to top + optional soft
//     reset of local page state (search text, filters). Never a dead/disabled
//     button, never a redundant same-route navigation.
//
// `active` is derived from the live pathname (expo-router's usePathname), so the
// highlighted tab always matches the real route without screens passing a literal.
import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';

export interface UseTabNavOptions {
  /** Ref to the page's <Body> ScrollView, so a reselect can scroll to top. */
  scrollRef?: RefObject<ScrollView | null>;
  /** Called on reselect (tapping the current tab) to clear filters/search/etc. */
  onReselect?: () => void;
}

export interface TabNav {
  /** Route key of the current screen, e.g. 'home' / 'tutor_calendar'. */
  active: string;
  /** Pass straight to <TabBar onTab={...} />. */
  onTab: (key: string) => void;
}

export function useTabNav({ scrollRef, onReselect }: UseTabNavOptions = {}): TabNav {
  const router = useRouter();
  const pathname = usePathname();
  // pathname is like '/home' or '/tutor_calendar'; the tab keys are the bare route.
  const active = pathname.replace(/^\//, '');

  const onTab = useCallback(
    (key: string) => {
      if (key === active) {
        // Already here → soft reset instead of navigating (or doing nothing).
        scrollRef?.current?.scrollTo({ y: 0, animated: true });
        onReselect?.();
        return;
      }
      // Different tab → client-side replace (tab roots don't stack history).
      router.replace(('/' + key) as never);
    },
    [active, router, scrollRef, onReselect],
  );

  return { active, onTab };
}
