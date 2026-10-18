import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Ic, useTheme, TEXT_CAPS } from '@noot/ui';
import { api, auth } from '@noot/core';
import { useApp } from '../lib/store';
import { routeAfterAuth, ACCOUNT_UNAVAILABLE } from '../lib/postAuth';
import { GUIDELINES, GUIDELINES_VERSION, splitGuidelineBody } from '../lib/guidelines';
import { openLegal } from '../lib/legal';
import { forgetThisDevice } from '../lib/push';

export default function CommunityGuidelines() {
  const t = useTheme();
  const router = useRouter();
  const { setRole } = useApp();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleContinue = async () => {
    if (!accepted) { setError('Please agree to the Community Guidelines to continue.'); return; }
    setBusy(true); setError(null);
    try {
      if (!saved) {
        try {
          await api.profile.acceptGuidelines(GUIDELINES_VERSION);
          setSaved(true);
        } catch {
          setError("Couldn't record your agreement. Please tap again.");
          return;
        }
      }
      if (!(await routeAfterAuth(router, setRole)).ok) setError(ACCOUNT_UNAVAILABLE);
    } catch {
      setError(ACCOUNT_UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    if (busy || leaving) return;
    setLeaving(true);
    await forgetThisDevice();
    try { await auth.signOut(); } catch { /* leave regardless */ }
    router.replace('/');
  };

  const renderParagraph = (paragraph: string, sectionTitle: string, key: string) => {
    const termsIndex = sectionTitle === '' ? paragraph.indexOf('Terms of Use') : -1;
    return (
      <Text key={key} style={[styles.bodyText, { color: t.text2 }]}>
        {termsIndex < 0 ? paragraph : (
          <>
            {paragraph.slice(0, termsIndex)}
            <Text onPress={() => openLegal('terms')} style={{ color: t.accent, fontWeight: '600' }}>
              Terms of Use
            </Text>
            {paragraph.slice(termsIndex + 'Terms of Use'.length)}
          </>
        )}
      </Text>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text maxFontSizeMultiplier={TEXT_CAPS.screenTitle} style={[styles.h1, { color: t.text }]}>Community Guidelines</Text>
        <Text style={[styles.sub, { color: t.text2 }]}>
          The promises every noot student makes. Read them, then agree to finish signing up.
        </Text>

        {GUIDELINES.map((section, sectionIndex) => {
          const { before, after } = splitGuidelineBody(section);
          return (
            <View key={`${section.title}-${sectionIndex}`} style={styles.section}>
              {section.title ? <Text style={[styles.sectionTitle, { color: t.text }]}>{section.title}</Text> : null}
              {before.map((paragraph, index) =>
                renderParagraph(paragraph, section.title, `${sectionIndex}-before-${index}`))}
              {section.bullets ? (
                <View style={styles.bullets}>
                  {section.bullets.map((bullet, index) => (
                    <View key={`${sectionIndex}-bullet-${index}`} style={styles.bulletRow}>
                      <Text style={[styles.bulletMark, { color: t.text2 }]}>•</Text>
                      <Text style={[styles.bodyText, styles.bulletText, { color: t.text2 }]}>{bullet}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {after.map((paragraph, index) =>
                renderParagraph(paragraph, section.title, `${sectionIndex}-after-${index}`))}
            </View>
          );
        })}

        <Pressable
          onPress={() => { setAccepted((value) => !value); if (error) setError(null); }}
          style={styles.agreementRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          accessibilityLabel="I've read the noot Community Guidelines and agree to follow them."
        >
          <View
            style={[
              styles.box,
              { backgroundColor: accepted ? t.accent : 'transparent', borderColor: accepted ? t.accent : t.borderStrong },
            ]}
          >
            {accepted ? <Ic name="check" size={13} color={t.onAccent} strokeWidth={3} /> : null}
          </View>
          <Text style={[styles.agreementText, { color: t.text2 }]}>
            I&apos;ve read the noot Community Guidelines and agree to follow them.
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label={busy ? 'Saving…' : 'Agree & finish'} disabled={busy || leaving || !accepted} onPress={handleContinue} />
        <Text onPress={signOut} accessibilityRole="button" style={[styles.link, { color: t.text3 }]}>
          Not now — sign out
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 18, paddingTop: 32, paddingBottom: 28 },
  h1: { fontSize: 26, fontWeight: '700' },
  sub: { fontSize: 15, lineHeight: 21 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  bodyText: { fontSize: 14, lineHeight: 21 },
  bullets: { gap: 8 },
  bulletRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  bulletMark: { fontSize: 14, lineHeight: 21 },
  bulletText: { flex: 1 },
  agreementRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 4 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  agreementText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  error: { color: '#C0392B', fontSize: 14 },
  link: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 6 },
});
