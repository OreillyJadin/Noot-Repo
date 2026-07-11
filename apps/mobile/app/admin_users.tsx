// Admin → User management. Lists all accounts with roles + status and lets an admin
// suspend / ban / reactivate. Actions go through api.admin.setUserStatus → the
// admin-set-user-status Edge Function (re-verifies admin server-side + applies the GoTrue
// ban). Client guard here is UI-only.
import React, { useEffect, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Button, Badge, Eyebrow, EmptyState, Skeleton, useTheme, type BadgeTone } from '@noot/ui';
import { api, type AdminUser } from '@noot/core';
import { useMe } from '../lib/useMe';

const STATUS_TONE: Record<string, BadgeTone> = { active: 'good', suspended: 'accentSoft', banned: 'neutral' };

export default function AdminUsers() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.admin.listUsers().then((u) => { if (alive) setUsers(u); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (!meLoading && me && !isAdmin) { router.replace('/home'); return null; }

  const setStatus = async (u: AdminUser, status: 'active' | 'suspended' | 'banned') => {
    if (busy) return;
    setBusy(u.id);
    try {
      await api.admin.setUserStatus(u.id, status);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status } : x)));
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <NavTop title="User management" onBack={() => router.back()} />
      <Body pad={20}>
        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={92} radius={16} />
            <Skeleton height={92} radius={16} />
          </View>
        ) : users.length === 0 ? (
          <EmptyState icon="user" title="No accounts" subtitle="Users will appear here." />
        ) : (
          <View style={{ gap: 10 }}>
            <Eyebrow style={{ color: t.text3 }}>{users.length} accounts</Eyebrow>
            {users.map((u) => {
              const isSelf = u.id === me?.id;
              return (
                <Card key={u.id} style={{ padding: 14 }}>
                  <View style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.name, { color: t.text }]}>{u.name}{isSelf ? ' (you)' : ''}</Text>
                      <Text style={[styles.email, { color: t.text3 }]}>{u.email}</Text>
                      <View style={styles.badges}>
                        {u.roles.filter((r) => r !== 'student' || u.roles.length === 1).map((r) => (
                          <Badge key={r} label={r} tone="neutral" />
                        ))}
                      </View>
                    </View>
                    <Badge label={u.status} tone={STATUS_TONE[u.status] ?? 'neutral'} />
                  </View>
                  {!isSelf ? (
                    <View style={styles.actions}>
                      {u.status !== 'active' ? (
                        <Button label="Reactivate" kind="secondary" size="sm" style={{ flex: 1 }} disabled={busy === u.id} onPress={() => setStatus(u, 'active')} />
                      ) : (
                        <>
                          <Button label="Suspend" kind="secondary" size="sm" style={{ flex: 1 }} disabled={busy === u.id} onPress={() => setStatus(u, 'suspended')} />
                          <Button label="Ban" kind="tint" size="sm" style={{ flex: 1 }} disabled={busy === u.id} onPress={() => setStatus(u, 'banned')} />
                        </>
                      )}
                    </View>
                  ) : null}
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 15, fontWeight: '700' },
  email: { fontSize: 12.5, marginTop: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
