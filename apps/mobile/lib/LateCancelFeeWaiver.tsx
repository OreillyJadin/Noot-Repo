import React from 'react';
import { View, Text, Switch } from 'react-native';
import { Card, useTheme } from '@noot/ui';

export function LateCancelFeeWaiver({ feePercent, waived, onChange }: {
  feePercent: number;
  waived: boolean;
  onChange: (value: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Card flat style={{ marginTop: 16, padding: 16, backgroundColor: t.surfaceAlt }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: t.text }}>Waive late-cancel fee</Text>
        <Switch accessibilityLabel="Waive late-cancel fee" value={waived} onValueChange={onChange} trackColor={{ false: t.borderStrong, true: t.accent }} />
      </View>
      <Text style={{ marginTop: 8, fontSize: 12, color: t.text2, lineHeight: 18 }}>
        Moving this session keeps the {feePercent}% cancellation fee unless you waive it. Later cancellation may still cost more if the new time is close.
      </Text>
    </Card>
  );
}
