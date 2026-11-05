// O1 Landing — ported from screens-shared.jsx (Landing). Navigates to Sign Up.
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, ListSection, ListRow, WordmarkImage, useTheme, useLargeText, TEXT_CAPS } from '@noot/ui';

const COURSES = ['MGT 300', 'CH 101', 'MATH 125', 'BSC 114', 'EC 110'];

export default function Landing() {
  const t = useTheme();
  const router = useRouter();
  const large = useLargeText();
  // At large text the header scrolls with the page instead of pinning a third of the screen.
  const header = (
    <View style={[styles.header, large && styles.headerInline]}>
      <WordmarkImage size={22} color={t.text} />
      <View style={styles.headerActions}>
        <Button label="Log In" kind="ghost" onPress={() => router.push('/signin')} />
        <Button label="Sign Up" onPress={() => router.push('/signup')} />
      </View>
    </View>
  );
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      {large ? null : header}
      <ScrollView contentContainerStyle={styles.body}>
        {large ? header : null}
        <View style={[styles.hero, { backgroundColor: t.accent }]}>
          <Text style={[styles.badge, { color: t.onAccent, borderColor: t.onAccent }]}>.edu verified</Text>
          <Text maxFontSizeMultiplier={TEXT_CAPS.screenTitle} style={[styles.heroTitle, { color: t.onAccent, fontFamily: t.headingFont }, large && styles.heroTitleLarge]}>Peer tutoring.{'\n'}Built for campus life.</Text>
          <Text style={[styles.heroSub, { color: t.onAccent }]}>
            Same classes, same professors, same syllabus — from students who already aced them.
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <Button label="Sign up with .edu email" onPress={() => router.push('/signup')} />
          <Button label="I already have an account" kind="secondary" onPress={() => router.push('/signin')} />
        </View>

        <ListSection label="Courses on campus">
          {COURSES.map((code) => (
            <ListRow key={code} title={code} subtitle="Find a tutor" onPress={() => router.push('/signup')} />
          ))}
        </ListSection>

        <Text style={{ color: t.text3, fontSize: 13, textAlign: 'center', marginTop: 16 }}>
          Peer tutors at UA · grade-verified tutors marked ✓.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  headerInline: { paddingHorizontal: 0, paddingVertical: 0 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, flexShrink: 1 },
  body: { padding: 20, gap: 16 },
  hero: { borderRadius: 20, padding: 22, gap: 10 },
  badge: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, opacity: 0.9 },
  heroTitle: { fontSize: 28, lineHeight: 34 },
  // A fixed lineHeight scales with the full font scale but the capped title doesn't, so drop it.
  heroTitleLarge: { lineHeight: undefined },
  heroSub: { fontSize: 14, lineHeight: 20, opacity: 0.92, maxWidth: 300 },
});
