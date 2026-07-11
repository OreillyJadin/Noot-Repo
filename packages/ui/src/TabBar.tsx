// TabBar — role-aware bottom nav, ported from app/kit.jsx. `active` is a route key.
// The prototype used the gecko mark for Home + a lizard-in-magnifier for Search;
// here Home uses the 🦎 mark (brand image port is TODO) and Search uses the icon.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';
import { Ic, type IconName } from './Icon';

type Tab = { label: string; icon: IconName | 'home'; key: string };

const STUDENT: Tab[] = [
  { label: 'Home', icon: 'home', key: 'home' },
  { label: 'Search', icon: 'search', key: 'student_home' },
  { label: 'Sessions', icon: 'cal', key: 'sessions' },
  { label: 'Profile', icon: 'user', key: 'profile' },
];
const TUTOR: Tab[] = [
  { label: 'Home', icon: 'home', key: 'tutor_home' },
  { label: 'Calendar', icon: 'cal', key: 'tutor_calendar' },
  { label: 'Sessions', icon: 'list', key: 'tutor_sessions' },
  { label: 'Profile', icon: 'user', key: 'tutor_profile' },
];
const AMBASSADOR: Tab[] = [
  { label: 'Home', icon: 'home', key: 'ambassador_home' },
  { label: 'Referrals', icon: 'gift', key: 'ambassador_referrals' },
  { label: 'Profile', icon: 'user', key: 'profile' },
];

export interface TabBarProps {
  active: string;
  onTab: (key: string) => void;
  role?: 'student' | 'tutor' | 'ambassador';
}

const TAB_SETS: Record<'student' | 'tutor' | 'ambassador', Tab[]> = {
  student: STUDENT,
  tutor: TUTOR,
  ambassador: AMBASSADOR,
};

export function TabBar({ active, onTab, role = 'student' }: TabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabs = TAB_SETS[role] ?? STUDENT;
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 8, backgroundColor: t.surface, borderTopColor: t.border }]}>
      {tabs.map((tab) => {
        const on = active === tab.key;
        const color = on ? t.accent : t.text3;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTab(tab.key)}
            style={styles.tab}
            // Active tab stays focusable and pressable (never disabled) — pressing
            // it again scrolls to top / soft-resets the page, so we advertise that.
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            accessibilityHint={on ? 'Scroll to top and reset this page' : `Go to ${tab.label}`}
          >
            {tab.icon === 'home' ? (
              <Text style={{ fontSize: 20, opacity: on ? 1 : 0.5 }}>🦎</Text>
            ) : (
              <Ic name={tab.icon} size={23} color={color} strokeWidth={on ? 2.1 : 1.7} />
            )}
            <Text style={[styles.label, { color, fontWeight: on ? '700' : '500' }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingTop: 8, paddingHorizontal: 8, borderTopWidth: 1 },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  label: { fontSize: 10 },
});
