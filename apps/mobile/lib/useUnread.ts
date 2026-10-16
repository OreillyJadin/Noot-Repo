// Unread-notification count for the bell badge. Refreshes when visible or when a push arrives.
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@noot/core';
import { onPushReceived } from './push';

export function useUnread(): number {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    api.notifications.unreadCount().then(setCount).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const unsubscribe = onPushReceived(refresh);
    return () => {
      appState.remove();
      unsubscribe();
    };
  }, [refresh]);
  return count;
}
