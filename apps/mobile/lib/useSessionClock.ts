import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export function useSessionClock() {
  const [now, setNow] = useState(Date.now());
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []));
  return now;
}
