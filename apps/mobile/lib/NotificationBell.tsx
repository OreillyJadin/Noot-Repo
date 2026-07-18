// Header bell that opens the notification center and shows an unread badge.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ic, useTheme } from '@noot/ui';
import { useUnread } from './useUnread';

export function NotificationBell() {
  const t = useTheme();
  const router = useRouter();
  const unread = useUnread();
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      style={[styles.btn, { backgroundColor: t.surface, borderColor: t.border }]}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Ic name="bell" size={19} color={t.text2} strokeWidth={1.7} />
      {unread > 0 ? (
        <View style={[styles.badge, { backgroundColor: t.accent, borderColor: t.surface }]}>
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17, borderRadius: 9, borderWidth: 1.5, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});
