import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useApp } from './store';
import { onPushOpened } from './push';
import { openNotification } from './openNotification';
import {
  isAppReady,
  setPendingPushOpen,
  subscribePushOpen,
  takePendingPushOpen,
} from './pushOpen';

export function PushOpener() {
  const router = useRouter();
  const { role, setRole, patchBooking } = useApp();
  const latest = useRef({ router, currentRole: role, setRole, patchBooking });
  latest.current = { router, currentRole: role, setRole, patchBooking };

  useEffect(() => subscribePushOpen(() => {
    if (!isAppReady()) return;
    const notification = takePendingPushOpen();
    if (!notification) return;
    setTimeout(() => {
      if (!isAppReady()) {
        setPendingPushOpen(notification);
        return;
      }
      void openNotification(notification, latest.current, { fromPush: true });
    }, 0);
  }), []);

  useEffect(() => onPushOpened(setPendingPushOpen), []);

  return null;
}
