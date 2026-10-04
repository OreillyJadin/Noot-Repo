// The back arrow for a tutor-application step — see lib/stepBack.ts for the rule (ERR-020).
import { useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { previousStepHref } from './stepBack';

export function useStepBack(step: number) {
  const router = useRouter();
  const { resumed } = useLocalSearchParams<{ resumed?: string }>();
  return useCallback(() => {
    const href = previousStepHref(step, resumed === '1');
    if (href) router.replace(href as never);
    else router.back();
  }, [router, step, resumed]);
}
