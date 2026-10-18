// Admin Hub → Ambassadors (0088). Three tabs on one flat grouped list:
//   • Applications — ambassadors the team hasn't approved yet → Approve.
//   • Cash-outs — pending cash-out requests → Pay (Stripe transfer via admin-pay-cashout)
//     or Reject (the credit goes back on their balance, admin_reject_cashout).
//   • History — recent approvals and settled cash-outs.
// Every mutation is verified and audited server-side; this screen only asks.
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { api, type AdminAmbassadorApplicant, type AdminAmbassadorEvent, type AdminCashout } from '@noot/core';
import { Body, EmptyState, NavTop, Screen, Skeleton, useTheme } from '@noot/ui';
import { useMe } from '../lib/useMe';
import { AdminTabs, useAdminHubCounts, type AdminTab } from '../lib/AdminTabs';
import { AdminMfaGate } from '../lib/AdminMfaGate';
import { AdminRow, AdminSection, StatusDot, WARNING_AMBER } from '../lib/adminUi';
import { errText } from '../lib/errText';

type Tab = 'applications' | 'cashouts' | 'history';

const dollars = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;

function when(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function AdminAmbassadorsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const isAdmin = !!me?.roles?.includes('admin');
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const tab: Tab = tabParam === 'cashouts' || tabParam === 'history' ? tabParam : 'applications';
  const [applicants, setApplicants] = useState<AdminAmbassadorApplicant[] | null>(null);
  const [cashouts, setCashouts] = useState<AdminCashout[] | null>(null);
  const [history, setHistory] = useState<AdminAmbassadorEvent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const counts = useAdminHubCounts(true, reload);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (tab === 'applications') {
        api.admin.listAmbassadorApplicants().then((r) => { if (alive) setApplicants(r); }).catch(() => { if (alive) setApplicants([]); });
      } else if (tab === 'cashouts') {
        api.admin.listCashouts(['pending']).then((r) => { if (alive) setCashouts(r); }).catch(() => { if (alive) setCashouts([]); });
      } else {
        api.admin.ambassadorHistory().then((r) => { if (alive) setHistory(r); }).catch(() => { if (alive) setHistory([]); });
      }
      return () => { alive = false; };
    }, [tab, reload]),
  );

  if (!meLoading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  const tabs: AdminTab[] = [
    { key: 'applications', label: 'Applications', count: counts?.ambassadorApplications, href: '/admin_ambassadors?tab=applications' },
    { key: 'cashouts', label: 'Cash-outs', count: counts?.cashouts, href: '/admin_ambassadors?tab=cashouts' },
    { key: 'history', label: 'History', href: '/admin_ambassadors?tab=history' },
  ];

  const run = async (key: string, work: () => Promise<void>, failTitle: string) => {
    if (busy) return;
    setBusy(key);
    try {
      await work();
      setReload((n) => n + 1);
    } catch (e) {
      Alert.alert(failTitle, errText(e, 'Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const askApprove = (a: AdminAmbassadorApplicant) =>
    Alert.alert(
      `Approve ${a.name}?`,
      'They unlock goal bonuses and can cash out their credit.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => run(a.userId, async () => {
            await api.admin.approveAmbassador(a.userId);
            setApplicants((prev) => (prev ?? []).filter((x) => x.userId !== a.userId));
          }, 'Could not approve'),
        },
      ],
    );

  const askCashout = (c: AdminCashout) => {
    const removeRow = () => setCashouts((prev) => (prev ?? []).filter((x) => x.id !== c.id));
    Alert.alert(
      `${dollars(c.amountCents)} to ${c.name}`,
      c.payoutReady
        ? 'Pay sends a Stripe transfer to their payout account. Reject puts the credit back on their balance.'
        : 'Their payout account isn’t ready yet, so Pay will fail. You can reject to return the credit.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject · return credit',
          style: 'destructive',
          onPress: () => run(c.id, async () => { await api.admin.rejectCashout(c.id); removeRow(); }, 'Could not reject'),
        },
        {
          text: `Pay ${dollars(c.amountCents)}`,
          onPress: () => run(c.id, async () => {
            await api.admin.payCashout(c.id);
            removeRow();
            Alert.alert('Paid', `${dollars(c.amountCents)} is on its way to ${c.name}.`);
          }, 'Not paid'),
        },
      ],
    );
  };

  const loadingList = (
    <View style={styles.loading}>
      <Skeleton height={64} />
      <Skeleton height={64} />
    </View>
  );

  return (
    <Screen>
      <NavTop title="Ambassadors" onBack={() => router.back()} />
      <Body pad={20} contentStyle={styles.content}>
        <AdminTabs tabs={tabs} active={tab} />

        {tab === 'applications' ? (
          applicants === null ? loadingList : applicants.length === 0 ? (
            <EmptyState icon="gift" title="No one waiting" subtitle="Ambassadors who still need approval will appear here." />
          ) : (
            <AdminSection label={`${applicants.length} waiting for approval`}>
              {applicants.map((a) => (
                <AdminRow
                  key={a.userId}
                  icon="user"
                  title={a.name}
                  subtitle={`${a.completedInvites} of ${a.invites} invite${a.invites === 1 ? '' : 's'} completed · ${dollars(a.balanceCents)} credit · since ${when(a.appliedAt)}`}
                  trailing={<Text style={[styles.action, { color: busy === a.userId ? t.text3 : t.accent }]}>{busy === a.userId ? 'Approving…' : 'Approve'}</Text>}
                  chevron={false}
                  onPress={() => askApprove(a)}
                />
              ))}
            </AdminSection>
          )
        ) : null}

        {tab === 'cashouts' ? (
          cashouts === null ? loadingList : cashouts.length === 0 ? (
            <EmptyState icon="wallet" title="Nothing to pay" subtitle="Cash-out requests waiting for a Stripe transfer will appear here." />
          ) : (
            <AdminSection label={`${cashouts.length} to pay`}>
              {cashouts.map((c) => (
                <AdminRow
                  key={c.id}
                  icon="wallet"
                  title={`${dollars(c.amountCents)} · ${c.name}`}
                  subtitle={`Requested ${when(c.createdAt)}${c.payoutReady ? '' : ' · payout account not ready'}`}
                  detail={c.lastError ? `Last try: ${c.lastError}` : undefined}
                  trailing={
                    busy === c.id
                      ? <Text style={[styles.action, { color: t.text3 }]}>Working…</Text>
                      : c.payingAt
                        ? <StatusDot label="Paying" color={WARNING_AMBER} />
                        : <Text style={[styles.action, { color: t.accent }]}>Pay</Text>
                  }
                  chevron={false}
                  onPress={() => askCashout(c)}
                />
              ))}
            </AdminSection>
          )
        ) : null}

        {tab === 'history' ? (
          history === null ? loadingList : history.length === 0 ? (
            <EmptyState icon="clock" title="No history yet" subtitle="Approvals and settled cash-outs will appear here." />
          ) : (
            <AdminSection label="Recent">
              {history.map((h) => (
                <AdminRow
                  key={`${h.kind}-${h.id}`}
                  icon={h.kind === 'approval' ? 'check' : 'wallet'}
                  title={h.kind === 'approval' ? `${h.name} approved` : `${dollars(h.amountCents ?? 0)} · ${h.name}`}
                  subtitle={when(h.at)}
                  trailing={
                    h.kind === 'cashout'
                      ? <StatusDot label={h.status === 'paid' ? 'Paid' : 'Returned'} color={h.status === 'paid' ? t.good : t.text3} />
                      : undefined
                  }
                  chevron={false}
                />
              ))}
            </AdminSection>
          )
        ) : null}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 13, paddingBottom: 24 },
  loading: { gap: 10 },
  action: { fontSize: 14, fontWeight: '700' },
});

export default function AdminAmbassadors() {
  return (
    <AdminMfaGate>
      <AdminAmbassadorsScreen />
    </AdminMfaGate>
  );
}
