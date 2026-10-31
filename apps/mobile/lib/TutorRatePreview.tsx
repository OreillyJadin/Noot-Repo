import React from 'react';
import { View, Text, Switch } from 'react-native';
import { useTheme } from '@noot/ui';
import { tutorHourlyEstimate } from '@noot/core';

export function RateViewToggle({ showNet, onChange }: { showNet: boolean; onChange: (value: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ flex: 1, color: t.text, fontSize: 14 }}>Show estimated take-home</Text>
        <Switch value={showNet} onValueChange={onChange} accessibilityLabel="Show estimated take-home" />
      </View>
      <Text style={{ color: t.text3, fontSize: 12, lineHeight: 18 }}>
        You always edit the before-fee rate. Estimates are before taxes; actual payouts depend on session length and refunds.
      </Text>
    </View>
  );
}

export function TutorRatePreview({ rate, gradesVerified, currentlyTaking, showNet }: {
  rate: number;
  gradesVerified: boolean;
  currentlyTaking: boolean;
  showNet: boolean;
}) {
  const t = useTheme();
  const estimate = tutorHourlyEstimate(rate, gradesVerified, currentlyTaking);
  return (
    <Text style={{ color: t.text2, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
      {!estimate
        ? 'Set a valid rate to see your hourly estimate.'
        : showNet
          ? `Estimated take-home: $${estimate.net.toFixed(2)}/hr after the ${estimate.feeRate * 100}% Noot fee${currentlyTaking ? ' (currently taking)' : gradesVerified ? ' (verified)' : ' (unverified)'}.`
          : `Before-fee rate: $${estimate.gross.toFixed(2)}/hr. The student service fee is added at checkout.`}
    </Text>
  );
}
