import React, { useState } from 'react';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@noot/ui';
import { isValidDob, toIsoDate } from './age';
import { useThemePref } from './themePref';

interface DateOfBirthPickerProps {
  value: string | null;
  onChange: (iso: string) => void;
}

const MINIMUM_DATE = new Date(1900, 0, 1);
const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
};

function dateFromIso(value: string | null): Date | null {
  if (!value || !isValidDob(value)) return null;
  const parts = value.split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function initialPickerDate(): Date {
  return new Date(new Date().getFullYear() - 18, 0, 1);
}

function fieldRadius(fieldRadius: string): number {
  const radius = Number.parseInt(fieldRadius, 10);
  return Number.isFinite(radius) ? Math.min(radius, 999) : 12;
}

export function DateOfBirthPicker({ value, onChange }: DateOfBirthPickerProps) {
  const t = useTheme();
  const { dark } = useThemePref();
  const insets = useSafeAreaInsets();
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(initialPickerDate);
  const selectedDate = dateFromIso(value);
  const formattedDate = selectedDate?.toLocaleDateString(undefined, DATE_OPTIONS);

  const openPicker = () => {
    const current = selectedDate ?? initialPickerDate();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate: MINIMUM_DATE,
        maximumDate: new Date(),
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(toIsoDate(date));
        },
      });
      return;
    }
    setDraft(current);
    setIosOpen(true);
  };

  const closePicker = () => setIosOpen(false);
  const savePicker = () => {
    onChange(toIsoDate(draft));
    closePicker();
  };

  const radius = fieldRadius(t.fieldRadius);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Date of birth"
        accessibilityValue={{ text: formattedDate ?? 'not set' }}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.control,
          {
            backgroundColor: t.surface,
            borderColor: pressed ? t.accent : t.borderStrong,
            borderRadius: radius,
          },
        ]}
      >
        <Text style={[styles.value, { color: formattedDate ? t.text : t.text3 }]}>
          {formattedDate ?? 'Select your date of birth'}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="slide" onRequestClose={closePicker}>
          <View style={styles.modalRoot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss date picker"
              onPress={closePicker}
              style={styles.backdrop}
            />
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: t.surface,
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" onPress={closePicker} style={styles.actionButton}>
                  <Text style={[styles.cancel, { color: t.text2 }]}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={savePicker} style={styles.actionButton}>
                  <Text style={[styles.done, { color: t.accent }]}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                mode="date"
                display="spinner"
                value={draft}
                minimumDate={MINIMUM_DATE}
                maximumDate={new Date()}
                themeVariant={dark ? 'dark' : 'light'}
                onChange={(_, date) => {
                  if (date) setDraft(date);
                }}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  control: {
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
  },
  value: { flex: 1, flexWrap: 'wrap', fontSize: 16 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButton: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  cancel: { fontSize: 16, fontWeight: '600' },
  done: { fontSize: 16, fontWeight: '700', textAlign: 'right' },
});
