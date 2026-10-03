// Refer a friend — everyone's invite screen: code, Noot credit, and the people you invited
// (InviteView). Reached from Profile and from the tutor in-review screen (T10).
import React from 'react';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body } from '@noot/ui';
import { InviteView } from '../lib/InviteView';
import { usePullToRefresh } from '../lib/usePullToRefresh';

export default function Invite() {
  const router = useRouter();
  const { reloadKey, onRefresh } = usePullToRefresh();
  return (
    <Screen>
      <NavTop title="Refer a friend" onBack={() => router.back()} />
      <Body onRefresh={onRefresh} pad={20} contentStyle={{ paddingTop: 6 }}>
        <InviteView reloadKey={reloadKey} />
      </Body>
    </Screen>
  );
}
