import React from 'react';
import { Text } from 'react-native';
import { Field, useTheme } from '@noot/ui';
import { validateExpectedGraduationYear } from './profileValidation';

export function GraduationYearField({ year, value, onChange }: { year: string; value: string; onChange: (value: string) => void }) {
  const t = useTheme();
  if (year === 'Post Grad') return <Text style={{ color: t.text2 }}>Post Grads can still book sessions and tutor.</Text>;
  return <>
    <Field label="Expected graduation year (optional)" value={value} onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={4} placeholder="2028" />
    <Text style={{ color: t.text2 }}>
      {validateExpectedGraduationYear(value, year) ?? 'Private. After this year, we’ll ask whether you graduated.'}
    </Text>
  </>;
}
