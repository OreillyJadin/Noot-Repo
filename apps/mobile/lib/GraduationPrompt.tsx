import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View, Text } from 'react-native';
import { usePathname } from 'expo-router';
import { Button, Field, H2, useTheme } from '@noot/ui';
import { api, currentAcademicYear, graduationPromptDue, validGraduationYear } from '@noot/core';
import { useMe } from './useMe';

const ROOTS = new Set(['/home', '/tutor_home', '/ambassador_home', '/admin_home', '/profile', '/tutor_profile']);

export function GraduationPrompt() {
  const { me, refresh } = useMe();
  const path = usePathname();
  const [dismissedKey, setDismissedKey] = useState('');
  const key = `${me?.id}:${me?.expectedGraduationYear}`;
  return me && me.status === 'active' && ROOTS.has(path) && graduationPromptDue(me) && dismissedKey !== key
    ? <Prompt key={key} expectedYear={me.expectedGraduationYear!} refresh={refresh} onDismiss={() => setDismissedKey(key)} /> : null;
}

function Prompt({ expectedYear, refresh, onDismiss }: { expectedYear: number; refresh: () => Promise<void>; onDismiss: () => void }) {
  const t = useTheme();
  const [updating, setUpdating] = useState(false);
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const answer = async (graduated: boolean) => {
    if (saving) return;
    const nextYear = Number(year);
    if (!graduated && (!validGraduationYear(nextYear) || nextYear < currentAcademicYear())) {
      setError('Enter this year or a later expected graduation year.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.profile.respondToGraduation(graduated, graduated ? null : nextYear);
      await refresh();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!saving) onDismiss(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ backgroundColor: t.surface, borderRadius: 20, padding: 24, gap: 16 }}>
          <H2>{updating ? 'When do you expect to graduate?' : 'Have you graduated?'}</H2>
          <Text style={{ color: t.text2 }}>You expected to graduate in {expectedYear}. Graduates get Post Grad status and can still tutor.</Text>
          {updating ? <Field label="New expected graduation year" value={year} onChangeText={(v) => setYear(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={4} /> : null}
          {error ? <Text accessibilityRole="alert" style={{ color: t.text }}>{error}</Text> : null}
          {updating ? <>
            <Button label={saving ? 'Saving…' : 'Save graduation year'} onPress={() => void answer(false)} disabled={saving} full />
            <Button label="Back" kind="secondary" onPress={() => { setUpdating(false); setError(''); }} disabled={saving} full />
          </> : <>
            <Button label={saving ? 'Saving…' : 'Yes, I graduated'} onPress={() => void answer(true)} disabled={saving} full />
            <Button label="Not yet — update expected year" kind="secondary" onPress={() => setUpdating(true)} disabled={saving} full />
            <Button label="Ask me later" kind="ghost" onPress={onDismiss} disabled={saving} full />
          </>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
