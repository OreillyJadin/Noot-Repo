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
  /**
   * Roles they can look at without holding yet (e.g. Tutor while the application is in
   * review). Shown with a dot to mark them as a preview.
   */
  previewRoles?: string[];
  active: SwitchableRole;
  onSelect: (role: SwitchableRole) => void;
}

/** Segmented control of the modes. Renders null only if there's genuinely nothing to switch. */
export function RoleSwitcher({ roles, previewRoles = [], active, onSelect }: RoleSwitcherProps) {
  const t = useTheme();
  const shown = ORDER.filter((r) => roles.includes(r) || previewRoles.includes(r));
  if (shown.length < 2) return null;
  return (
    <View style={[styles.switcher, { backgroundColor: t.surface2 }]}>
      {shown.map((r) => {
        const on = r === active;
        const preview = !roles.includes(r);
        return (
          <Pressable
            key={r}
            onPress={() => !on && onSelect(r)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={preview ? `Preview the ${LABELS[r]} experience` : `View as ${LABELS[r]}`}
            style={[styles.seg, on && { backgroundColor: t.surface }, on && styles.segOn]}
          >
            <Text style={[styles.segLabel, { color: on ? t.text : t.text3, fontWeight: on ? '700' : '600' }]}>
              {LABELS[r]}
            </Text>
            {preview ? <View style={[styles.previewDot, { backgroundColor: t.text3 }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small pill for a home header: "Viewing as Tutor" / "Tutor preview". */
export function ViewingAs({ role, preview = false }: { role: SwitchableRole; preview?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
      <Text style={[styles.pillText, { color: t.accent }]}>
        {preview ? `${LABELS[role]} preview` : `Viewing as ${LABELS[role]}`}
      </Text>
    </View>
  );
}

export interface PreviewBannerProps {
  role: SwitchableRole;
  /** Label for the call to action, e.g. "Apply to tutor". */
  ctaLabel: string;
  onPress: () => void;
}

/**
 * Shown at the top of a mode the user is only previewing. States plainly that this is a
 * look-around — nothing here is live for them yet — and gives the one action that makes it
 * real, so the preview is never a dead end.
 */
export function PreviewBanner({ role, ctaLabel, onPress }: PreviewBannerProps) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={ctaLabel}
      style={[styles.banner, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: t.text }]}>You&apos;re previewing {LABELS[role]} mode</Text>
        <Text style={[styles.bannerSub, { color: t.text2 }]}>
          This is what it looks like. Nothing here is live until you finish setting it up.
        </Text>
      </View>
      <Text style={[styles.bannerCta, { color: t.accent }]}>{ctaLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14 },
  seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  previewDot: { width: 5, height: 5, borderRadius: 2.5, opacity: 0.7 },
  segOn: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segLabel: { fontSize: 13.5 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 11.5, fontWeight: '700' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14, borderWidth: 1 },
  bannerTitle: { fontSize: 13.5, fontWeight: '700' },
  bannerSub: { fontSize: 12, lineHeight: 16.5, marginTop: 2 },
  bannerCta: { fontSize: 13, fontWeight: '700' },
});
