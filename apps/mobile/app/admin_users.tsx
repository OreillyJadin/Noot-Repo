import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, UIManager, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, NO_SHOW_FLAG_AT, TUTOR_CANCEL_FLAG_OVER, type AdminUser, type AdminUserRole, type AdminUserStatus } from '@noot/core';
import { Avatar, Body, Ic, Screen, Skeleton, TabBar, useLargeText, useTheme } from '@noot/ui';
import { useMe } from '../lib/useMe';
import { errText } from '../lib/errText';
import { AdminMfaGate } from '../lib/AdminMfaGate';
import { AdminLargeHeader, AdminSection, AdminRow, StatusDot, WARNING_AMBER } from '../lib/adminUi';
import { useTabNav } from '../lib/useTabNav';

const ROLES: [AdminUserRole | null, string][] = [
  [null, 'All'],
  ['student', 'Students'],
  ['tutor', 'Tutors'],
  ['ambassador', 'Ambassadors'],
  ['admin', 'Admins'],
];
const STATUSES: [AdminUserStatus | null, string][] = [
  [null, 'All (not deleted)'],
  ['active', 'Active'],
  ['suspended', 'Suspended'],
  ['banned', 'Banned'],
  ['deleted', 'Deleted'],
];
const PAGE = 30;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
}

function AdminUsersScreen() {
  const t = useTheme();
  const largeText = useLargeText();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bodyRef = useRef<ScrollView>(null);
  const { active, onTab } = useTabNav({ scrollRef: bodyRef });
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<AdminUserRole | null>(null);
  const [status, setStatus] = useState<AdminUserStatus | null>(null);
  const [statusExpanded, setStatusExpanded] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const request = useRef(0);
  const focused = useRef(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 350);
    return () => clearTimeout(timer);
  }, [typed]);

  useFocusEffect(useCallback(() => {
    if (focused.current) setReload((value) => value + 1);
    focused.current = true;
  }, []));

  useEffect(() => {
    const mine = ++request.current;
    setLoading(true);
    setFailed(null);
    api.admin
      .listUsers({ search, role, status, limit: PAGE, offset: 0 })
      .then((page) => {
        if (request.current === mine) {
          setUsers(page.users);
          setTotal(page.total);
        }
      })
      .catch((error) => {
        if (request.current === mine) {
          setUsers([]);
          setTotal(0);
          setFailed(errText(error, 'Could not load accounts.'));
        }
      })
      .finally(() => { if (request.current === mine) setLoading(false); });
  }, [search, role, status, reload]);

  if (!meLoading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  const loadMore = async () => {
    if (loadingMore) return;
    const mine = request.current;
    setLoadingMore(true);
    try {
      const page = await api.admin.listUsers({ search, role, status, limit: PAGE, offset: users.length });
      if (request.current !== mine) return;
      setUsers((prev) => [...prev, ...page.users.filter((user) => !prev.some((item) => item.id === user.id))]);
      setTotal((prev) => (page.users.length ? page.total : Math.min(prev, users.length)));
    } catch (error) {
      if (request.current === mine) Alert.alert('Could not load more', errText(error, 'Please try again.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleStatus = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStatusExpanded((expanded) => !expanded);
  };

  const filtered = !!search || role !== null || status !== null;

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <Body
        ref={bodyRef}
        pad={20}
        contentStyle={styles.content}
        onRefresh={() => setReload((value) => value + 1)}
      >
        <AdminLargeHeader title="Users" />
        <View style={[styles.search, { backgroundColor: t.surface2, borderRadius: 12 }]}>
          <Ic name="search" size={18} color={t.text3} />
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={largeText ? 'Search' : 'Search name or email'}
            placeholderTextColor={t.text3}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.searchInput, { color: t.text }]}
            accessibilityLabel="Search name or email"
          />
          {typed ? (
            <Pressable onPress={() => setTyped('')} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ic name="x" size={17} color={t.text3} />
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.filterRow, largeText && styles.filterRowStacked]}>
          <ScrollView
            horizontal={!largeText}
            scrollEnabled={!largeText}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={largeText ? styles.roleFiltersStacked : undefined}
            contentContainerStyle={[styles.roleFilters, largeText && styles.roleFiltersWrap]}
          >
            {ROLES.map(([value, label]) => {
              const selected = role === value;
              return (
                <Pressable
                  key={label}
                  onPress={() => setRole(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${label} filter`}
                  style={({ pressed }) => [
                    styles.roleFilter,
                    selected ? { backgroundColor: t.text } : null,
                    pressed && !selected ? { opacity: 0.65 } : null,
                  ]}
                >
                  <Text style={[styles.roleLabel, { color: selected ? t.bg : t.text2 }]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            onPress={toggleStatus}
            accessibilityRole="button"
            accessibilityLabel={`Status filter: ${STATUSES.find(([value]) => value === status)?.[1]}`}
            accessibilityState={{ expanded: statusExpanded }}
            style={({ pressed }) => [styles.statusFilter, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Ic name="sliders" size={16} color={t.text2} />
            <Text style={[styles.statusFilterText, { color: t.text2 }]}>
              {status ? STATUSES.find(([value]) => value === status)?.[1] : 'Status'}
            </Text>
          </Pressable>
        </View>
        {statusExpanded ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.roleFilters}
          >
            {STATUSES.map(([value, label]) => {
              const selected = status === value;
              return (
                <Pressable
                  key={label}
                  onPress={() => setStatus(value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${label} status filter`}
                  style={({ pressed }) => [
                    styles.roleFilter,
                    selected ? { backgroundColor: t.text } : null,
                    pressed && !selected ? { opacity: 0.65 } : null,
                  ]}
                >
                  <Text style={[styles.roleLabel, { color: selected ? t.bg : t.text2 }]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {loading ? (
          <View style={styles.loadingRows}>
            <Skeleton height={92} />
            <Skeleton height={92} />
          </View>
        ) : failed ? (
          <View>
            <Text style={[styles.countLabel, { color: t.text3 }]}>Accounts</Text>
            <Text style={[styles.emptyText, { color: t.text2 }]}>{failed}</Text>
          </View>
        ) : users.length === 0 ? (
          <View>
            <Text style={[styles.countLabel, { color: t.text3 }]}>0 accounts</Text>
            <Text style={[styles.emptyText, { color: t.text2 }]}>
              {filtered ? 'No accounts match. Try a different search or filter.' : 'Users will appear here.'}
            </Text>
          </View>
        ) : (
          <>
            <AdminSection
              label={users.length < total ? `Showing ${users.length} of ${total} accounts` : `${total} ${total === 1 ? 'account' : 'accounts'}`}
            >
              {users.map((user) => {
                const isSelf = user.id === me?.id;
                const deleted = user.status === 'deleted';
                const name = deleted ? 'Deleted account' : `${user.name}${isSelf ? ' (you)' : ''}`;
                const email = deleted
                  ? `Deleted ${user.deletedAt ? dateLabel(user.deletedAt) : ''} · joined ${dateLabel(user.createdAt)}`
                  : user.email;
                const roles = user.roles
                  .filter((value) => value !== 'student' || user.roles.length === 1)
                  .map((value) => value[0]!.toUpperCase() + value.slice(1))
                  .join(' · ') || 'Student';
                const warnings = [
                  user.tutorCancels30d > TUTOR_CANCEL_FLAG_OVER ? `${user.tutorCancels30d} cancels / 30d` : null,
                  user.noShows >= NO_SHOW_FLAG_AT ? `${user.noShows} no-shows` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <AdminRow
                    key={user.id}
                    leading={<Avatar size={40} label={initials(name)} />}
                    title={name}
                    subtitle={email}
                    detail={
                      <Text numberOfLines={1} style={styles.userDetail}>
                        <Text style={{ color: t.text3 }}>{roles}</Text>
                        {warnings ? <Text style={{ color: WARNING_AMBER }}> · {warnings}</Text> : null}
                      </Text>
                    }
                    trailing={user.status !== 'active' ? (
                      <StatusDot
                        label={user.status[0]!.toUpperCase() + user.status.slice(1)}
                        color={user.status === 'suspended' ? WARNING_AMBER : t.text3}
                      />
                    ) : null}
                    accessibilityLabel={`${name}, ${email}, ${roles}`}
                    onPress={() => router.push(`/admin_user?id=${encodeURIComponent(user.id)}`)}
                  />
                );
              })}
            </AdminSection>
            {users.length < total ? (
              <Pressable
                onPress={loadMore}
                disabled={loadingMore}
                accessibilityRole="button"
                accessibilityLabel={loadingMore ? 'Loading more users' : 'Show more users'}
                style={({ pressed }) => [
                  styles.more,
                  { backgroundColor: pressed ? t.surface2 : t.surface, borderRadius: t.cardRadius ? Number.parseFloat(t.cardRadius) : 16 },
                ]}
              >
                <Text style={[styles.moreText, { color: t.text2 }]}>{loadingMore ? 'Loading…' : 'Show more'}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </Body>
      <TabBar role="admin" active={active} onTab={onTab} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, gap: 16, paddingBottom: 22 },
  search: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, paddingVertical: 10 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleFilters: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  // Large text: role chips wrap onto lines and Status drops below, instead of scrolling off-screen.
  filterRowStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  roleFiltersStacked: { alignSelf: 'stretch', flexGrow: 0 },
  roleFiltersWrap: { flexWrap: 'wrap' },
  roleFilter: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18 },
  roleLabel: { fontSize: 12, fontWeight: '600' },
  statusFilter: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  statusFilterText: { fontSize: 12, fontWeight: '600' },
  loadingRows: { gap: 8 },
  countLabel: { fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 13, marginTop: 8 },
  userDetail: { fontSize: 10.5 },
  more: { padding: 13, alignItems: 'center' },
  moreText: { fontSize: 13, fontWeight: '600' },
});

export default function AdminUsers() {
  return (
    <AdminMfaGate>
      <AdminUsersScreen />
    </AdminMfaGate>
  );
}
