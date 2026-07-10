// EmptyState — one shared "nothing here yet" block so every list/screen renders the
// same way when it has no data (new-user case), instead of each screen inventing its
// own one-off copy. Icon + title + optional subtitle + optional action button.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Ic, type IconName } from './Icon';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = 'search', title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Ic name={icon} size={26} color={t.text3} strokeWidth={1.6} />
      </View>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.sub, { color: t.text3 }]}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} kind="secondary" size="sm" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  sub: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  action: { marginTop: 10 },
});
