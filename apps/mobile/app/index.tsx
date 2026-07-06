// O1 Landing — ported from screens-shared.jsx (Landing). Navigates to Sign Up.
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Card, useTheme } from '@noot/ui';

const POPULAR: [string, number][] = [
  ['MGT 300', 18], ['CH 101', 24], ['MATH 125', 31], ['BSC 114', 12], ['EC 110', 15],
];

export default function Landing() {
  const t = useTheme();
  const router = useRouter();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.wordmark, { color: t.text }]}>noot</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Log In" kind="ghost" onPress={() => router.push('/signup?mode=login')} />
          <Button label="Sign Up" onPress={() => router.push('/signup?mode=signup')} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.hero, { backgroundColor: t.accent }]}>
          <Text style={[styles.badge, { color: t.onAccent, borderColor: t.onAccent }]}>.EDU VERIFIED</Text>
          <Text style={[styles.heroTitle, { color: t.onAccent }]}>Peer tutoring.{'\n'}Built for campus life.</Text>
          <Text style={[styles.heroSub, { color: t.onAccent }]}>
            Same classes, same professors, same syllabus — from students who already aced them.
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <Button label="Sign up with .edu email" onPress={() => router.push('/signup?mode=signup')} />
          <Button label="I already have an account" kind="secondary" onPress={() => router.push('/signup?mode=login')} />
        </View>

        <Text style={[styles.h2, { color: t.text }]}>Popular on campus</Text>
        <View style={styles.courseRow}>
          {POPULAR.map(([code, n]) => (
            <Card key={code} style={styles.courseCard} onPress={() => router.push('/signup')}>
              <Text style={[styles.courseCode, { color: t.text }]}>{code}</Text>
              <Text style={[styles.courseTutors, { color: t.accent }]}>{n} tutors</Text>
            </Card>
          ))}
        </View>

        <Card style={{ backgroundColor: t.surfaceAlt, marginTop: 16 }}>
          <Text style={{ color: t.text2, fontSize: 13 }}>312 active tutors · 28 departments · all grade-verified.</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  wordmark: { fontSize: 22, fontWeight: '700', letterSpacing: -1 },
  body: { padding: 20, gap: 16 },
  hero: { borderRadius: 20, padding: 22, gap: 10 },
  badge: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', letterSpacing: 1, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, opacity: 0.9 },
  heroTitle: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  heroSub: { fontSize: 14, lineHeight: 20, opacity: 0.92, maxWidth: 300 },
  h2: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  courseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  courseCard: { width: 110, alignSelf: 'auto' },
  courseCode: { fontSize: 16, fontWeight: '700' },
  courseTutors: { fontSize: 13, fontWeight: '600', marginTop: 6 },
});
