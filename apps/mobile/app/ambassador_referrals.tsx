// Ambassador → Referrals tab. Shows the ambassador's unique referral code + link and a
// native share sheet. The code is generated server-side (api.ambassador.ensureProfile →
// create_my_ambassador_profile DB fn) so it's unique and never client-chosen.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Share, StyleSheet, type ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, TabBar, Card, Ic, H1, Sub, Eyebrow, Skeleton, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { useTabNav } from '../lib/useTabNav';

function referralLink(code: string): string {
  return `https://trynoot.com/join?ref=${encodeURIComponent(code)}`;
}

export default function AmbassadorReferrals() {
  const t = useTheme();
  const { role } = useApp();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef });

  useEffect(() => {
    let alive = true;
    api.ambassador
      .ensureProfile()
      .then((c) => { if (alive) setCode(c); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const share = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Join me on noot — verified peer tutoring at UA. Sign up with my code ${code}: ${referralLink(code)}`,
      });
    } catch {
      /* user dismissed the sheet */
    }
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <H1 style={{ fontSize: 26 }}>Refer & earn</H1>
        <Sub style={{ marginTop: 4 }}>Earn $5 for every classmate who completes their first paid session.</Sub>
      </View>

      <Body ref={scrollRef} pad={20} contentStyle={{ paddingTop: 6 }}>
        <Card style={{ padding: 20, alignItems: 'center' }}>
          <Eyebrow style={{ color: t.text3 }}>Your referral code</Eyebrow>
          {loading ? (
            <Skeleton width={180} height={34} />
          ) : (
            // One line that shrinks to fit: at 30pt with tracking, "NOOT-XXXXXX" ran off
            // narrower phones (tracker A1). Selectable, so a long-press copies it.
            <Text
              selectable
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              accessibilityLabel={code ? `Your referral code, ${code.split('').join(' ')}` : undefined}
              style={[styles.code, { color: t.accent }]}
            >
              {code ?? '—'}
            </Text>
          )}
          <Text selectable style={[styles.link, { color: t.text3 }]} numberOfLines={1} ellipsizeMode="middle">
            {code ? referralLink(code) : ''}
          </Text>
          <Pressable
            onPress={share}
            disabled={!code}
            style={[styles.shareBtn, { backgroundColor: code ? t.accent : t.surface2 }]}
          >
            <Ic name="link" size={18} color={code ? t.onAccent : t.text3} strokeWidth={1.9} />
            <Text style={[styles.shareLabel, { color: code ? t.onAccent : t.text3 }]}>Share your link</Text>
          </Pressable>
        </Card>

        <Card flat style={{ ...styles.how, backgroundColor: t.surfaceAlt }}>
          <Eyebrow style={{ color: t.text3, marginBottom: 12 }}>How it works</Eyebrow>
          {[
            ['user', 'They sign up with your code'],
            ['cap', 'They complete their first paid session'],
            ['dollar', 'You earn $5 once they complete their first paid session'],
          ].map(([ic, label], i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.stepIcon, { backgroundColor: t.accentWeak }]}>
                <Ic name={ic as never} size={16} color={t.accent} strokeWidth={1.8} />
              </View>
              <Text style={[styles.stepText, { color: t.text2 }]}>{label}</Text>
            </View>
          ))}
        </Card>
      </Body>

      <TabBar active={active} onTab={onTab} role={role} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  code: { fontSize: 30, fontWeight: '700', letterSpacing: 1, marginTop: 8, alignSelf: 'stretch', textAlign: 'center' },
  link: { fontSize: 12.5, marginTop: 8 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, height: 48, borderRadius: 14, alignSelf: 'stretch' },
  shareLabel: { fontSize: 15, fontWeight: '700' },
  how: { marginTop: 12, padding: 16 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  stepIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontSize: 14 },
});
