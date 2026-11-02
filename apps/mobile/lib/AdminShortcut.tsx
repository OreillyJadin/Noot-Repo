import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { attentionTotal } from '@noot/core';
import { Ic, useTheme } from '@noot/ui';
import { useAdminHubCounts } from './AdminTabs';
import { useRoleSwitch } from './useRoleSwitch';

export function AdminShortcut({ color, ringColor }: { color?: string; ringColor?: string } = {}) {
  const { isAdmin, openAdmin } = useRoleSwitch();
  return isAdmin ? <AdminShortcutButton openAdmin={openAdmin} color={color} ringColor={ringColor} /> : null;
}

function AdminShortcutButton({ openAdmin, color, ringColor }: { openAdmin: () => void; color?: string; ringColor?: string }) {
  const t = useTheme();
  const counts = useAdminHubCounts();
  const attention = counts ? attentionTotal(counts) : 0;

  return (
    <Pressable
      onPress={openAdmin}
      style={[styles.btn, { backgroundColor: color ? 'transparent' : t.surface, borderColor: color ?? t.border }]}
      accessibilityRole="button"
      accessibilityLabel={attention > 0 ? `Noot Admin, ${attention} need a look` : 'Noot Admin'}
    >
      <Ic name="shield" size={19} color={color ?? t.accent} strokeWidth={1.8} />
      {attention > 0 ? (
        <View style={[styles.badge, { backgroundColor: t.accent, borderColor: ringColor ?? t.surface }]}>
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
