// B2 Tutor Profile — ported from design_handoff_noot_app/app/screens-booking.jsx (B2).
// Shows the tutor selected in B1 (booking.tutor); if opened without one it renders
// <NoSession/> instead of a fake tutor. "Book a session" carries the tutor
// (+ chosen course) forward into B3.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, NavTop, Body, ActionBar, Button, Card, Avatar, H1, H2, Sub, Ic, ListSection, ListRow, useTheme } from '@noot/ui';
import { api, type ReviewSummary } from '@noot/core';
import { useApp } from '../lib/store';
import { NoSession } from '../lib/NoSession';
import { VERIFIED_EXPLAINER } from '../lib/VerifiedBadge';
import { GraduatedCap } from '../lib/GraduatedCap';
import { reportReview } from '../lib/moderation';

export default function B2() {
  const { booking } = useApp();
  if (!booking.tutor) return <NoSession />;
  return <B2Inner />;
}

function B2Inner() {
  const t = useTheme();
  const router = useRouter();
  const { booking, patchBooking } = useApp();
  // preview=1 → the tutor is viewing their OWN public profile from "Edit tutor
  // profile". Same layout students see, but the booking/save actions are hidden.
  const { preview, source } = useLocalSearchParams<{ preview?: string; source?: string }>();
  const isPreview = preview === '1';
  const tutor = booking.tutor!;
  const [reviewState, setReviewState] = useState<{ tutorId: string; rows: ReviewSummary[]; error: boolean } | null>(null);
  const reviewsLoading = reviewState?.tutorId !== tutor.id;
  const reviews = !reviewsLoading ? reviewState.rows : [];
  const reviewError = !reviewsLoading && reviewState.error;
  useEffect(() => {
    let active = true;
    api.reviews.listForTutor(tutor.id).then((rows) => {
      if (active) setReviewState({ tutorId: tutor.id, rows, error: false });
    }).catch(() => {
      if (active) setReviewState({ tutorId: tutor.id, rows: [], error: true });
    });
    return () => { active = false; };
  }, [tutor.id]);
  const minRate = Math.min(...tutor.courses.map((c) => c[2]));
  const activeCourse = booking.course ?? tutor.courses[0]?.[0] ?? '';
  useEffect(() => {
    if (!isPreview) void api.analytics.track('tutor_profile_viewed', { tutorId: tutor.id, source: (source ?? 'direct').slice(0, 40) });
  }, [tutor.id, isPreview, source]);

  const book = (courseCode?: string) => {
    if (isPreview) return; // read-only self-preview — can't book yourself
    patchBooking({ tutor, course: courseCode ?? activeCourse });
    void api.analytics.track('booking_started', { tutorId: tutor.id, courseCode: courseCode ?? activeCourse });
    router.push('/b3');
  };

  const save = async () => {
    try {
      await api.tutors.save(tutor.id);
      Alert.alert('Saved to your list');
    } catch {
      Alert.alert('Sign in to save tutors');
    }
  };

  return (
    <Screen>
      <NavTop
        title={isPreview ? 'Profile preview' : ''}
        onBack={() => router.back()}
        trailing={
          isPreview ? undefined : (
            <Pressable onPress={save} style={[styles.bookmarkBtn, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Ic name="bookmark" size={17} color={t.text2} strokeWidth={1.8} />
            </Pressable>
          )
        }
      />

      <Body pad={20} contentStyle={{ paddingTop: 0 }}>
        <View style={styles.header}>
          <Avatar size={92} uri={tutor.avatarUrl} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 }}>
            <H1 style={{ fontSize: 24, flexShrink: 1 }}>{tutor.name}</H1>
            <GraduatedCap year={tutor.year} size={23} />
          </View>
          <Text style={{ fontSize: 14, color: t.text3, marginTop: 3 }}>
            {tutor.year} · {tutor.major}
          </Text>
          <View style={styles.headerStats}>
            <Text style={{ fontSize: 14, color: t.text2 }}>
              {tutor.sessions} sessions completed
            </Text>
            {tutor.verified ? (
              <Pressable
                onPress={() => Alert.alert('Verified tutor', VERIFIED_EXPLAINER)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Verified tutor. Tap for what this means."
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ic name="check" size={14} color={t.good} strokeWidth={2.6} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.good }}>Verified</Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Section title="About">
          <Sub style={{ fontSize: 14 }}>{tutor.bio}</Sub>
        </Section>

        <Section title="Courses & rates">
          <ListSection>
            {tutor.courses.map(([code, grade, rate, sess, currentlyTaking]) => {
              const sub = [
                currentlyTaking
                  ? 'Currently taking'
                  : grade
                    ? (tutor.verified ? `Grade ${grade} · verified` : `Grade ${grade} · self-reported`)
                    : null,
                `${sess} sessions`,
              ].filter(Boolean).join(' · ');
              return (
                <ListRow
                  key={code}
                  title={code}
                  subtitle={sub}
                  trailing={<Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>${rate}/hr</Text>}
                  accessibilityLabel={[code, sub, `$${rate} per hour`].filter(Boolean).join(', ')}
                  onPress={() => book(code)}
                />
              );
            })}
          </ListSection>
        </Section>

        <Section title="Reviews">
          {reviewsLoading ? <Sub>Loading reviews…</Sub> : reviewError ? <Sub>Reviews couldn’t be loaded. Please try again later.</Sub> : reviews.length === 0 ? <Sub>No published reviews yet.</Sub> : (
            <View>
              {reviews.map((review) => (
                <View key={review.id} style={{ paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <Text style={{ color: t.text, fontWeight: '600', flex: 1 }}>{review.reviewerName || 'Student'} · {review.rating}/5</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Report this review" hitSlop={8} onPress={() => void reportReview(review.id)} style={{ paddingVertical: 6 }}>
                      <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>Report</Text>
                    </Pressable>
                  </View>
                  {review.comment ? <Text style={{ color: t.text2, fontSize: 14, lineHeight: 21 }}>{review.comment}</Text> : null}
                  <Text style={{ color: t.text3, fontSize: 12 }}>{new Date(review.createdAt).toLocaleDateString()}</Text>
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* Says only what's true for THIS tutor: "confirmed against transcripts" was shown
            for everyone, verified or not (T6). */}
        <Section title={tutor.verified ? 'Verified by noot' : 'Reviewed by noot'}>
          <Card style={styles.verifiedCard}>
            <Ic name="shield" size={18} color={tutor.verified ? t.good : t.text3} strokeWidth={1.8} />
            <Text style={{ flex: 1, fontSize: 13, color: t.text2, lineHeight: 19.5 }}>
              {tutor.verified
                ? VERIFIED_EXPLAINER
                : 'A noot team member approved this tutor’s profile. Their grades haven’t been verified against a transcript yet.'}{' '}
              Session quality is monitored by our team — flag any concern and we&apos;ll review it directly.
            </Text>
          </Card>
        </Section>
      </Body>

      <ActionBar>
        {isPreview ? (
          <Button label="Done" kind="primary" full onPress={() => router.back()} />
        ) : (
          <>
            <View style={{ flexShrink: 0 }}>
              <Text style={{ fontSize: 12, color: t.text3 }}>From</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: t.text }}>
                ${minRate}
                <Text style={{ fontSize: 12, color: t.text3, fontWeight: '500' }}>/hr</Text>
              </Text>
            </View>
            <Button label="Book a session" kind="primary" iconRight="chevron" style={{ flex: 1 }} onPress={() => book(activeCourse)} />
          </>
        )}
      </ActionBar>
    </Screen>
  );
}

// ── local helpers (used only by this screen) ───────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 24 }}>
      <H2 style={{ fontSize: 18, marginBottom: 12 }}>{title}</H2>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bookmarkBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: { alignItems: 'center' },
  headerStats: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  verifiedCard: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14 },
});
