// Web: the browser's own date input, styled like the native field. Same props as
// lib/DateOfBirthPicker.tsx, which keeps @react-native-community/datetimepicker (native
// only) out of the web bundle.
import React from 'react';
import { useTheme } from '@noot/ui';
import { isValidDob, toIsoDate } from './age';
import { useThemePref } from './themePref';

interface DateOfBirthPickerProps {
  value: string | null;
  onChange: (iso: string) => void;
}

function fieldRadius(fieldRadius: string): number {
  const radius = Number.parseInt(fieldRadius, 10);
  return Number.isFinite(radius) ? Math.min(radius, 999) : 12;
}

export function DateOfBirthPicker({ value, onChange }: DateOfBirthPickerProps) {
  const t = useTheme();
  const { dark } = useThemePref();
  return (
    <input
      type="date"
      aria-label="Date of birth"
      min="1900-01-01"
      max={toIsoDate(new Date())}
      value={value && isValidDob(value) ? value : ''}
      onChange={(e) => {
        if (isValidDob(e.target.value)) onChange(e.target.value);
      }}
      style={{
        minHeight: 50,
        boxSizing: 'border-box',
        width: '100%',
        padding: '8px 14px',
        fontSize: 16,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: value ? t.text : t.text3,
        backgroundColor: t.surface,
        border: `1.5px solid ${t.borderStrong}`,
        borderRadius: fieldRadius(t.fieldRadius),
        colorScheme: dark ? 'dark' : 'light',
        outlineColor: t.accent,
      }}
    />
  );
}
