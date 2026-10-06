// Field — labeled text input, ported from app/kit.jsx (<Field>). Controlled;
// supports prefix/suffix adornments, multiline, and a hint line.
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, type KeyboardTypeOptions } from 'react-native';
import { useTheme } from './ThemeProvider';
import { parseRadius } from './_util';

export interface FieldProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (v: string) => void;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
  multiline?: boolean;
  maxLength?: number;
  /** A code sent by email or text: lets the keyboard offer it for one-tap entry. */
  oneTimeCode?: boolean;
  hint?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export function Field({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize = 'none',
  secureTextEntry,
  multiline,
  maxLength,
  oneTimeCode,
  hint,
  prefix,
  suffix,
}: FieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: t.text2 }]}>{label}</Text> : null}
      <View
        style={[
          styles.box,
          {
            backgroundColor: t.surface,
            borderColor: focused ? t.accent : t.borderStrong,
            borderRadius: parseRadius(t.fieldRadius),
            alignItems: multiline ? 'flex-start' : 'center',
            paddingVertical: multiline ? 12 : 0,
            minHeight: multiline ? 88 : 50,
            // Past this the text scrolls inside the box. The page only makes room for the
            // keyboard when it appears, not as a box grows, so an unbounded one walks its
            // last lines under the keyboard as you type.
            maxHeight: multiline ? 180 : undefined,
          },
        ]}
      >
        {prefix}
        <TextInput
          placeholder={placeholder}
          placeholderTextColor={t.text3}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry}
          multiline={multiline}
          maxLength={maxLength}
          textContentType={oneTimeCode ? 'oneTimeCode' : undefined}
          autoComplete={oneTimeCode ? 'one-time-code' : undefined}
          style={[styles.input, { color: t.text }]}
        />
        {suffix}
      </View>
      {hint ? <Text style={[styles.hint, { color: t.text3 }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, alignSelf: 'stretch' },
  label: { fontSize: 12, fontWeight: '600' },
  box: { flexDirection: 'row', gap: 8, borderWidth: 1.5, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  hint: { fontSize: 12, lineHeight: 17 },
});
