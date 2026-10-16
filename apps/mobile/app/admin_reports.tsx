import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, type ContentReport } from '@noot/core';
import { Avatar, Body, Button, EmptyState, NavTop, Screen, Skeleton, useTheme } from '@noot/ui';
import { useMe } from '../lib/useMe';
import { errText } from '../lib/errText';
import { AdminTabs, safetyTabs, useAdminHubCounts } from '../lib/AdminTabs';
import { AdminMfaGate } from '../lib/AdminMfaGate';

const WARNING_AMBER = '#C2783A';
const REASON_LABEL: Record<string, string> = {
  harassment: 'Harassment',
  inappropriate: 'Inappropriate',
  spam: 'Spam / scam',
  academic_dishonesty: 'Academic dishonesty',
  other: 'Other',
};

function reportTargetName(report: ContentReport): string | undefined {
  return report.autoFlagged && report.targetKind === 'user' ? 'Deleted account' : report.targetName;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—';
}

function AdminReportsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading: meLoading, isAdmin } = useMe();
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const counts = useAdminHubCounts();

  const load = useCallback(async () => {
    try {
      setReports(await api.admin.listReports());
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!meLoading && me && !isAdmin) {
    router.replace('/home');
    return null;
  }

  const resolve = async (report: ContentReport, status: 'actioned' | 'dismissed') => {
    setBusy(report.id);
    try {
      await api.admin.resolveReport(report.id, status);
      await load();
    } catch (error) {
      Alert.alert('Could not update', errText(error, 'Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <NavTop title="Reports" onBack={() => router.back()} />
      <Body contentStyle={styles.content}>
        <AdminTabs tabs={safetyTabs(counts)} active="complaints" />
        <Text style={[styles.intro, { color: t.text2 }]}>
          Open reports from students and tutors. Our published terms commit to acting within 24 hours, so clear this queue daily.
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <Skeleton height={130} />
            <Skeleton height={130} />
          </View>
        ) : reports.length === 0 ? (
          <EmptyState icon="check" title="No open reports" subtitle="New reports will appear here." />
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: t.text3 }]}>{reports.length} open reports</Text>
            {reports.map((report) => {
              const target = reportTargetName(report);
              return (
                <View key={report.id} style={[styles.item, { backgroundColor: t.surface, borderRadius: Number.parseFloat(t.cardRadius) || 16 }]}>
                  <View style={styles.head}>
                    <Avatar size={38} label={initials(report.reporterName || target || 'Noot')} />
                    <View style={styles.person}>
                      <Text style={[styles.title, { color: t.text }]}>{REASON_LABEL[report.reason] ?? report.reason}</Text>
                      <Text style={[styles.meta, { color: t.text3 }]}>
                        {report.autoFlagged ? 'Flagged automatically' : `Reported by ${report.reporterName}`}
                        {target ? ` · about ${target}` : ''}
                        {report.messageSenderName ? ` · sent by ${report.messageSenderName}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.kind, { color: t.text3 }]}>{report.targetKind}</Text>
                  </View>

                  {report.messageContent ? (
                    <View style={[styles.quote, { backgroundColor: t.surface2 }]}>
                      <Text numberOfLines={4} style={[styles.quoteText, { color: t.text }]}>{report.messageContent}</Text>
                    </View>
                  ) : null}
                  {report.detail ? <Text style={[styles.detail, { color: t.text2 }]}>“{report.detail}”</Text> : null}

                  <View style={[styles.valueRow, { borderTopColor: t.border }]}>
                    <Text style={[styles.valueLabel, { color: t.text3 }]}>Received</Text>
                    <Text style={[styles.value, { color: t.text2 }]}>{new Date(report.createdAt).toLocaleString()}</Text>
                  </View>
                  {report.autoFlagged ? (
                    <Text style={[styles.warning, { color: WARNING_AMBER }]}>Automatically flagged for review</Text>
                  ) : null}
                  <View style={styles.actions}>
                    <Button label="Dismiss" kind="secondary" size="sm" style={{ flex: 1 }} disabled={busy === report.id} onPress={() => void resolve(report, 'dismissed')} />
                    <Button label={busy === report.id ? '…' : 'Mark actioned'} kind="primary" size="sm" style={{ flex: 1.3 }} disabled={busy === report.id} onPress={() => void resolve(report, 'actioned')} />
                  </View>
                </View>
              );
            })}
          </>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 13, paddingBottom: 24 },
  intro: { fontSize: 13, lineHeight: 19.5 },
  loading: { gap: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '600' },
  item: { padding: 14, gap: 9 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  person: { flex: 1, minWidth: 0 },
  title: { fontSize: 14.5, fontWeight: '700', textTransform: 'capitalize' },
  meta: { fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  kind: { fontSize: 10.5, fontWeight: '600', textTransform: 'uppercase' },
  quote: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10 },
  quoteText: { fontSize: 13, lineHeight: 18 },
  detail: { fontSize: 12.5, lineHeight: 18 },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, marginTop: 2 },
  valueLabel: { fontSize: 12 },
  value: { fontSize: 12, textAlign: 'right', flex: 1 },
  warning: { fontSize: 11.5, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 3 },
});

export default function AdminReports() {
  return (
    <AdminMfaGate>
      <AdminReportsScreen />
    </AdminMfaGate>
  );
}
