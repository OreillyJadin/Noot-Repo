// TabBar — role-aware bottom nav, ported from app/kit.jsx. `active` is a route key.
// The prototype used the gecko mark for Home + a lizard-in-magnifier for Search;
// here Home uses the gecko brand image (GeckoMark) and Search uses the icon.
import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';
import { TEXT_CAPS } from './textScale';
import { Ic, type IconName } from './Icon';
import { GeckoMark } from './Gecko';
import { TabPressScale } from './TabPressScale';

type Tab = { label: string; icon: IconName | 'home'; key: string };

const STUDENT: Tab[] = [
  { label: 'Home', icon: 'home', key: 'home' },
  { label: 'Search', icon: 'search', key: 'student_home' },
  { label: 'Sessions', icon: 'cal', key: 'sessions' },
  { label: 'Chats', icon: 'chat', key: 'chats' },
  { label: 'Profile', icon: 'user', key: 'profile' },
];
const TUTOR: Tab[] = [
  { label: 'Home', icon: 'home', key: 'tutor_home' },
  { label: 'Calendar', icon: 'cal', key: 'tutor_calendar' },
  { label: 'Sessions', icon: 'list', key: 'tutor_sessions' },
  { label: 'Chats', icon: 'chat', key: 'chats' },
  { label: 'Profile', icon: 'user', key: 'tutor_profile' },
];
const AMBASSADOR: Tab[] = [
  { label: 'Home', icon: 'home', key: 'ambassador_home' },
  { label: 'Referrals', icon: 'gift', key: 'ambassador_referrals' },
  { label: 'Profile', icon: 'user', key: 'profile' },
];
const ADMIN: Tab[] = [
  { label: 'Hub', icon: 'shield', key: 'admin_home' },
  { label: 'Calendar', icon: 'cal', key: 'admin_calendar' },
  { label: 'Users', icon: 'user', key: 'admin_users' },
];

export interface TabBarProps {
  active: string;
  onTab: (key: string) => void;
  role?: 'student' | 'tutor' | 'ambassador' | 'admin';
}

const TAB_SETS: Record<'student' | 'tutor' | 'ambassador' | 'admin', Tab[]> = {
  student: STUDENT,
  tutor: TUTOR,
  ambassador: AMBASSADOR,
  admin: ADMIN,
};

// Laptop layout (web, wide window): the bottom bar becomes a side nav next to a centered
// content column. Phone-width web and native keep the bottom bar unchanged.
const WIDE_MIN_WIDTH = 900;
const CONTENT_MAX_WIDTH = 760;

export function useWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_MIN_WIDTH;
}

// Each mounted TabBar publishes its props; the side nav shows the newest one. Stack screens
// stay mounted under the ones pushed on top, so going back restores the previous entry.
type NavEntry = { id: number; props: TabBarProps };
let entries: NavEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const current = () => entries[entries.length - 1]?.props ?? null;

function usePublishTabBar(props: TabBarProps, enabled: boolean) {
  const id = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    id.current = nextId++;
    entries = [...entries, { id: id.current, props }];
    emit();
    return () => {
      entries = entries.filter((e) => e.id !== id.current);
      emit();
    };
    // Mount/unmount only; prop changes are applied below without reordering.
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const entry = entries.find((e) => e.id === id.current);
    if (entry && (entry.props.active !== props.active || entry.props.onTab !== props.onTab || entry.props.role !== props.role)) {
      entries = entries.map((e) => (e.id === id.current ? { id: e.id, props } : e));
      emit();
    }
  });
}

export function TabBar(props: TabBarProps) {
  const { active, onTab, role = 'student' } = props;
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWideLayout();
  usePublishTabBar(props, wide);
  if (wide) return null;
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
            {({ pressed }) => (
              <>
                <TabPressScale pressed={pressed}>
                  {tab.icon === 'home' ? (
                    <GeckoMark size={44} style={{ margin: -10, opacity: on ? 1 : 0.55 }} />
                  ) : (
                    <Ic name={tab.icon} size={24} color={color} strokeWidth={on ? 2.1 : 1.7} />
                  )}
                </TabPressScale>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  maxFontSizeMultiplier={TEXT_CAPS.tabLabel}
                  style={[styles.label, { color, fontWeight: on ? '600' : '500' }]}
                >
                  {tab.label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wide web only: side nav (for screens with a TabBar) + centered column. Otherwise a pass-through. */
export function WideShell({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const wide = useWideLayout();
  if (!wide) return <>{children}</>;
  return (
    <View style={[styles.shell, { backgroundColor: t.bg }]}>
      <SideNav />
      <View style={styles.column}>
        <View style={[styles.columnInner, { borderColor: t.border }]}>{children}</View>
      </View>
    </View>
  );
}

function SideNav() {
  const t = useTheme();
  const nav = useSyncExternalStore(subscribe, current, current);
  if (!nav) return null;
  const tabs = TAB_SETS[nav.role ?? 'student'] ?? STUDENT;
  return (
    <View style={[styles.side, { backgroundColor: t.surface, borderRightColor: t.border }]} role="navigation">
      <View style={styles.sideBrand}>
        <GeckoMark size={40} />
        <Text style={[styles.sideBrandText, { color: t.text, fontFamily: t.headingFont }]}>noot</Text>
      </View>
      {tabs.map((tab) => {
        const on = nav.active === tab.key;
        const color = on ? t.accent : t.text2;
        return (
          <Pressable
            key={tab.key}
            onPress={() => nav.onTab(tab.key)}
            accessibilityRole="link"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            style={({ pressed }) => [
              styles.sideItem,
              on ? { backgroundColor: t.accentWeak } : pressed ? { backgroundColor: t.bg } : null,
            ]}
          >
            {tab.icon === 'home' ? (
              <GeckoMark size={34} style={{ margin: -5, opacity: on ? 1 : 0.6 }} />
            ) : (
              <Ic name={tab.icon} size={22} color={color} strokeWidth={on ? 2.1 : 1.7} />
            )}
            <Text style={[styles.sideLabel, { color, fontWeight: on ? '700' : '500' }]}>{tab.label}</Text>
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
  shell: { flex: 1, flexDirection: 'row' },
  column: { flex: 1, alignItems: 'center' },
  columnInner: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH, borderLeftWidth: 1, borderRightWidth: 1 },
  side: { width: 232, paddingHorizontal: 14, paddingTop: 20, gap: 4, borderRightWidth: 1 },
  sideBrand: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 18 },
  sideBrandText: { fontSize: 22, letterSpacing: -0.5 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 12, minHeight: 46, borderRadius: 12 },
  sideLabel: { fontSize: 16 },
});
