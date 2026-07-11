// Role switcher + "Viewing as" indicator for the multi-role experience. A user can hold
// student / tutor / ambassador simultaneously; these are pure presentational components —
// the screen wires onSelect to persist active_role and swap the home. Admin is NOT a mode
// and never appears here (it's a separate gated entry point).
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';

export type SwitchableRole = 'student' | 'tutor' | 'ambassador';

const LABELS: Record<SwitchableRole, string> = {
  student: 'Student',
  tutor: 'Tutor',
  ambassador: 'Ambassador',
};

const ORDER: SwitchableRole[] = ['student', 'tutor', 'ambassador'];

export interface RoleSwitcherProps {
  /** The roles the user actually holds (admin is ignored if present). */
  roles: string[];
  active: SwitchableRole;
  onSelect: (role: SwitchableRole) => void;
}

/** Segmented control of the user's switchable roles. Renders null if they hold <2. */
export function RoleSwitcher({ roles, active, onSelect }: RoleSwitcherProps) {
  const t = useTheme();
  const shown = ORDER.filter((r) => roles.includes(r));
  if (shown.length < 2) return null;
  return (
    <View style={[styles.switcher, { backgroundColor: t.surface2 }]}>
      {shown.map((r) => {
        const on = r === active;
        return (
          <Pressable
            key={r}
            onPress={() => !on && onSelect(r)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`View as ${LABELS[r]}`}
            style={[styles.seg, on && { backgroundColor: t.surface }, on && styles.segOn]}
          >
            <Text style={[styles.segLabel, { color: on ? t.text : t.text3, fontWeight: on ? '700' : '600' }]}>
              {LABELS[r]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small pill for a home header: "Viewing as Tutor". */
export function ViewingAs({ role }: { role: SwitchableRole }) {
  const t = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
      <Text style={[styles.pillText, { color: t.accent }]}>Viewing as {LABELS[role]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  segOn: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segLabel: { fontSize: 13.5 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 11.5, fontWeight: '700' },
});
