// B3 Select Session — ported from screens-booking2.jsx (B3).
// Course, day/time, length, a required focus tag, an auto-drafted intro message,
// meeting mode + spot, and repeat cadence. Saves the draft into useApp().booking
// and continues to payment.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Modal, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Screen,
  NavTop,
  Body,
  ActionBar,
  Button,
  Card,
  Badge,
  Avatar,
  Ic,
  Label,
  useTheme,
  type IconName,
} from '@noot/ui';
import { useApp } from '../lib/store';
import { TUTORS, DAYS, slotsFor } from '../lib/data';

const LENGTHS: [number, string][] = [
  [30, '30 min'],
  [60, '1 hr'],
  [90, '1.5 hr'],
  [120, '2 hr'],
];

// Session focus tags (required) + auto-filled intro message templates.
const FOCUS_TAGS: [string, IconName][] = [
  ['General', 'chat'],
  ['Finish HW', 'edit'],
  ['Exam Study', 'cap'],
  ['Resume', 'doc'],
  ['Advising', 'user'],
];

// TODO(api): "Lindsay" is a placeholder for the signed-in student's first name.
function focusMessage(tag: string | null, course: string, me = 'Lindsay'): string {
  switch (tag) {
    case 'Finish HW':
      return `Hey, I'm ${me}! I look forward to going over my homework for ${course} with you.`;
    case 'Exam Study':
      return `Hey, I'm ${me}! I'd love your help preparing for an upcoming ${course} exam — hoping to feel solid on the key topics.`;
    case 'Resume':
      return `Hey, I'm ${me}! I'd like help polishing my resume and getting some feedback. Looking forward to it!`;
    case 'Advising':
      return `Hey, I'm ${me}! I'm looking for some advising and guidance around ${course}. Excited to chat.`;
    default:
      return `Hey, I'm ${me}! Looking forward to working through ${course} with you.`;
  }
}

const IN_PERSON_SPOTS = ['Gorgas Library, Fl 2', 'Bidgood Hall lobby', "Other — I'll suggest"];
const ONLINE = 'Online — Integrated Video';

export default function B3() {
  const t = useTheme();
  const router = useRouter();
  const { booking, patchBooking } = useApp();

  const tutor = booking.tutor ?? TUTORS[0]!;
  const slots = slotsFor(tutor.name.charCodeAt(0) % 5);
  const availableDays = DAYS.filter((d) => slots[d.i] && slots[d.i]!.length);

  const [day, setDay] = useState<number>(booking.dayIndex ?? availableDays[0]?.i ?? 0);
  const [slot, setSlot] = useState<string | null>(booking.slot ?? null);
  const [length, setLength] = useState<number>(booking.lengthMin ?? 60);
  const [course, setCourse] = useState<string>(booking.course ?? tutor.courses[0]![0]);
  const [courseOpen, setCourseOpen] = useState(false);
  const [spotOpen, setSpotOpen] = useState(false);
  const [tag, setTag] = useState<string | null>(booking.tag ?? null);
  const [repeat, setRepeat] = useState<'once' | 'weekly'>(booking.repeat ?? 'once');
  const [msg, setMsg] = useState(booking.message ?? '');
  const [msgEdited, setMsgEdited] = useState(!!booking.message);
  const tutorFirst = tutor.name.split(' ')[0];

  const initOnline = (booking.location ?? '').startsWith('Online');
  const [mode, setMode] = useState<'person' | 'online'>(initOnline ? 'online' : 'person');
  const [spot, setSpot] = useState(initOnline ? IN_PERSON_SPOTS[0]! : booking.location ?? IN_PERSON_SPOTS[0]!);
  const location = mode === 'online' ? ONLINE : spot;

  // Pick a focus -> auto-fill the intro message (unless the student already typed their own).
  const pickTag = (newTag: string) => {
    setTag(newTag);
    if (!msgEdited || msg.trim() === '') {
      setMsg(focusMessage(newTag, course));
      setMsgEdited(false);
    }
  };
  // Keep an un-edited template in sync if the course changes after a tag is picked.
  useEffect(() => {
    if (tag && !msgEdited) setMsg(focusMessage(tag, course));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);

  const rate = (tutor.courses.find((c) => c[0] === course) ?? tutor.courses[0]!)[2];
  const cost = ((rate * length) / 60).toFixed(2).replace(/\.00$/, '');
  const daySlots = slots[day] ?? [];
  const ready = !!slot && !!tag && msg.trim().length > 0;
  const dayObj = DAYS.find((d) => d.i === day) ?? DAYS[0]!;

  const continueToPayment = () => {
    if (!ready) return;
    patchBooking({
      tutor,
      course,
      dayIndex: day,
      slot: slot ?? undefined,
      lengthMin: length,
      location,
      tag: tag ?? undefined,
      repeat,
      message: msg.trim(),
    });
    router.push('/b4');
  };

  return (
    <Screen>
      <NavTop onBack={() => router.back()} title="Book a session" />
      <Body pad={20}>
        <Card flat style={{ ...styles.tutorMini, backgroundColor: t.surfaceAlt }}>
          <Avatar size={42} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.tutorName, { color: t.text }]}>{tutor.name}</Text>
            <Text style={{ fontSize: 13, color: t.text3 }}>
              {tutor.year} · {tutor.major}
            </Text>
          </View>
          <Badge label="✓ Verified" tone="good" />
        </Card>

        <FieldBlock label="Course">
          <Selectable
            onPress={() => setCourseOpen(true)}
            value={course}
            sub={`$${rate}/hr · Grade ${(tutor.courses.find((c) => c[0] === course) ?? tutor.courses[0]!)[1]} verified`}
          />
        </FieldBlock>

        <FieldBlock label="Session focus">
          <View style={styles.wrapRow}>
            {FOCUS_TAGS.map(([label, ic]) => {
              const on = tag === label;
              return (
                <Pressable
                  key={label}
                  onPress={() => pickTag(label)}
                  style={[
                    styles.focusTag,
                    {
                      backgroundColor: on ? t.accent : t.surface,
                      borderColor: on ? t.accent : t.borderStrong,
                    },
                  ]}
                >
                  <Ic name={ic} size={15} color={on ? t.onAccent : t.text3} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: on ? t.onAccent : t.text }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          {!tag ? (
            <Text style={{ fontSize: 12, color: t.text3, marginTop: 9 }}>
              Pick one so {tutorFirst} can prep — we&apos;ll draft your intro message.
            </Text>
          ) : null}
        </FieldBlock>

        <FieldBlock label="Pick a day">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {DAYS.map((d) => {
              const has = !!(slots[d.i] && slots[d.i]!.length);
              const on = day === d.i;
              return (
                <Pressable
                  key={d.i}
                  disabled={!has}
                  onPress={() => {
                    setDay(d.i);
                    setSlot(null);
                  }}
                  style={[
                    styles.dayCell,
                    {
                      backgroundColor: on ? t.accent : t.surface,
                      borderColor: on ? t.accent : t.border,
                      opacity: has ? 1 : 0.4,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: on ? t.onAccent : t.text3 }}>
                    {d.i === 0 ? 'Today' : d.dow}
                  </Text>
                  <Text style={{ fontSize: 19, fontWeight: '700', color: on ? t.onAccent : t.text, marginTop: 2 }}>
                    {d.dom}
                  </Text>
                  <View
                    style={[
                      styles.dayDot,
                      { backgroundColor: has ? (on ? t.onAccent : t.good) : 'transparent' },
                    ]}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        </FieldBlock>

        <FieldBlock label={`Available times · ${dayObj.label}`}>
          <View style={styles.slotGrid}>
            {daySlots.map((s) => {
              const on = slot === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSlot(s)}
                  style={[
                    styles.slotCell,
                    { backgroundColor: on ? t.accent : t.surface, borderColor: on ? t.accent : t.borderStrong },
                  ]}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: on ? t.onAccent : t.text }}>{s}</Text>
                </Pressable>
              );
            })}
          </View>
        </FieldBlock>

        <FieldBlock label="Session length">
          <View style={[styles.segment, { backgroundColor: t.surface2 }]}>
            {LENGTHS.map(([v, l]) => {
              const on = length === v;
              return (
                <Pressable key={v} onPress={() => setLength(v)} style={[styles.segmentItem, on && { backgroundColor: t.surface }]}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: on ? t.text : t.text3 }}>{l}</Text>
                  {v === 60 ? (
                    <Text style={{ fontSize: 9, color: on ? t.accent : t.text3 }}>default</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </FieldBlock>

        <FieldBlock label="Repeats">
          <View style={[styles.segment, { backgroundColor: t.surface2 }]}>
            {(
              [
                ['once', 'Just once'],
                ['weekly', 'Weekly'],
              ] as const
            ).map(([v, l]) => {
              const on = repeat === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => setRepeat(v)}
                  style={[styles.segmentItemRow, on && { backgroundColor: t.surface }]}
                >
                  {v === 'weekly' ? <Ic name="repeat" size={15} color={on ? t.accent : t.text3} strokeWidth={1.8} /> : null}
                  <Text style={{ fontSize: 14, fontWeight: '600', color: on ? t.text : t.text3 }}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
          {repeat === 'weekly' ? (
            <Card flat style={{ ...styles.noteCard, backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
              <View style={{ marginTop: 2 }}>
                <Ic name="repeat" size={16} color={t.accent} strokeWidth={1.9} />
              </View>
              <Text style={{ flex: 1, fontSize: 12.5, color: t.text2, lineHeight: 18 }}>
                Locks this time with {tutorFirst} every week. You&apos;re charged per session — skip or cancel anytime.
              </Text>
            </Card>
          ) : null}
        </FieldBlock>

        <FieldBlock label="How you'll meet">
          <View style={[styles.segment, { backgroundColor: t.surface2 }]}>
            {(
              [
                ['person', 'In person', 'pin'],
                ['online', 'Virtual', 'video'],
              ] as [string, string, IconName][]
            ).map(([v, l, ic]) => {
              const on = mode === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => setMode(v as 'person' | 'online')}
                  style={[styles.segmentItemRow, on && { backgroundColor: t.surface }]}
                >
                  <Ic name={ic} size={17} color={on ? t.accent : t.text3} strokeWidth={1.8} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: on ? t.text : t.text3 }}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
          {mode === 'person' ? (
            <View style={{ marginTop: 10 }}>
              <Selectable
                onPress={() => setSpotOpen(true)}
                value={spot}
                icon="pin"
                sub={spot.startsWith('Other') ? "You'll propose a spot in chat" : `${tutorFirst}'s agreed meeting spot`}
              />
            </View>
          ) : (
            <Card flat style={{ ...styles.videoCard, backgroundColor: t.accentWeak, borderColor: t.accentBorder }}>
              <View style={[styles.videoIcon, { backgroundColor: t.surface }]}>
                <Ic name="video" size={20} color={t.accent} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.text }}>Integrated video call</Text>
                <Text style={{ fontSize: 12, color: t.text2, marginTop: 2, lineHeight: 17 }}>
                  A secure link appears here 10 minutes before the session — no app needed.
                </Text>
              </View>
            </Card>
          )}
        </FieldBlock>

        <FieldBlock label={`Message to ${tutorFirst}`}>
          <TextInput
            value={msg}
            onChangeText={(v) => {
              setMsg(v);
              setMsgEdited(true);
            }}
            placeholder={tag ? '' : "Pick a session focus above and we'll draft this for you…"}
            placeholderTextColor={t.text3}
            multiline
            numberOfLines={4}
            style={[
              styles.msgBox,
              { color: t.text, backgroundColor: t.surface, borderColor: t.borderStrong },
            ]}
          />
          <View style={styles.msgFooter}>
            <View style={styles.msgFooterLeft}>
              <Ic name="bolt" size={13} color={t.accent} strokeWidth={1.8} />
              <Text style={{ fontSize: 12, color: t.text3 }}>
                {tag ? 'Auto-drafted — edit it to make it yours' : 'Required'}
              </Text>
            </View>
            {tag && msgEdited ? (
              <Text
                onPress={() => {
                  setMsg(focusMessage(tag, course));
                  setMsgEdited(false);
                }}
                style={{ fontSize: 12, fontWeight: '600', color: t.accent }}
              >
                Reset to template
              </Text>
            ) : null}
          </View>
        </FieldBlock>
      </Body>

      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <View style={styles.priceRow}>
          <Text style={{ fontSize: 14, color: t.text2 }}>
            {length === 30 ? '30 min' : `${length / 60} hr`} × ${rate}/hr
          </Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: t.text }}>${cost}</Text>
        </View>
        <Button
          label={!slot ? 'Pick a time to continue' : !tag ? 'Pick a session focus' : !msg.trim() ? 'Add a message to continue' : 'Continue to payment'}
          full
          disabled={!ready}
          iconRight="chevron"
          onPress={continueToPayment}
        />
      </ActionBar>

      <Sheet visible={courseOpen} onClose={() => setCourseOpen(false)} title="Choose course">
        {tutor.courses.map(([code, grade, r]) => (
          <Card
            key={code}
            selected={course === code}
            onPress={() => {
              setCourse(code);
              setCourseOpen(false);
            }}
            style={styles.courseRow}
          >
            <View style={[styles.courseGrade, { backgroundColor: t.accentWeak }]}>
              <Text style={{ color: t.accent, fontWeight: '700', fontSize: 13 }}>{grade}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{code}</Text>
              <Text style={{ fontSize: 12, color: t.text3 }}>Grade {grade} verified</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>${r}/hr</Text>
          </Card>
        ))}
      </Sheet>

      <Sheet visible={spotOpen} onClose={() => setSpotOpen(false)} title="Meeting spot">
        {IN_PERSON_SPOTS.map((l) => (
          <Card
            key={l}
            selected={spot === l}
            onPress={() => {
              setSpot(l);
              setSpotOpen(false);
            }}
            style={styles.spotRow}
          >
            <Ic name={l.startsWith('Other') ? 'edit' : 'pin'} size={19} color={t.accent} strokeWidth={1.8} />
            <Text style={{ flex: 1, fontSize: 15, color: t.text }}>{l}</Text>
            {spot === l ? <Ic name="check" size={18} color={t.accent} strokeWidth={2.6} /> : null}
          </Card>
        ))}
      </Sheet>
    </Screen>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 20 }}>
      <Label style={{ fontSize: 13, marginBottom: 10 }}>{label}</Label>
      {children}
    </View>
  );
}

function Selectable({
  value,
  sub,
  icon,
  onPress,
}: {
  value: string;
  sub?: string;
  icon?: IconName;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.selectable, { borderColor: t.borderStrong, backgroundColor: t.surface }]}>
      {icon ? <Ic name={icon} size={18} color={t.accent} strokeWidth={1.8} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>{value}</Text>
        {sub ? <Text style={{ fontSize: 12, color: t.text3, marginTop: 1 }}>{sub}</Text> : null}
      </View>
      <Ic name="chevdown" size={18} color={t.text3} strokeWidth={1.8} />
    </Pressable>
  );
}

// Minimal bottom-sheet stand-in (the kit has no BottomSheet primitive on RN).
function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={[styles.sheetBody, { backgroundColor: t.bg }]}>
        <Text style={[styles.sheetTitle, { color: t.text }]}>{title}</Text>
        <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 24 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tutorMini: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  tutorName: { fontSize: 15, fontWeight: '600' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  focusTag: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1.5 },
  dayRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  dayCell: { width: 58, paddingVertical: 10, borderRadius: 14, alignItems: 'center', borderWidth: 1.5 },
  dayDot: { width: 4, height: 4, borderRadius: 2, marginTop: 5 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotCell: { width: '31%', paddingVertical: 11, alignItems: 'center', borderRadius: 13, borderWidth: 1.5 },
  segment: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 13 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  segmentItemRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 11 },
  noteCard: { marginTop: 10, flexDirection: 'row', gap: 10, padding: 12, borderWidth: 1 },
  videoCard: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1 },
  videoIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  msgBox: { minHeight: 96, borderRadius: 13, borderWidth: 1.5, padding: 13, fontSize: 14.5, lineHeight: 20, textAlignVertical: 'top' },
  msgFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  msgFooterLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectable: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1.5 },
  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  courseGrade: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  spotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetBody: { maxHeight: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
});
