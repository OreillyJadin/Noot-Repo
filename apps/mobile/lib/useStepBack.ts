// The back arrow for a tutor-application step — see lib/stepBack.ts for the rule (ERR-020).
import { useCallback, useLayoutEffect } from 'react';
import { BackHandler } from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import { previousStepHref } from './stepBack';

export function useStepBack(step: number) {
  const router = useRouter();
  const navigation = useNavigation();
  const { resumed } = useLocalSearchParams<{ resumed?: string }>();
  const href = previousStepHref(step, resumed === '1');

  const back = useCallback(() => {
    if (href) router.replace(href as never);
    else router.back();
  }, [router, href]);

  // The arrow isn't the only way back. On a resumed step the iOS edge swipe would pop past
  // the earlier steps exactly as the arrow used to, so it's off there; Android's back
  // button follows the arrow.
  useLayoutEffect(() => {
    navigation.setOptions({ gestureEnabled: !href });
  }, [navigation, href]);
  useFocusEffect(
    useCallback(() => {
      if (!href) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        back();
        return true;
      });
      return () => sub.remove();
    }, [href, back]),
  );

  return back;
}
