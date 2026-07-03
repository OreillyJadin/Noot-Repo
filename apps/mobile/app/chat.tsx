// M1 Chat (Student view) — ported from screens-chat.jsx (Chat, perspective="student").
// Full conversation thread with a tutor: text + image/file attachments.
// Prototype persisted threads via NootStore (localStorage); here we keep the
// thread in local useState, seeded with demo messages. Real wiring later:
// @noot/core messaging (load/send/subscribe) will replace the local state.
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ic, Avatar, useTheme, type IconName } from '@noot/ui';
import { useApp } from '../lib/store';
import { tutorById } from '../lib/data';

type Who = 'student' | 'tutor';
type AttachKind = 'image' | 'file';

interface Attachment {
  name: string;
  kind: AttachKind;
  size?: number;
}

interface Message {
  who: Who;
  text?: string;
  attach?: Attachment[];
  time: string;
}

// Demo attachments the paperclip button cycles through.
// TODO(api): replace with a real image/file picker (expo-image-picker / expo-document-picker).
const DEMO_ATTACHMENTS: Attachment[] = [
  { name: 'IMG_0192.jpg', kind: 'image', size: 482_000 },
  { name: 'Practice_Problems.pdf', kind: 'file', size: 154_000 },
];

// Seed thread — mirrors chat-store.jsx SEED_THREADS.sara.
const SEED_MESSAGES: Message[] = [
  { who: 'student', text: "Hey, I'm Lindsay! Looking forward to working through MGT 300 with you.", time: 'May 27' },
  { who: 'tutor', text: "Hi Lindsay! Great — want to start with Porter's Five Forces? That's usually the trickiest on Reynolds' exam.", time: 'May 27' },
  { who: 'student', text: "Yes please. I'll bring my case packet.", time: 'May 27' },
  { who: 'tutor', text: 'Perfect. See you at Gorgas, 2nd floor \u{1F44D}', time: 'May 28' },
  { who: 'student', text: 'That session was super helpful, thank you!', time: 'May 28' },
];

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function Chat() {
  const t = useTheme();
  const router = useRouter();
  const { booking } = useApp();
  const perspective: Who = 'student';

  // No live booking context yet → fall back to a demo tutor thread.
  const tutor = booking.tutor ?? tutorById('sara')!;
  const other = tutor.name;
  const otherSub = `${tutor.year} · ${tutor.major}`;

  const [messages, setMessages] = useState<Message[]>(SEED_MESSAGES);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Attachment[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const canSend = draft.trim().length > 0 || pending.length > 0;

  const addDemoAttachment = () => {
    // TODO(api): open a real attach sheet (camera roll / files) instead of cycling demo data.
    const next = DEMO_ATTACHMENTS[pending.length % DEMO_ATTACHMENTS.length]!;
    setPending((p) => [...p, next]);
  };

  const removePending = (i: number) => setPending((p) => p.filter((_, j) => j !== i));

  const send = () => {
    const text = draft.trim();
    if (!text && pending.length === 0) return;
    setMessages((m) => [...m, { who: perspective, text, attach: pending.length ? pending : undefined, time: 'Now' }]);
    setDraft('');
    setPending([]);
  };

  const notify = () => {
    // TODO(api): real notification center, backed by @noot/core.
    Alert.alert('Notifications', 'Built with backend.');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.nav}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.navSide}>
            <Ic name="back" size={24} color={t.accent} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.navCenter}>
            <Avatar size={34} label={other[0]} />
            <View style={{ minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.navName, { color: t.text }]}>{other}</Text>
              <Text numberOfLines={1} style={[styles.navSub, { color: t.text3 }]}>{otherSub}</Text>
            </View>
          </View>
          <Pressable onPress={notify} hitSlop={8} style={[styles.navSide, styles.navSideEnd]}>
            <Ic name="bell" size={20} color={t.text2} strokeWidth={1.8} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.threadHint, { color: t.text3 }]}>
            This is your full conversation with {other.split(' ')[0]}.
          </Text>

          {messages.map((m, i) => {
            const mine = m.who === perspective;
            const prev = messages[i - 1];
            const showTime = !prev || prev.time !== m.time;
            return (
              <React.Fragment key={i}>
                {showTime && <Text style={[styles.timeLabel, { color: t.text3 }]}>{m.time}</Text>}
                <Bubble mine={mine} m={m} />
              </React.Fragment>
            );
          })}

          {pending.length > 0 && (
            <View style={styles.pendingRow}>
              {pending.map((a, i) => (
                <AttachChip key={i} a={a} onRemove={() => removePending(i)} />
              ))}
            </View>
          )}
        </ScrollView>

        <View style={[styles.composer, { backgroundColor: t.surface, borderTopColor: t.border }]}>
          <Pressable
            onPress={addDemoAttachment}
            accessibilityLabel="Attach"
            style={[styles.roundBtn, { backgroundColor: t.surface2 }]}
          >
            <Ic name="clip" size={20} color={t.text2} strokeWidth={1.8} />
          </Pressable>

          <View style={[styles.inputWrap, { backgroundColor: t.bg, borderColor: t.borderStrong }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={`Message ${other.split(' ')[0]}…`}
              placeholderTextColor={t.text3}
              multiline
              style={[styles.input, { color: t.text }]}
            />
          </View>

          <Pressable
            onPress={send}
            disabled={!canSend}
            accessibilityLabel="Send"
            style={[styles.roundBtn, { backgroundColor: canSend ? t.accent : t.surface2 }]}
          >
            <Ic name="send" size={19} color={canSend ? t.onAccent : t.text3} strokeWidth={1.9} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ mine, m }: { mine: boolean; m: Message }) {
  const t = useTheme();
  return (
    <View style={[styles.bubbleWrap, { alignSelf: mine ? 'flex-end' : 'flex-start', alignItems: mine ? 'flex-end' : 'flex-start' }]}>
      {m.attach?.map((a, i) => <AttachView key={i} a={a} mine={mine} />)}
      {m.text ? (
        <View
          style={[
            styles.bubble,
            mine
              ? { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 4, backgroundColor: t.accent }
              : { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 4, borderBottomRightRadius: 16, backgroundColor: t.surface2 },
          ]}
        >
          <Text style={{ color: mine ? t.onAccent : t.text, fontSize: 15, lineHeight: 21 }}>{m.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Attachment rendered inside a sent message.
function AttachView({ a, mine }: { a: Attachment; mine: boolean }) {
  const t = useTheme();
  const iconName: IconName = a.kind === 'image' ? 'image' : 'doc';
  return (
    <View style={[styles.attachView, { backgroundColor: mine ? t.accent : t.surface2 }]}>
      <Ic name={iconName} size={20} color={mine ? t.onAccent : t.accent} strokeWidth={1.7} />
      <View style={{ minWidth: 0 }}>
        <Text numberOfLines={1} style={[styles.attachName, { color: mine ? t.onAccent : t.text }]}>{a.name}</Text>
        {a.size != null && (
          <Text style={[styles.attachSize, { color: mine ? t.onAccent : t.text }]}>{fmtSize(a.size)}</Text>
        )}
      </View>
    </View>
  );
}

// Staged attachment chip (before send), with a remove button.
function AttachChip({ a, onRemove }: { a: Attachment; onRemove: () => void }) {
  const t = useTheme();
  const iconName: IconName = a.kind === 'image' ? 'image' : 'doc';
  return (
    <View style={[styles.attachChip, { backgroundColor: t.surface2, borderColor: t.border }]}>
      <Ic name={iconName} size={17} color={t.accent} strokeWidth={1.7} />
      <Text numberOfLines={1} style={[styles.attachChipName, { color: t.text }]}>{a.name}</Text>
      <Pressable onPress={onRemove} accessibilityLabel="Remove" style={styles.removeBtn}>
        <Ic name="x" size={11} color="#fff" strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  navSide: { width: 48, justifyContent: 'center' },
  navSideEnd: { alignItems: 'flex-end' },
  navCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  navName: { fontSize: 15, fontWeight: '700', lineHeight: 18 },
  navSub: { fontSize: 11.5 },

  thread: { flexGrow: 1, padding: 16, paddingTop: 14, paddingBottom: 8, gap: 8 },
  threadHint: { textAlign: 'center', fontSize: 11.5, marginBottom: 6 },
  timeLabel: { textAlign: 'center', fontSize: 11, marginTop: 8, marginBottom: 2 },

  bubbleWrap: { maxWidth: '80%', gap: 5 },
  bubble: { paddingHorizontal: 13, paddingVertical: 9 },

  attachView: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 14 },
  attachName: { fontSize: 13.5, fontWeight: '600', maxWidth: 150 },
  attachSize: { fontSize: 11, opacity: 0.75 },

  pendingRow: { alignSelf: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: '80%' },
  attachChip: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  attachChipName: { fontSize: 12.5, maxWidth: 110 },
  removeBtn: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },

  composer: { flexShrink: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1 },
  roundBtn: { flexShrink: 0, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, minHeight: 40, maxHeight: 110, borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 2, justifyContent: 'center' },
  input: { fontSize: 15, lineHeight: 20, paddingVertical: 8, maxHeight: 100 },
});
