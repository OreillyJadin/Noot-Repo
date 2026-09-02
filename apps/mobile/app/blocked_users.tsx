// Blocked users — the "you can undo this from your profile" half of blocking.
//
// Guideline 1.2 requires the ability to block. Making it reversible isn't Apple's requirement,
// it's basic honesty: the block confirmation promises this screen exists, so it has to.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Avatar, Button, Ic, Skeleton, useTheme } from '@noot/ui';
import { api, type ChatParticipant } from '@noot/core';
import { errText } from '../lib/errText';

export default function BlockedUsers() {
  const t = useTheme();
  const router = useRouter();
  const [people, setPeople] = useState<ChatParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPeople(await api.moderation.listBlocked());
    } catch {
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const unblock = (p: ChatParticipant) => {
    const name = `${p.firstName} ${p.lastName}`.trim() || 'this person';
    Alert.alert(`Unblock ${name}?`, 'You’ll both be able to message each other again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          setBusy(p.id);
          try {
            await api.moderation.unblockUser(p.id);
            await load();
          } catch (e) {
            Alert.alert('Could not unblock', errText(e, 'Please try again.'));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <NavTop title="Blocked users" onBack={() => router.back()} />
      <Body>
        <Text style={[styles.intro, { color: t.text2 }]}>
          Blocking is mutual — neither of you can message the other, and they won’t appear in your
          search results.
        </Text>

        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={64} radius={14} />
            <Skeleton height={64} radius={14} />
          </View>
        ) : people.length === 0 ? (
          <View style={[styles.empty, { borderColor: t.borderStrong }]}>
            <Ic name="shield" size={24} color={t.text3} strokeWidth={1.7} />
            <Text style={{ marginTop: 8, fontSize: 14, color: t.text3, textAlign: 'center' }}>
              You haven’t blocked anyone.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {people.map((p) => {
              const name = `${p.firstName} ${p.lastName}`.trim() || 'Unknown';
              return (
                <Card key={p.id} style={styles.row}>
                  <Avatar size={40} label={name[0]} uri={p.avatarUrl} />
                  <Text style={[styles.name, { color: t.text }]}>{name}</Text>
                  <Button
                    label={busy === p.id ? '…' : 'Unblock'}
                    kind="secondary"
                    size="sm"
                    disabled={busy === p.id}
                    onPress={() => unblock(p)}
                  />
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
  intro: { fontSize: 13, lineHeight: 19.5, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },
  empty: { paddingVertical: 28, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center' },
});
