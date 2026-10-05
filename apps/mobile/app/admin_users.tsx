// Admin → User management. Finds accounts by name or email, narrows by account type and
// status, and lets an admin suspend / ban / reactivate. The list is paged and searched on
// the server (api.admin.listUsers → admin_list_users, 0046), so it stays usable however many
// accounts there are (ERR-021). Actions go through api.admin.setUserStatus → the
// admin-set-user-status Edge Function (re-verifies admin server-side + applies the GoTrue
// ban). Client guard here is UI-only.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Alert, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Button, Badge, Chip, Field, Eyebrow, EmptyState, Skeleton, useTheme, type BadgeTone } from '@noot/ui';
import { api, type AdminUser, type AdminUserRole, type AdminUserStatus } from '@noot/core';
import { useMe } from '../lib/useMe';
import { errText } from '../lib/errText';

const STATUS_TONE: Record<string, BadgeTone> = { active: 'good', suspended: 'accentSoft', banned: 'neutral', deleted: 'neutral' };

const ROLES: [AdminUserRole | null, string][] = [
  [null, 'All'],
  ['student', 'Students'],
  ['tutor', 'Tutors'],
  ['ambassador', 'Ambassadors'],
  ['admin', 'Admins'],
];
const STATUSES: [AdminUserStatus | null, string][] = [
  [null, 'Any status'],
  ['active', 'Active'],
  ['suspended', 'Suspended'],
  ['banned', 'Banned'],
  ['deleted', 'Deleted'],
];
const PAGE = 30;

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminUsers() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');
  const [typed, setTyped] = useState('');
  // What is actually searched: `typed`, once the admin has paused.
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<AdminUserRole | null>(null);
  const [status, setStatus] = useState<AdminUserStatus | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Each change of search or filter starts a new list; an answer for an older one is dropped.
  const request = useRef(0);
  // Bumped to load the list again from the top.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 350);
    return () => clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    const mine = ++request.current;
    setLoading(true); setFailed(null);
    api.admin
      .listUsers({ search, role, status, limit: PAGE, offset: 0 })
      .then((page) => { if (request.current === mine) { setUsers(page.users); setTotal(page.total); } })
      .catch((e) => { if (request.current === mine) { setUsers([]); setTotal(0); setFailed(errText(e, 'Could not load accounts.')); } })
      .finally(() => { if (request.current === mine) setLoading(false); });
  }, [search, role, status, reload]);

  if (!meLoading && me && !isAdmin) { router.replace('/home'); return null; }

  const loadMore = async () => {
    if (loadingMore) return;
    const mine = request.current;
    setLoadingMore(true);
    try {
      const page = await api.admin.listUsers({ search, role, status, limit: PAGE, offset: users.length });
      if (request.current !== mine) return;
      // A new sign-up since the first page shifts the rest down by one: skip repeats.
      setUsers((prev) => [...prev, ...page.users.filter((u) => !prev.some((p) => p.id === u.id))]);
      // An empty page carries no count (the count rides on the rows), so it is not a zero.
      setTotal((prev) => (page.users.length ? page.total : Math.min(prev, users.length)));
    } catch (e) {
      if (request.current === mine) Alert.alert('Could not load more', errText(e, 'Please try again.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const setUserStatus = async (u: AdminUser, next: 'active' | 'suspended' | 'banned') => {
    if (busy) return;
    setBusy(u.id);
    const mine = request.current;
    try {
      await api.admin.setUserStatus(u.id, next);
      if (request.current !== mine) {
        // The search or filter changed while this was saving, so the list on screen is a
        // different one, possibly read before the change landed. Read it again rather than
        // patch it.
        setReload((n) => n + 1);
      } else if (status !== null && status !== next) {
        // It no longer matches the status being listed. Dropping it keeps the rows on screen
        // in step with the server's list, which "Show more" pages through by position.
        setUsers((prev) => prev.filter((x) => x.id !== u.id));
        setTotal((prev) => Math.max(0, prev - 1));
        // That was the last row on screen but not the last match: fetch the next ones.
        if (users.length <= 1 && total > 1) setReload((n) => n + 1);
      } else {
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: next } : x)));
      }
    } catch (e) {
      Alert.alert('Could not update', errText(e, 'Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const filtered = !!search || role !== null || status !== null;

  return (
    <Screen>
      <NavTop title="User management" onBack={() => router.back()} />
      <Body pad={20}>
        <View style={{ gap: 10, marginBottom: 14 }}>
          <Field placeholder="Search by name or email" value={typed} onChangeText={setTyped} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
            {ROLES.map(([value, label]) => (
              <Chip key={label} label={label} on={role === value} onPress={() => setRole(value)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
            {STATUSES.map(([value, label]) => (
              <Chip key={label} label={label} on={status === value} onPress={() => setStatus(value)} />
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={92} radius={16} />
            <Skeleton height={92} radius={16} />
          </View>
        ) : failed ? (
          <EmptyState icon="user" title="Couldn't load accounts" subtitle={failed} />
        ) : users.length === 0 ? (
          <EmptyState
            icon="user"
            title={filtered ? 'No accounts match' : 'No accounts'}
            subtitle={filtered ? 'Try a different search or filter.' : 'Users will appear here.'}
          />
        ) : (
          <View style={{ gap: 10 }}>
            <Eyebrow style={{ color: t.text3 }}>
              {users.length < total ? `Showing ${users.length} of ${total} accounts` : `${total} ${total === 1 ? 'account' : 'accounts'}`}
            </Eyebrow>
            {users.map((u) => {
              const isSelf = u.id === me?.id;
              const deleted = u.status === 'deleted';
              return (
                <Card key={u.id} style={{ padding: 14 }}>
                  <View style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.name, { color: deleted ? t.text3 : t.text }]}>
                        {deleted ? 'Deleted account' : u.name}{isSelf ? ' (you)' : ''}
                      </Text>
                      {/* A deleted account's name and email are erased when it is deleted. */}
                      <Text style={[styles.email, { color: t.text3 }]}>
                        {deleted
                          ? `Deleted ${u.deletedAt ? dateLabel(u.deletedAt) : ''} · joined ${dateLabel(u.createdAt)}`
                          : u.email}
                      </Text>
                      <View style={styles.badges}>
                        {u.roles.filter((r) => r !== 'student' || u.roles.length === 1).map((r) => (
                          <Badge key={r} label={r} tone="neutral" />
                        ))}
                      </View>
                    </View>
                    <Badge label={u.status} tone={STATUS_TONE[u.status] ?? 'neutral'} />
                  </View>
                  {!isSelf && !deleted ? (
                    <View style={styles.actions}>
                      {u.status !== 'active' ? (
                        <Button label="Reactivate" kind="secondary" size="sm" style={{ flex: 1 }} disabled={busy === u.id} onPress={() => setUserStatus(u, 'active')} />
                      ) : (
                        <>
                          <Button label="Suspend" kind="secondary" size="sm" style={{ flex: 1 }} disabled={busy === u.id} onPress={() => setUserStatus(u, 'suspended')} />
                          <Button label="Ban" kind="tint" size="sm" style={{ flex: 1 }} disabled={busy === u.id} onPress={() => setUserStatus(u, 'banned')} />
                        </>
                      )}
                    </View>
                  ) : null}
                </Card>
              );
            })}
            {users.length < total ? (
              <Button label={loadingMore ? 'Loading…' : 'Show more'} kind="secondary" disabled={loadingMore} onPress={loadMore} />
            ) : null}
          </View>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { fontSize: 15, fontWeight: '700' },
  email: { fontSize: 12.5, marginTop: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
