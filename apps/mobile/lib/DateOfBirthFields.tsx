import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Field } from '@noot/ui';

interface DateOfBirthFieldsProps {
  month: string;
  day: string;
  year: string;
  onChangeMonth: (value: string) => void;
  onChangeDay: (value: string) => void;
  onChangeYear: (value: string) => void;
}

export function DateOfBirthFields({
  month,
  day,
  year,
  onChangeMonth,
  onChangeDay,
  onChangeYear,
}: DateOfBirthFieldsProps) {
  const digits = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);
  return (
    <View style={styles.row}>
      <View style={styles.shortField}>
        <Field label="MM" placeholder="MM" value={month} onChangeText={(value) => onChangeMonth(digits(value, 2))} keyboardType="number-pad" maxLength={2} />
      </View>
      <View style={styles.shortField}>
        <Field label="DD" placeholder="DD" value={day} onChangeText={(value) => onChangeDay(digits(value, 2))} keyboardType="number-pad" maxLength={2} />
      </View>
      <View style={styles.yearField}>
        <Field label="YYYY" placeholder="YYYY" value={year} onChangeText={(value) => onChangeYear(digits(value, 4))} keyboardType="number-pad" maxLength={4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortField: { flexGrow: 1, flexBasis: 72, minWidth: 72 },
  yearField: { flexGrow: 1.5, flexBasis: 110, minWidth: 110 },
});
