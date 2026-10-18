import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { api, type AdminHubCounts } from '@noot/core';
import { useLargeText, useTheme } from '@noot/ui';

export interface AdminTab {
  key: string;
  label: string;
  count?: number;
  href: string;
}

export function tutorTabs(counts?: AdminHubCounts): AdminTab[] {
  return [
    { key: 'applications', label: 'Applications', count: counts?.applications, href: '/admin_tutors?tab=applications' },
    { key: 'interviews', label: 'Interviews', count: counts?.interviews, href: '/admin_tutors?tab=interviews' },
    { key: 'grades', label: 'Grades', count: counts?.gradeChecks, href: '/admin_tutors?tab=grades' },
    { key: 'reviews', label: 'Reviews', count: counts?.reviews, href: '/admin_reviews' },
  ];
}

export function safetyTabs(counts?: AdminHubCounts): AdminTab[] {
  return [
    { key: 'complaints', label: 'Complaints', count: counts?.complaints, href: '/admin_reports' },
    { key: 'disputes', label: 'Disputes', count: counts?.disputes, href: '/admin_bookings?tab=disputes' },
    { key: 'all', label: 'All bookings', href: '/admin_bookings?tab=all' },
  ];
}

export function useAdminHubCounts(enabled = true): AdminHubCounts | undefined {
  const [counts, setCounts] = useState<AdminHubCounts>();

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setCounts(undefined);
        return;
      }
      let alive = true;
      setCounts(undefined);
      api.admin
        .hubCounts()
        .then((value) => { if (alive) setCounts(value); })
        .catch(() => { if (alive) setCounts(undefined); });
      return () => { alive = false; };
    }, [enabled]),
  );

  return enabled ? counts : undefined;
}

export function AdminTabs({ tabs, active }: { tabs: AdminTab[]; active: string }) {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const large = useLargeText();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.track, large && styles.trackLarge, { borderBottomColor: t.border }]}
      contentContainerStyle={styles.tabs}
    >
      {tabs.map((tab) => {
        const selected = tab.key === active;
        const targetPath = tab.href.split('?')[0];
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              if (pathname === targetPath) router.setParams({ tab: tab.key });
              else router.replace(tab.href as never);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.count && tab.count > 0 ? `${tab.label}, ${tab.count}` : tab.label}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[styles.label, { color: selected ? t.text : t.text3 }]}>
              {tab.label}
            </Text>
            {tab.count && tab.count > 0 ? (
              <Text style={[styles.count, { color: t.accent }]}>{tab.count}</Text>
            ) : null}
            <View style={[styles.underline, { backgroundColor: selected ? t.text : 'transparent' }]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  track: { maxHeight: 43, marginBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  trackLarge: { maxHeight: undefined, flexGrow: 0 },
  tabs: { flexDirection: 'row', alignItems: 'stretch', gap: 20 },
  tab: { minHeight: 42, flexDirection: 'row', alignItems: 'flex-start', gap: 4, paddingHorizontal: 2, paddingTop: 8, position: 'relative' },
  pressed: { opacity: 0.65 },
  label: { fontSize: 14, fontWeight: '600' },
  count: { fontSize: 10, lineHeight: 13, fontWeight: '700' },
  underline: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, borderRadius: 1 },
});
