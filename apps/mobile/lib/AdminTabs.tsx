import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { api, type AdminHubCounts } from '@noot/core';
import { useTheme } from '@noot/ui';

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

  return (
    <View style={[styles.track, { backgroundColor: t.surface2 }]}>
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
            style={[styles.tab, selected ? { backgroundColor: t.surface } : null]}
          >
            <Text numberOfLines={1} style={[styles.label, { color: selected ? t.text : t.text2 }]}>
              {tab.label}
            </Text>
            {tab.count && tab.count > 0 ? (
              <View style={[styles.count, { backgroundColor: t.accentWeak }]}>
                <Text style={[styles.countText, { color: t.accent }]}>{tab.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 3, marginBottom: 14 },
  tab: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 9, paddingHorizontal: 3, paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  count: { minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 10, fontWeight: '700' },
});
