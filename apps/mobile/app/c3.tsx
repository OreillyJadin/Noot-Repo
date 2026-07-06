// C3 · Tutor Rates Student — ported from screens-completion.jsx (C3).
// Mirrors C2's controls, but the written note is private (tutors + noot team
// only, never shown to students).
import React, { useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, Field, Avatar, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';

const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
const REVIEW_MAX = 500;
const STUDENT = { name: 'Lindsay Thomas', first: 'Lindsay' };

// Interactive 1–5 star rating. Defined locally (not shared) per porting guide.
function StarRating({ value, onChange, size = 40 }: { value: number; onChange: (n: number) => void; size?: number }) {
  const t = useTheme();
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <Pressable key={n} onPress={() => onChange(n)} hitSlop={4} style={styles.starTap}>
            <Ic name="star" size={size} color={on ? t.accent : t.borderStrong} strokeWidth={1.6} fill={on ? t.accent : 'none'} />
          </Pressable>
        );
      })}
    </View>
  );
}

type Happened = 'yes' | 'no' | null;

// Yes / No "did this happen as expected?" control. Defined locally per screen.
function HappenedToggle({ value, onChange }: { value: Happened; onChange: (v: 'yes' | 'no') => void }) {
  const t = useTheme();
  const options: Array<['yes' | 'no', string, 'check' | 'alert']> = [
    ['yes', 'Yes', 'check'],
    ['no', 'No', 'alert'],
  ];
  return (
    <View style={styles.toggleRow}>
      {options.map(([v, l, ic]) => {
        const on = value === v;
        const danger = v === 'no';
        const color = on ? (danger ? t.accent : t.good) : t.text;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              height: 50,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: on ? (danger ? t.accent : t.good) : t.borderStrong,
              backgroundColor: on ? (danger ? t.accentWeak : t.goodWeak) : t.surface,
            }}
          >
            <Ic name={ic} size={18} color={color} strokeWidth={2} />
            <Text style={{ fontSize: 15, fontWeight: '600', color }}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function C3() {
  const t = useTheme();
  const router = useRouter();
  const { booking } = useApp();
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [happened, setHappened] = useState<Happened>(null);
  const [submitting, setSubmitting] = useState(false);
  const ready = rating > 0 && happened != null;

  const submit = async () => {
    if (!ready || submitting) return;
    // Reached via the dev launcher without a real booking → keep demo behavior.
    if (!booking.bookingId) {
      router.push('/c4?role=tutor');
      return;
    }
    setSubmitting(true);
    try {
      await api.reviews.submit({
        bookingId: booking.bookingId,
        rating,
        comment: review.trim() || undefined,
        happened: happened === 'yes',
      });
      router.push('/c4?role=tutor');
    } catch {
      Alert.alert('Could not submit rating', 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <NavTop title="Rate your student" onBack={() => router.back()} />
      <Body pad={20}>
        <View style={styles.header}>
          <Avatar size={72} label={STUDENT.first[0]} />
          <Text style={[styles.h2, { color: t.text }]}>{STUDENT.name}</Text>
          <Text style={[styles.headerMeta, { color: t.text3 }]}>{booking.course || 'MGT 300'}</Text>
        </View>

        <View style={{ marginTop: 24, marginBottom: 8 }}>
          <StarRating value={rating} onChange={setRating} />
          <Text style={[styles.ratingWord, { color: rating ? t.accent : t.text3 }]}>
            {RATING_WORDS[rating] || 'Tap to rate'}
          </Text>
        </View>

        <Text style={[styles.label, { color: t.text2 }]}>Private notes · optional</Text>
        <Field
          multiline
          value={review}
          onChangeText={(v) => setReview(v.slice(0, REVIEW_MAX))}
          placeholder="Punctual? Prepared? Anything other tutors should know…"
          hint={`${review.length} / ${REVIEW_MAX}`}
        />
        <View style={styles.privacyRow}>
          <Ic name="lock" size={14} color={t.text3} strokeWidth={1.8} />
          <Text style={[styles.privacyText, { color: t.text3 }]}>
            Never shown to students — visible only to other tutors and the noot team.
          </Text>
        </View>

        <Card flat style={{ marginTop: 16, padding: 16, backgroundColor: t.surfaceAlt }}>
          <Text style={[styles.happenedTitle, { color: t.text }]}>Did this session happen as expected?</Text>
          <HappenedToggle value={happened} onChange={setHappened} />
          {happened === 'no' ? (
            <View style={[styles.warnBox, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
              <Ic name="alert" size={17} color={t.accent} strokeWidth={1.9} />
              <Text style={[styles.warnText, { color: t.text2 }]}>
                We&apos;ll open a dispute and hold the payout while our team reviews what happened.
              </Text>
            </View>
          ) : null}
        </Card>
      </Body>
      <ActionBar>
        <Button
          label={happened === 'no' ? 'Submit & report issue' : 'Submit rating'}
          kind="primary"
          full
          disabled={!ready || submitting}
          onPress={submit}
        />
      </ActionBar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center' },
  h2: { fontSize: 19, fontWeight: '700', marginTop: 12 },
  headerMeta: { fontSize: 13, marginTop: 2 },
  stars: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  starTap: { padding: 2 },
  ratingWord: { textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 12, height: 18 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8, paddingHorizontal: 2 },
  privacyText: { flex: 1, fontSize: 12, lineHeight: 17 },
  toggleRow: { flexDirection: 'row', gap: 10 },
  happenedTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  warnBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  warnText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
