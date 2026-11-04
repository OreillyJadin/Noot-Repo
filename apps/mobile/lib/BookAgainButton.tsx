import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@noot/ui';
import { api } from '@noot/core';
import { useApp } from './store';
import { toTutor } from './data';
import { bookAgainDraft } from './bookAgain';
import { errText } from './errText';

export function BookAgainButton({ tutorId, course, durationMinutes, label = 'Book again' }: {
  tutorId: string;
  course: string;
  durationMinutes: number;
  label?: string;
}) {
  const router = useRouter();
  const { setBooking } = useApp();
  const [loading, setLoading] = useState(false);
  const bookAgain = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const current = await api.tutors.getForBooking(tutorId);
      if (!current) {
        Alert.alert('Tutor unavailable', 'This tutor is no longer available to book. Please find another tutor.');
        return;
      }
      const plan = bookAgainDraft(toTutor(current), course, durationMinutes);
      setBooking(plan.draft);
      void api.analytics.track('booking_started', { tutorId, courseCode: course, source: 'book_again' });
      router.push(plan.route);
    } catch (error) {
      Alert.alert('Couldn’t open booking', errText(error, 'Please try again.'));
    } finally {
      setLoading(false);
    }
  };
  return <Button label={loading ? 'Loading…' : label} kind="primary" size="sm" full disabled={loading} onPress={bookAgain} />;
}
