import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { attentionTotal } from '@noot/core';
import { Ic, useTheme } from '@noot/ui';
import { useMe } from './useMe';
import { useAdminHubCounts } from './AdminTabs';

export function AdminShortcut() {
  const { isAdmin } = useMe();
  return isAdmin ? <AdminShortcutButton /> : null;
}

function AdminShortcutButton() {
  const t = useTheme();
  const router = useRouter();
  const counts = useAdminHubCounts();
  const attention = counts ? attentionTotal(counts) : 0;

  return (
    <Pressable
      onPress={() => router.push('/admin_home')}
      style={[styles.btn, { backgroundColor: t.surface, borderColor: t.border }]}
      accessibilityRole="button"
      accessibilityLabel={attention > 0 ? `Noot Admin, ${attention} need a look` : 'Noot Admin'}
    >
      <Ic name="shield" size={19} color={t.accent} strokeWidth={1.8} />
      {attention > 0 ? (
        <View style={[styles.badge, { backgroundColor: t.accent, borderColor: t.surface }]}>
          <Text style={styles.badgeText}>{attention > 9 ? '9+' : attention}</Text>
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
