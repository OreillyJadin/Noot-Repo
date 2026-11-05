// Web: react-native-web's Alert.alert does nothing, so every error message and confirm
// dialog in the app would silently vanish. This takes Alert.alert over and shows the same
// title, message and buttons in a modal, in call order. Mounted once in app/_layout.
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View, type AlertButton, type AlertOptions } from 'react-native';
import { useTheme } from '@noot/ui';

interface Pending {
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
}

const queue: Pending[] = [];
let notify: (() => void) | null = null;

Alert.alert = (title, message, buttons, options) => {
  queue.push({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }], options });
  notify?.();
};

export function WebAlertHost() {
  const t = useTheme();
  const [current, setCurrent] = useState<Pending | null>(null);
  useEffect(() => {
    notify = () => setCurrent((c) => c ?? queue.shift() ?? null);
    notify();
    return () => { notify = null; };
  }, []);
  if (!current) return null;

  const close = (button?: AlertButton) => {
    setCurrent(queue.shift() ?? null);
    button?.onPress?.();
  };
  const dismiss = () => {
    if (!current.options?.cancelable && !current.buttons.some((b) => b.style === 'cancel')) return;
    const cancel = current.buttons.find((b) => b.style === 'cancel');
    setCurrent(queue.shift() ?? null);
    if (cancel) cancel.onPress?.();
    else current.options?.onDismiss?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.root}>
        <Pressable accessibilityLabel="Dismiss" style={styles.backdrop} onPress={dismiss} />
        <View accessibilityRole="alert" style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.title, { color: t.text }]}>{current.title}</Text>
          {current.message ? <Text style={[styles.message, { color: t.text2 }]}>{current.message}</Text> : null}
          <View style={styles.actions}>
            {current.buttons.map((b, i) => (
              <Pressable
                key={`${b.text ?? ''}-${i}`}
                accessibilityRole="button"
                onPress={() => close(b)}
                style={({ pressed }) => [styles.button, pressed ? { backgroundColor: t.bg } : null]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    { color: b.style === 'destructive' ? t.danger : b.style === 'cancel' ? t.text2 : t.accent },
                    b.style === 'cancel' ? null : styles.buttonStrong,
                  ]}
                >
                  {b.text ?? 'OK'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  card: { width: '100%', maxWidth: 400, borderRadius: 16, padding: 20, gap: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  message: { fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4, marginTop: 8 },
  button: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  buttonStrong: { fontWeight: '700' },
});
