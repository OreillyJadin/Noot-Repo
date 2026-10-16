// Notification center — the signed-in user's in-app feed (0014). Lists notifications
// newest-first, styles unread ones, marks everything read on open (clears the bell
// badge), and routes to the relevant screen on tap. Rows are created by DB triggers.
// Above the feed sits the phone's own notification permission (ERR-031): asked for here,
// with the reason in view, rather than by a cold system prompt at launch.
import React, { useEffect, useState } from 'react';
import { View, Text, AppState, StyleSheet, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Button, Card, Chip, Ic, EmptyState, Skeleton, useTheme, type IconName } from '@noot/ui';
import { api, REMINDER_CHOICES, type Notification } from '@noot/core';
import { useApp } from '../lib/store';
import { openNotification } from '../lib/openNotification';
import { askForPush, getPushState, openPushSettings } from '../lib/push';
import type { PushState } from '../lib/pushState';
import { errText } from '../lib/errText';

const ICON: Record<Notification['type'], IconName> = { message: 'chat', booking: 'cal', system: 'bell' };
const REMINDER_LABEL: Record<number, string> = {
  5: '5 min', 10: '10 min', 15: '15 min', 30: '30 min',
  60: '1 hr', 120: '2 hr', 1440: '1 day',
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : `${Math.floor(d / 7)}w ago`;
}

/**
 * Whether these notifications also reach the phone. Never asked → explain, then the system
 * prompt. Refused → only the Settings app can change it, so link there. Allowed → a quiet
 * line with the same link. Re-read whenever the app comes back to the front, which is when
 * someone returns from Settings.
 */
function PushPermission() {
  const t = useTheme();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const read = () => { getPushState().then((s) => { if (active) setState(s); }).catch(() => {}); };
    read();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') read(); });
    return () => { active = false; sub.remove(); };
  }, []);

  if (state === null || state === 'unavailable') return null;

  if (state === 'on') {
    return (
      <Text style={[styles.pushOn, { color: t.text3, marginBottom: 12 }]}>
        Notifications are allowed on this phone.{' '}
        <Text onPress={() => { void openPushSettings(); }} style={{ color: t.accent, fontWeight: '600' }}>
          Manage in Settings
        </Text>
      </Text>
    );
  }

  const blocked = state === 'blocked';
  return (
    <Card style={{ gap: 10, marginBottom: 12, backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
      <Text style={[styles.pushTitle, { color: t.text }]}>
        {blocked ? 'Notifications are off for noot' : 'Turn on notifications'}
      </Text>
      <Text style={[styles.pushBody, { color: t.text2 }]}>
        {blocked
          ? 'Turn them on in Settings to hear about new messages and other updates when noot is closed.'
          : 'Hear about new messages and other updates when noot is closed. Everything still shows up here either way.'}
      </Text>
      <Button
        label={blocked ? 'Open Settings' : busy ? 'Asking…' : 'Allow notifications'}
        size="sm"
        disabled={busy}
        onPress={async () => {
          if (blocked) { void openPushSettings(); return; }
          setBusy(true);
          try { setState(await askForPush()); } finally { setBusy(false); }
        }}
      />
    </Card>
  );
}

export default function Notifications() {
  const t = useTheme();
  const router = useRouter();
  const { role, setRole, patchBooking } = useApp();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [reminderSettings, setReminderSettings] = useState<{ minutesBefore: number[]; morningOf: boolean } | null>(null);
  const [savingReminders, setSavingReminders] = useState(false);
  const [tooManyReminders, setTooManyReminders] = useState(false);

  useEffect(() => {
    let active = true;
    api.notifications
      .list()
      .then((list) => {
        if (!active) return;
        setItems(list);
        // Opening the center marks everything seen — clears the bell badge next time.
        api.notifications.markAllRead().catch(() => {});
      })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    api.notifications.getReminderSettings()
      .then((settings) => { if (active) setReminderSettings(settings); })
      .catch((e) => { if (active) Alert.alert("Couldn't load reminders", errText(e, 'Please try again.')); });
    return () => { active = false; };
  }, []);

  const saveReminderSettings = async (next: { minutesBefore: number[]; morningOf: boolean }) => {
    if (!reminderSettings || savingReminders) return;
    const previous = reminderSettings;
    setReminderSettings(next);
    setSavingReminders(true);
    setTooManyReminders(false);
    try {
      await api.notifications.setReminderSettings(next);
    } catch (e) {
      setReminderSettings(previous);
      Alert.alert("Couldn't save reminders", errText(e, 'Please try again.'));
    } finally {
      setSavingReminders(false);
    }
  };

  const toggleReminder = (minutes: number) => {
    if (!reminderSettings || savingReminders) return;
    const selected = reminderSettings.minutesBefore.includes(minutes);
    if (!selected && reminderSettings.minutesBefore.length >= 4) {
      setTooManyReminders(true);
      return;
    }
    void saveReminderSettings({
      ...reminderSettings,
      minutesBefore: selected
        ? reminderSettings.minutesBefore.filter((m) => m !== minutes)
        : [...reminderSettings.minutesBefore, minutes],
    });
  };

  const open = (n: Notification) =>
    void openNotification(
      n,
      { router, currentRole: role, setRole, patchBooking },
      { fromPush: false },
    );

  return (
    <Screen>
      <NavTop title="Notifications" onBack={() => router.back()} />
      <Body pad={16}>
        <PushPermission />
        <Card style={styles.reminderCard}>
          <Text style={[styles.reminderTitle, { color: t.text }]}>Session reminders</Text>
          <Text style={[styles.reminderSub, { color: t.text3 }]}>
            Before each session you have, as a student or a tutor.
          </Text>
          {reminderSettings ? (
            <>
              <View style={styles.morningRow}>
                <Text style={[styles.morningLabel, { color: t.text }]}>Morning of (7 AM)</Text>
                <Switch
                  value={reminderSettings.morningOf}
                  disabled={savingReminders}
                  onValueChange={(morningOf) => void saveReminderSettings({ ...reminderSettings, morningOf })}
                  trackColor={{ false: t.borderStrong, true: t.accent }}
                  accessibilityRole="switch"
                  accessibilityLabel="Morning of (7 AM)"
                />
              </View>
              <View style={styles.reminderChoices}>
                {REMINDER_CHOICES.map((minutes) => (
                  <Chip
                    key={minutes}
                    label={REMINDER_LABEL[minutes]!}
                    on={reminderSettings.minutesBefore.includes(minutes)}
                    onPress={() => toggleReminder(minutes)}
                  />
                ))}
              </View>
              {tooManyReminders ? (
                <Text style={[styles.reminderNote, { color: t.text3 }]}>Up to 4 reminders.</Text>
              ) : !reminderSettings.morningOf && reminderSettings.minutesBefore.length === 0 ? (
                <Text style={[styles.reminderNote, { color: t.text3 }]}>Reminders are off.</Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.reminderNote, { color: t.text3 }]}>Loading reminders…</Text>
          )}
        </Card>
        {items === null ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={72} radius={14} />
            <Skeleton height={72} radius={14} />
            <Skeleton height={72} radius={14} />
          </View>
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title="No notifications yet" subtitle="Messages and new bookings will show up here." />
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((n) => {
              const unread = !n.readAt;
              return (
                <Card key={n.id} onPress={() => open(n)} style={styles.row}>
                  <View style={[styles.iconBox, { backgroundColor: unread ? t.accentWeak : t.surface2 }]}>
                    <Ic name={ICON[n.type]} size={18} color={unread ? t.accent : t.text3} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.title, { color: t.text, fontWeight: unread ? '700' : '600' }]} numberOfLines={1}>
                        {n.title}
                      </Text>
                      {unread ? <View style={[styles.dot, { backgroundColor: t.accent }]} /> : null}
                    </View>
                    {n.body ? (
                      <Text style={[styles.body, { color: t.text3 }]} numberOfLines={2}>
                        {n.body}
                      </Text>
                    ) : null}
                    <Text style={[styles.time, { color: t.text3 }]}>{timeAgo(n.createdAt)}</Text>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  reminderCard: { gap: 12, marginBottom: 12 },
  reminderTitle: { fontSize: 16, fontWeight: '700' },
  reminderSub: { fontSize: 13, lineHeight: 18 },
  morningRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  morningLabel: { fontSize: 14, fontWeight: '600' },
  reminderChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderNote: { fontSize: 12.5 },
  iconBox: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  time: { fontSize: 12, marginTop: 4 },
  pushTitle: { fontSize: 15, fontWeight: '700' },
  pushBody: { fontSize: 13.5, lineHeight: 19 },
  pushOn: { fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
});
