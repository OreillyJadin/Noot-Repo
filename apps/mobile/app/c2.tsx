// C2 · Student Rates Tutor — ported from screens-completion.jsx (C2).
// 1–5 stars, an optional public review (500 char cap), and a "did this happen
// as expected?" toggle that surfaces a dispute warning when answered "No".
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, Field, Avatar, Ic, useTheme } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from '../lib/store';
import { TUTORS } from '../lib/data';

const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
const REVIEW_MAX = 500;

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

export default function C2() {
  const t = useTheme();
  const router = useRouter();
  const { booking } = useApp();
  const tutor = booking.tutor ?? TUTORS[0]!;
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [happened, setHappened] = useState<Happened>(null);
  const [submitting, setSubmitting] = useState(false);
  const ready = rating > 0 && happened != null;

  const submit = async () => {
    if (!ready || submitting) return;
    // Dev-launcher / no real booking: keep the original navigation-only demo behavior.
    if (!booking.bookingId) {
      router.push('/c4?role=student');
      return;
    }
    setSubmitting(true);
    try {
      await api.reviews.submit({
        bookingId: booking.bookingId,
        rating,
        comment: review || undefined,
        happened: happened === 'yes',
      });
      router.push('/c4?role=student');
    } catch (e) {
      Alert.alert('Couldn’t submit rating', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <NavTop title="Rate your session" onBack={() => router.back()} />
      <Body pad={20}>
        <View style={styles.header}>
          <Avatar size={72} />
          <Text style={[styles.h2, { color: t.text }]}>{tutor.name}</Text>
          <Text style={[styles.headerMeta, { color: t.text3 }]}>{booking.course || 'MGT 300'} · {tutor.year}</Text>
        </View>

        <View style={{ marginTop: 24, marginBottom: 8 }}>
          <StarRating value={rating} onChange={setRating} />
          <Text style={[styles.ratingWord, { color: rating ? t.accent : t.text3 }]}>
            {RATING_WORDS[rating] || 'Tap to rate'}
          </Text>
        </View>

        <Text style={[styles.label, { color: t.text2 }]}>Add a review · optional</Text>
        <Field
          multiline
          value={review}
          onChangeText={(v) => setReview(v.slice(0, REVIEW_MAX))}
          placeholder={`What stood out about your session with ${tutor.name.split(' ')[0]}?`}
          hint={`${review.length} / ${REVIEW_MAX}`}
        />

        <Card flat style={{ marginTop: 16, padding: 16, backgroundColor: t.surfaceAlt }}>
          <Text style={[styles.happenedTitle, { color: t.text }]}>Did this session happen as expected?</Text>
          <HappenedToggle value={happened} onChange={setHappened} />
          {happened === 'no' ? (
            <View style={[styles.warnBox, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}>
              <Ic name="alert" size={17} color={t.accent} strokeWidth={1.9} />
              <Text style={[styles.warnText, { color: t.text2 }]}>
                We&apos;ll open a dispute and pause the payout while our team reviews. Your card won&apos;t be charged until it&apos;s resolved.
              </Text>
            </View>
          ) : null}
        </Card>
      </Body>
      <ActionBar>
        <Button
          label={happened === 'no' ? 'Submit & open dispute' : 'Submit rating'}
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
  toggleRow: { flexDirection: 'row', gap: 10 },
  happenedTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  warnBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  warnText: { flex: 1, fontSize: 13, lineHeight: 19 },
});
