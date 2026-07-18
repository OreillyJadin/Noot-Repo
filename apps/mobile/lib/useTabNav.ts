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
import { useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useApp } from './store';

// The tab-root routes that belong to each mode (mirrors TabBar's tab sets). Used to
// remember the user's place per mode without a mid-switch transient (role changed but
// the old route still mounted) recording a route under the wrong mode.
const ROLE_TABS: Record<string, string[]> = {
  student: ['home', 'student_home', 'sessions', 'profile'],
  tutor: ['tutor_home', 'tutor_calendar', 'tutor_sessions', 'tutor_profile'],
  ambassador: ['ambassador_home', 'ambassador_referrals', 'profile'],
};

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
  const { role, recordRoute } = useApp();
  // pathname is like '/home' or '/tutor_calendar'; the tab keys are the bare route.
  const active = pathname.replace(/^\//, '');

  // Remember the current tab as this mode's place, so switching back to the mode returns
  // here instead of its cold home. Guard by the mode's own tab set to ignore the brief
  // window during a switch where `role` has changed but the previous screen is still up.
  useEffect(() => {
    if (ROLE_TABS[role]?.includes(active)) recordRoute(role, active);
  }, [role, active, recordRoute]);

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
