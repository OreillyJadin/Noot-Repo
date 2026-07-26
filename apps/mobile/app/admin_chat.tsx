// Admin team chat — the one group thread shared by every admin account.
// Reached from the gated Admin panel (admin_home). Unlike M1/M2, this is a GROUP thread:
// there's no single counterpart, so each incoming message carries its sender's avatar and
// name. Consecutive messages from the same person collapse into one labelled block.
//
// Backed by the same conversations/messages/attachments tables as the 1:1 chats (migration
// 0024 adds conversations.kind='admin'), so attachments, live delivery and RLS all come from
// the shared plumbing rather than a second implementation.
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
import {
  api,
  auth,
  type ChatParticipant,
  type Message as ApiMessage,
  type OutgoingAttachment,
} from '@noot/core';
import { useMe } from '../lib/useMe';
import { pickAndUploadChatAttachment } from '../lib/chatAttachments';
import { useAttachmentUrls } from '../lib/useAttachmentUrls';
import { separatorLabel } from '../lib/chatTime';
import { errText } from '../lib/errText';

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
  senderId: string;
  mine: boolean;
  text?: string;
  attach?: Attachment[];
  createdAt: string;
}

function toLocal(m: ApiMessage, uid: string | null): Message {
  return {
    id: m.id,
    senderId: m.senderId,
    mine: m.senderId === uid,
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

function displayName(p: ChatParticipant | undefined): string {
  if (!p) return 'Admin';
  return `${p.firstName} ${p.lastName}`.trim() || 'Admin';
}

export default function AdminChat() {
  const router = useRouter();
  const { me, loading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');

  // Defense-in-depth, same as admin_home: RLS is the real gate — a non-admin can't read or
  // post in the room regardless of what the client renders.
  if (!loading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }
  return <AdminChatInner />;
}

function AdminChatInner() {
  const t = useTheme();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [people, setPeople] = useState<Record<string, ChatParticipant>>({});
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<OutgoingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const urls = useAttachmentUrls([
    ...messages.flatMap((m) => m.attach?.map((a) => a.storagePath) ?? []),
    ...pending.map((a) => a.storagePath),
  ]);

  // Resolve any sender we haven't got a name/avatar for yet (new admin joins the thread,
  // or a live message arrives from someone not in the initial batch).
  const learnSenders = React.useCallback(async (ids: string[]) => {
    setPeople((prev) => {
      const missing = ids.filter((id) => id && !prev[id]);
      if (missing.length) {
        api.chat
          .listParticipants(missing)
          .then((found) => setPeople((cur) => ({ ...cur, ...found })))
          .catch(() => {});
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    let active = true;
    let unsub = () => {};
    (async () => {
      try {
        const me = await auth.getSessionUserId();
        const room = await api.chat.getAdminRoom();
        if (!active) return;
        setUid(me);
        setConvId(room.id);

        const initial = await api.chat.listMessages(room.id);
        if (!active) return;
        setMessages(initial.map((m) => toLocal(m, me)));
        void learnSenders(initial.map((m) => m.senderId));

        unsub = api.chat.subscribe(room.id, (m) => {
          void learnSenders([m.senderId]);
          setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, toLocal(m, me)]));
        });
      } catch (e) {
        if (active) setError(errText(e, 'Could not open the admin chat.'));
      }
    })();
    return () => {
      active = false;
      unsub();
    };
  }, [learnSenders]);

  const canSend = (draft.trim().length > 0 || pending.length > 0) && !uploading;

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
      setMessages((prev) => (prev.some((p) => p.id === created.id) ? prev : [...prev, toLocal(created, uid)]));
    } catch (e) {
      setDraft(text);
      setPending(attachments);
      Alert.alert('Message not sent', errText(e, 'Please try again.'));
    }
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
            <View style={[styles.roomIcon, { backgroundColor: t.accentWeak }]}>
              <Ic name="user" size={18} color={t.accent} strokeWidth={1.9} />
            </View>
            <View style={{ minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.navName, { color: t.text }]}>Admin team</Text>
              <Text numberOfLines={1} style={[styles.navSub, { color: t.text3 }]}>
                Everyone with an admin account
              </Text>
            </View>
          </View>
          <View style={styles.navSide} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <Text style={[styles.threadHint, { color: t.text3 }]}>{error}</Text>
          ) : (
            <Text style={[styles.threadHint, { color: t.text3 }]}>
              Private to the admin team. Everyone with an admin account sees this thread.
            </Text>
          )}

          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const label = separatorLabel(m.createdAt, prev?.createdAt);
            // Repeat the sender header only when the speaker changes or a separator broke
            // the run — a burst from one person reads as a single block.
            const showSender = !m.mine && (!!label || prev?.senderId !== m.senderId);
            return (
              <React.Fragment key={m.id}>
                {label && <Text style={[styles.timeLabel, { color: t.text3 }]}>{label}</Text>}
                <Row
                  m={m}
                  sender={people[m.senderId]}
                  showSender={showSender}
                  showAvatar={!m.mine}
                  urls={urls}
                />
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
              placeholder="Message the admin team…"
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

// One message row: gutter avatar for other people, bubble column with an optional name label.
function Row({
  m,
  sender,
  showSender,
  showAvatar,
  urls,
}: {
  m: Message;
  sender?: ChatParticipant;
  showSender: boolean;
  showAvatar: boolean;
  urls: Record<string, string>;
}) {
  const t = useTheme();
  const name = displayName(sender);
  return (
    <View style={[styles.row, { justifyContent: m.mine ? 'flex-end' : 'flex-start' }]}>
      {showAvatar && (
        // Keep the gutter even when the avatar is hidden, so a run of messages stays aligned.
        <View style={styles.gutter}>
          {showSender && <Avatar size={28} label={name[0]} uri={sender?.avatarUrl} />}
        </View>
      )}
      <View style={[styles.bubbleWrap, { alignItems: m.mine ? 'flex-end' : 'flex-start' }]}>
        {showSender && <Text style={[styles.senderName, { color: t.text3 }]}>{name}</Text>}
        {m.attach?.map((a, i) => <AttachView key={i} a={a} mine={m.mine} url={urls[a.storagePath]} />)}
        {m.text ? (
          <View
            style={[
              styles.bubble,
              m.mine
                ? { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 4, backgroundColor: t.accent }
                : { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 4, borderBottomRightRadius: 16, backgroundColor: t.surface2 },
            ]}
          >
            <Text style={{ color: m.mine ? t.onAccent : t.text, fontSize: 15, lineHeight: 21 }}>{m.text}</Text>
          </View>
        ) : null}
      </View>
    </View>
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
  root: { flex: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  navSide: { width: 48, justifyContent: 'center' },
  navCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  navName: { fontSize: 15, fontWeight: '700', lineHeight: 18 },
  navSub: { fontSize: 11.5 },
  roomIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  thread: { flexGrow: 1, padding: 16, paddingTop: 14, paddingBottom: 8, gap: 8 },
  threadHint: { textAlign: 'center', fontSize: 11.5, marginBottom: 6 },
  timeLabel: { textAlign: 'center', fontSize: 11, marginTop: 8, marginBottom: 2 },

  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  gutter: { width: 28 },
  bubbleWrap: { maxWidth: '78%', gap: 5 },
  senderName: { fontSize: 11.5, fontWeight: '600', marginBottom: 1, paddingHorizontal: 2 },
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
