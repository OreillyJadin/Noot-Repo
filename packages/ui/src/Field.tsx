// Field — labeled text input, ported from app/kit.jsx (<Field>). Controlled.
import React from 'react';
import { View, Text, TextInput, StyleSheet, type KeyboardTypeOptions } from 'react-native';
import { useTheme } from './ThemeProvider';

export interface FieldProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (v: string) => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
}

function parseRadius(px: string): number {
  const n = parseInt(px, 10);
  return Number.isFinite(n) ? Math.min(n, 999) : 12;
}

export function Field({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize = 'none',
  secureTextEntry,
}: FieldProps) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: t.text2 }]}>{label}</Text> : null}
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={t.text3}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        style={[
          styles.input,
          {
            color: t.text,
            backgroundColor: t.surface,
            borderColor: t.border,
            borderRadius: parseRadius(t.fieldRadius),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, alignSelf: 'stretch' },
  label: { fontSize: 13, fontWeight: '600' },
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
});
