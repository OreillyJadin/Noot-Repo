// Select — inline expanding option list, ported from app/kit.jsx (<Select>).
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import { parseRadius } from './_util';
import { Ic } from './Icon';

export interface SelectProps {
  label?: string;
  value?: string;
  options: string[];
  placeholder?: string;
  onChange?: (v: string) => void;
}

export function Select({ label, value, options, placeholder = 'Select…', onChange }: SelectProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const radius = parseRadius(t.fieldRadius);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: t.text2 }]}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={[styles.control, { backgroundColor: t.surface, borderColor: open ? t.accent : t.borderStrong, borderRadius: radius }]}
      >
        <Text style={[styles.value, { color: value ? t.text : t.text3 }]}>{value || placeholder}</Text>
        <Ic name="chevdown" size={18} color={t.text3} />
      </Pressable>
      {open ? (
        <View style={[styles.menu, { backgroundColor: t.surface, borderColor: t.borderStrong, borderRadius: radius }]}>
          {options.map((o, i) => {
            const on = o === value;
            return (
              <Pressable
                key={o}
                onPress={() => {
                  onChange?.(o);
                  setOpen(false);
                }}
                style={[
                  styles.option,
                  { backgroundColor: on ? t.accentWeak : 'transparent', borderTopColor: t.border, borderTopWidth: i ? 1 : 0 },
                ]}
              >
                <Text style={{ color: on ? t.accent : t.text, fontWeight: on ? '600' : '500', fontSize: 15 }}>{o}</Text>
                {on ? <Ic name="check" size={16} color={t.accent} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, alignSelf: 'stretch' },
  label: { fontSize: 12, fontWeight: '600' },
  control: { minHeight: 50, borderWidth: 1.5, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { flex: 1, fontSize: 16 },
  menu: { marginTop: 6, borderWidth: 1.5, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13 },
});
