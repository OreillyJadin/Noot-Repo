// Notification center — the signed-in user's in-app feed (0014). Lists notifications
// newest-first, styles unread ones, marks everything read on open (clears the bell
// badge), and routes to the relevant screen on tap. Rows are created by DB triggers.
// Above the feed sits the phone's own notification permission (ERR-031): asked for here,
// with the reason in view, rather than by a cold system prompt at launch.
import React, { useEffect, useState } from 'react';
import { View, Text, AppState, StyleSheet, Switch, Alert, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Button, Card, Select, ListSection, Ic, EmptyState, Skeleton, useTheme, type IconName } from '@noot/ui';
import { api, REMINDER_CHOICES, type Notification } from '@noot/core';
import { useApp } from '../lib/store';
import { openNotification } from '../lib/openNotification';
import { askForPush, getPushState, openPushSettings } from '../lib/push';
import type { PushState } from '../lib/pushState';
import { errText } from '../lib/errText';
import { DAY_OF_TIMES, masterReminderSettings } from '../lib/reminderSettings';

const ICON: Record<Notification['type'], IconName> = { message: 'chat', booking: 'cal', system: 'bell' };
const REMINDER_LABEL: Record<number, string> = {
  5: '5 min', 10: '10 min', 15: '15 min', 30: '30 min',
  60: '1 hour', 120: '2 hours', 1440: '1 day',
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
    <Card style={{ gap: 10, marginBottom: 12 }}>
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
  const [reminderSettings, setReminderSettings] = useState<Awaited<ReturnType<typeof api.notifications.getReminderSettings>> | null>(null);
  const [rememberedReminders, setRememberedReminders] = useState<typeof reminderSettings>(null);
  const [savingReminders, setSavingReminders] = useState(false);
  const [tooManyReminders, setTooManyReminders] = useState(false);
  const [clearing, setClearing] = useState<string | null>(null);

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

  const saveReminderSettings = async (next: NonNullable<typeof reminderSettings>) => {
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

  const clear = async (id: string) => {
    if (clearing) return;
    setClearing(id);
    try {
      await api.notifications.clear(id);
      setItems((current) => current?.filter((n) => n.id !== id) ?? null);
    } catch (e) {
      Alert.alert("Couldn't clear notification", errText(e, 'Please try again.'));
    } finally {
      setClearing(null);
    }
  };

  const clearAll = () => {
    const through = items?.[0]?.createdAt;
    if (!through || clearing) return;
    Alert.alert(
    'Clear all notifications?',
    'This clears your inbox, including older notifications. Your messages and sessions are not deleted.',
    [
      { text: 'Keep notifications', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: async () => {
        setClearing('all');
        try {
          await api.notifications.clearAll(through);
          setItems([]);
        } catch (e) {
          Alert.alert("Couldn't clear notifications", errText(e, 'Please try again.'));
        } finally {
          setClearing(null);
        }
      } },
    ],
    );
  };

  return (
    <Screen>
      <NavTop title="Notifications" onBack={() => router.back()} />
      <Body pad={16}>
        <PushPermission />
        <Card style={{ gap: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ic name="bell" size={24} color={t.accent} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.pushTitle, { color: t.text }]}>Session reminders</Text>
              <Text style={[styles.reminderSub, { color: t.text2 }]}>Get reminders before your tutoring sessions as a student or tutor.</Text>
            </View>
            <Switch
              accessibilityLabel="Session reminders"
              value={!!reminderSettings && (reminderSettings.morningOf || reminderSettings.minutesBefore.length > 0)}
              disabled={!reminderSettings || savingReminders}
              trackColor={{ false: t.borderStrong, true: t.accent }}
              onValueChange={(enabled) => {
                if (!reminderSettings) return;
                if (!enabled) setRememberedReminders(reminderSettings);
                void saveReminderSettings(masterReminderSettings(reminderSettings, enabled, rememberedReminders));
              }}
            />
          </View>
          {reminderSettings ? (reminderSettings.morningOf || reminderSettings.minutesBefore.length > 0) ? (
            <>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.pushTitle, { color: t.text }]}>Default reminder</Text>
                  <Switch accessibilityLabel="Default day-of reminder" value={reminderSettings.morningOf} disabled={savingReminders}
                    trackColor={{ false: t.borderStrong, true: t.accent }}
                    onValueChange={(morningOf) => void saveReminderSettings({ ...reminderSettings, morningOf })} />
                </View>
                <Text style={[styles.reminderSub, { color: t.text2 }]}>Choose when you want your main reminder for each session.</Text>
                <View style={{ padding: 12, borderRadius: 12, backgroundColor: t.accentWeak, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ic name="bell" size={18} color={t.accent} />
                    <Text style={{ color: t.text }}>Day of session at</Text>
                  </View>
                  <View pointerEvents={savingReminders ? 'none' : 'auto'}>
                    <Select value={DAY_OF_TIMES.find((option) => option.value === reminderSettings.dayOfTime)?.label}
                      options={DAY_OF_TIMES.map((option) => option.label)}
                      onChange={(label) => {
                        const option = DAY_OF_TIMES.find((item) => item.label === label);
                        if (option) void saveReminderSettings({ ...reminderSettings, dayOfTime: option.value });
                      }} />
                  </View>
                </View>
                <Text style={[styles.reminderNote, { color: t.text3 }]}>Central time. Skipped if less than 1 hour before your session.</Text>
              </View>
              <Text style={[styles.pushTitle, { color: t.text }]}>Additional reminders (optional)</Text>
              <Text style={[styles.reminderSub, { color: t.text2 }]}>Get extra reminders before your session, in addition to your default reminder.</Text>
              <View style={styles.reminderChoices}>
                {REMINDER_CHOICES.filter((minutes) => minutes !== 1440 || reminderSettings.minutesBefore.includes(1440)).map((minutes) => {
                  const selected = reminderSettings.minutesBefore.includes(minutes);
                  return (
                    <Pressable key={minutes} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: savingReminders }}
                      accessibilityLabel={REMINDER_LABEL[minutes] + ' before'} disabled={savingReminders}
                      onPress={() => toggleReminder(minutes)}
                      style={{ width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1, borderRadius: 12,
                        borderColor: selected ? t.accent : t.borderStrong, backgroundColor: selected ? t.accentWeak : t.surface }}>
                      <View style={{ width: 20, height: 20, borderWidth: 1, borderColor: selected ? t.accent : t.borderStrong, borderRadius: 4 }}>
                        {selected ? <Ic name="check" size={18} color={t.accent} /> : null}
                      </View>
                      <Text style={{ color: t.text, flex: 1 }}>{REMINDER_LABEL[minutes]} before</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.reminderNote, { color: t.text3 }]}>{tooManyReminders ? 'Up to 4 reminders.' : 'Choose up to 4 additional reminders.'}</Text>
              {reminderSettings.minutesBefore.includes(1440) ? <Text style={[styles.reminderNote, { color: t.text3 }]}>Your saved 1 day reminder is still active. If removed, it cannot be reselected here.</Text> : null}
            </>
          ) : <Text style={[styles.reminderSub, { color: t.text2 }]}>Reminders are off.</Text>
            : <Text style={{ color: t.text2 }}>Loading reminders…</Text>}
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
          <>
            <Button
              label={clearing === 'all' ? 'Clearing…' : 'Clear all'}
              size="sm"
              disabled={clearing !== null}
              onPress={clearAll}
            />
            <ListSection label="Recent">
              {items.map((n) => {
                const unread = !n.readAt;
                return (
                  <View key={n.id} style={styles.row}>
                    <Pressable onPress={() => open(n)} accessibilityRole="button" style={styles.openRow}>
                      <Ic name={ICON[n.type]} size={20} color={unread ? t.accent : t.text3} strokeWidth={1.8} />
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
                    </Pressable>
                    <Pressable
                      onPress={() => void clear(n.id)}
                      disabled={clearing !== null}
                      accessibilityRole="button"
                      accessibilityLabel={`Clear notification: ${n.title}`}
                      accessibilityState={{ disabled: clearing !== null }}
                      style={styles.clearButton}
                    >
                      <Ic name="x" size={18} color={t.text3} />
                    </Pressable>
                  </View>
                );
              })}
            </ListSection>
          </>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  openRow: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  clearButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  reminderRow: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  reminderSub: { fontSize: 13.5, lineHeight: 19 },
  reminderChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reminderNote: { fontSize: 12.5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  time: { fontSize: 12, marginTop: 4 },
  pushTitle: { fontSize: 15, fontWeight: '700' },
  pushBody: { fontSize: 13.5, lineHeight: 19 },
  pushOn: { fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
});
