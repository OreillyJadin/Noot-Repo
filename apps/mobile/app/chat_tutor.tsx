// M2 Chat (Tutor view) — ported from screens-chat.jsx (ChatTutor = Chat with
// perspective="tutor"). Same thread as chat.tsx (M1), rendered from the tutor's
// side: bubbles flipped, header shows the student.
// Wired to @noot/core messaging: the conversation with the session's student
// (booking.studentId — confirm-booking created it) is loaded on mount,
// messages are fetched + streamed live, and the
// composer sends text and/or attachments through the API.
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ic, Avatar, useTheme, type IconName } from '@noot/ui';
import { api, auth, type Message as ApiMessage, type OutgoingAttachment } from '@noot/core';
import { useApp } from '../lib/store';
import { NoSession } from '../lib/NoSession';
import { useCounterpart } from '../lib/useCounterpart';
import { pickAndUploadChatAttachment } from '../lib/chatAttachments';
import { useAttachmentUrls } from '../lib/useAttachmentUrls';
import { separatorLabel } from '../lib/chatTime';
import { openSafetyMenu, reportMessage } from '../lib/moderation';
import { errText } from '../lib/errText';
import { useMe } from '../lib/useMe';
import { tutorSessionDrafts } from '../lib/sessionDrafts';

type Who = 'student' | 'tutor';
type AttachKind = 'image' | 'file';

interface Attachment {
  name: string;
  kind: AttachKind;
  size?: number;
  /** Key in the private bucket; resolved to a signed URL for display. */
  storagePath: string;
}

interface Message {
  id: string;
  who: Who;
  text?: string;
  attach?: Attachment[];
  createdAt: string;
}

// @noot/core Message → the local bubble shape. `mineWho`/`otherWho` place the
// bubble on the correct side by comparing the sender to the signed-in user.
function toLocal(m: ApiMessage, uid: string | null, mineWho: Who, otherWho: Who): Message {
  return {
    id: m.id,
    who: m.senderId === uid ? mineWho : otherWho,
    // '' for an attachment-only message — Bubble skips the text bubble entirely.
    text: m.content || undefined,
    attach: m.attachments?.map((a) => ({
      name: a.filename,
      kind: a.kind,
      size: a.sizeBytes ?? undefined,
      storagePath: a.storagePath,
    })),
    createdAt: m.createdAt,
  };
}

/** Staged (uploaded, not yet sent) attachment → the local chip shape. */
function stagedToLocal(a: OutgoingAttachment): Attachment {
  return { name: a.filename, kind: a.kind, size: a.sizeBytes, storagePath: a.storagePath };
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function ChatTutor() {
  const { booking } = useApp();
  // Keyed on the session's student: the tutor's chat is the conversation with them.
  if (!booking.studentId) {
    return <NoSession title="No conversation yet" subtitle="Open a chat from one of your sessions." />;
  }
  return <ChatTutorInner />;
}

function ChatTutorInner() {
  const t = useTheme();
  const router = useRouter();
  const { booking } = useApp();
  const perspective: Who = 'tutor';

  // Counterpart conversation comes from the booking draft; the student's real name
  // (header/placeholder) resolves via the resolve-participants edge function.
  // Guaranteed by ChatTutor's guard; kept nullable for the safety menu's existing checks.
  const studentId = booking.studentId ?? null;
  const student = useCounterpart(booking.studentId);
  const other = student.name;
  const otherSub = [student.year, student.major].filter(Boolean).join(' · ');

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<OutgoingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  // Blocking is symmetric and enforced by RLS (0028); this only drives the UI so the composer
  // explains itself instead of failing on send.
  const [blocked, setBlocked] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Suggested messages for a booked session (B2) — the location one asks the tutor to name
  // the exact spot. Only fills the composer; the tutor edits and sends it themselves.
  const { me } = useMe();
  const drafts = booking.bookingId
    ? tutorSessionDrafts({
        studentFirstName: other.split(' ')[0] ?? '',
        tutorFirstName: me?.firstName ?? '',
        course: booking.course ?? '',
        location: booking.location ?? '',
        when: booking.scheduledAt
          ? new Date(booking.scheduledAt)
              .toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })
              .replace(/,? (\d)/, ' at $1')
          : '',
      })
    : [];

  // Every attachment on screen (sent + staged) needs a signed URL — the bucket is private.
  const urls = useAttachmentUrls([
    ...messages.flatMap((m) => m.attach?.map((a) => a.storagePath) ?? []),
    ...pending.map((a) => a.storagePath),
  ]);

  // Load/create the conversation, fetch its messages, and stream live ones.
  useEffect(() => {
    let active = true;
    let unsub = () => {};
    (async () => {
      try {
        const me = await auth.getSessionUserId();
        // The conversation confirm-booking created with this student. (getOrCreateConversation
        // is the student-side call and matched the tutor as the student — B2.)
        const conv = await api.chat.getConversationWithStudent(studentId!);
        if (!active) return;
        setUid(me);
        setConvId(conv.id);
        if (studentId) {
          api.moderation.isBlocked(studentId).then((b) => { if (active) setBlocked(b); }).catch(() => {});
        }
        const initial = await api.chat.listMessages(conv.id);
        if (!active) return;
        setMessages(initial.map((m) => toLocal(m, me, 'tutor', 'student')));
        unsub = api.chat.subscribe(conv.id, (m) =>
          setMessages((prev) =>
            prev.some((p) => p.id === m.id) ? prev : [...prev, toLocal(m, me, 'tutor', 'student')],
          ),
        );
      } catch {
        // No session / backend unavailable → gentle empty thread.
      }
    })();
    return () => {
      active = false;
      unsub();
    };
  }, [studentId]);

  const canSend = (draft.trim().length > 0 || pending.length > 0) && !uploading && !blocked;

  const addAttachment = async () => {
    if (!convId || uploading) return;
    setUploading(true);
    try {
      const uploaded = await pickAndUploadChatAttachment(convId);
      if (uploaded) setPending((p) => [...p, uploaded]);
    } finally {
      setUploading(false);
    }
  };

  const removePending = (i: number) => setPending((p) => p.filter((_, j) => j !== i));

  const send = async () => {
    const text = draft.trim();
    const attachments = pending;
    if ((!text && attachments.length === 0) || !convId) return;
    setDraft('');
    setPending([]);
    try {
      const created = await api.chat.sendMessage(convId, text, attachments);
      // Append optimistically; the live subscription guards against a duplicate.
      setMessages((prev) =>
        prev.some((p) => p.id === created.id) ? prev : [...prev, toLocal(created, uid, 'tutor', 'student')],
      );
    } catch (e) {
      // Restore the draft so a failed send doesn't silently discard what they wrote/attached.
      setDraft(text);
      setPending(attachments);
      Alert.alert('Message not sent', errText(e, 'Please try again.'));
    }
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
              {otherSub ? <Text numberOfLines={1} style={[styles.navSub, { color: t.text3 }]}>{otherSub}</Text> : null}
            </View>
          </View>
          <Pressable
            onPress={() => studentId && void openSafetyMenu(studentId, other, () => setBlocked(true))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Report or block this person"
            style={[styles.navSide, styles.navSideEnd]}
          >
            <Ic name="shield" size={20} color={t.text2} strokeWidth={1.8} />
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
            const label = separatorLabel(m.createdAt, messages[i - 1]?.createdAt);
            return (
              <React.Fragment key={m.id}>
                {label && <Text style={[styles.timeLabel, { color: t.text3 }]}>{label}</Text>}
                <Bubble mine={mine} m={m} urls={urls} onReport={() => void reportMessage(m.id)} />
              </React.Fragment>
            );
          })}

          {pending.length > 0 && (
            <View style={styles.pendingRow}>
              {pending.map((a, i) => (
                <AttachChip
                  key={a.storagePath}
                  a={stagedToLocal(a)}
                  url={urls[a.storagePath]}
                  onRemove={() => removePending(i)}
                />
              ))}
            </View>
          )}
        </ScrollView>

        {drafts.length > 0 && !draft && !blocked ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={[styles.draftBar, { borderTopColor: t.border, backgroundColor: t.surface }]}
            contentContainerStyle={styles.draftRow}
          >
            {drafts.map((d) => (
              <Pressable
                key={d.key}
                onPress={() => setDraft(d.text)}
                accessibilityRole="button"
                accessibilityLabel={`Draft a message: ${d.label}`}
                style={[styles.draftChip, { backgroundColor: t.accentWeak, borderColor: t.accentBorder }]}
              >
                <Ic name={d.key === 'location' ? 'pin' : d.key === 'intro' ? 'chat' : 'doc'} size={14} color={t.accent} strokeWidth={2} />
                <Text style={[styles.draftLabel, { color: t.accent }]}>{d.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={[styles.composer, { backgroundColor: t.surface, borderTopColor: t.border }]}>
          <Pressable
            onPress={addAttachment}
            disabled={!convId || uploading}
            accessibilityLabel="Attach"
            style={[styles.roundBtn, { backgroundColor: t.surface2, opacity: convId && !uploading ? 1 : 0.5 }]}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={t.text2} />
            ) : (
              <Ic name="clip" size={20} color={t.text2} strokeWidth={1.8} />
            )}
          </Pressable>

          <View style={[styles.inputWrap, { backgroundColor: t.bg, borderColor: t.borderStrong }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              editable={!blocked}
              placeholder={blocked ? 'You can’t message this person' : `Message ${other.split(' ')[0]}…`}
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

function Bubble({
  mine,
  m,
  urls,
  onReport,
}: {
  mine: boolean;
  m: Message;
  urls: Record<string, string>;
  onReport: () => void;
}) {
  const t = useTheme();
  return (
    // Long-press to report — Guideline 1.2 wants a route to report the CONTENT, not just the
    // person. Own messages are excluded: reporting yourself is noise in the queue.
    <Pressable
      onLongPress={mine ? undefined : onReport}
      delayLongPress={400}
      accessibilityHint={mine ? undefined : 'Long press to report this message'}
      style={[styles.bubbleWrap, { alignSelf: mine ? 'flex-end' : 'flex-start', alignItems: mine ? 'flex-end' : 'flex-start' }]}
    >
      {m.attach?.map((a, i) => <AttachView key={i} a={a} mine={mine} url={urls[a.storagePath]} />)}
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
    </Pressable>
  );
}

// Attachment rendered inside a sent message. Images show inline once their signed URL
// resolves; everything else (and an image still resolving) stays the icon + name row.
function AttachView({ a, mine, url }: { a: Attachment; mine: boolean; url?: string }) {
  const t = useTheme();
  const iconName: IconName = a.kind === 'image' ? 'image' : 'doc';

  if (a.kind === 'image' && url) {
    return (
      <Image
        source={{ uri: url }}
        accessibilityLabel={a.name}
        resizeMode="cover"
        style={[styles.attachImage, { backgroundColor: t.surface2 }]}
      />
    );
  }

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

// Staged attachment chip (uploaded, not yet sent), with a remove button.
function AttachChip({ a, url, onRemove }: { a: Attachment; url?: string; onRemove: () => void }) {
  const t = useTheme();
  const iconName: IconName = a.kind === 'image' ? 'image' : 'doc';
  return (
    <View style={[styles.attachChip, { backgroundColor: t.surface2, borderColor: t.border }]}>
      {a.kind === 'image' && url ? (
        <Image source={{ uri: url }} style={styles.attachChipThumb} resizeMode="cover" />
      ) : (
        <Ic name={iconName} size={17} color={t.accent} strokeWidth={1.7} />
      )}
      <Text numberOfLines={1} style={[styles.attachChipName, { color: t.text }]}>{a.name}</Text>
      <Pressable onPress={onRemove} accessibilityLabel="Remove" style={styles.removeBtn}>
        <Ic name="x" size={11} color="#fff" strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  draftBar: { flexGrow: 0, borderTopWidth: 1 },
  draftRow: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  draftChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 999, borderWidth: 1 },
  draftLabel: { fontSize: 13, fontWeight: '600' },
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
  attachImage: { width: 200, height: 200, borderRadius: 14 },

  pendingRow: { alignSelf: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: '80%' },
  attachChip: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  attachChipName: { fontSize: 12.5, maxWidth: 110 },
  attachChipThumb: { width: 22, height: 22, borderRadius: 5 },
  removeBtn: { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },

  composer: { flexShrink: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1 },
  roundBtn: { flexShrink: 0, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, minHeight: 40, maxHeight: 110, borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 2, justifyContent: 'center' },
  input: { fontSize: 15, lineHeight: 20, paddingVertical: 8, maxHeight: 100 },
});
