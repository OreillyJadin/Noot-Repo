// Admin moderation queue — the "timely response" half of Guideline 1.2.
//
// Reporting is useless without somewhere for reports to land. Admin-only by RLS: a non-admin
// reading content_reports gets zero rows, so the client guard here is defence in depth.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, NavTop, Body, Card, Badge, Button, Ic, Skeleton, useTheme } from '@noot/ui';
import { api, type ContentReport } from '@noot/core';
import { useMe } from '../lib/useMe';
import { errText } from '../lib/errText';

const REASON_LABEL: Record<string, string> = {
  harassment: 'Harassment',
  inappropriate: 'Inappropriate',
  spam: 'Spam / scam',
  academic_dishonesty: 'Academic dishonesty',
  other: 'Other',
};

export default function AdminReports() {
  const t = useTheme();
  const router = useRouter();
  const { me, loading: meLoading, isAdmin } = useMe();
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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

  const resolve = async (r: ContentReport, status: 'actioned' | 'dismissed') => {
    setBusy(r.id);
    try {
      await api.admin.resolveReport(r.id, status);
      await load();
    } catch (e) {
      Alert.alert('Could not update', errText(e, 'Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <NavTop title="Reports" onBack={() => router.back()} />
      <Body>
        <Text style={[styles.intro, { color: t.text2 }]}>
          Open reports from students and tutors. Our published terms commit to acting within 24
          hours, so clear this queue daily.
        </Text>

        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={110} radius={14} />
            <Skeleton height={110} radius={14} />
          </View>
        ) : reports.length === 0 ? (
          <View style={[styles.empty, { borderColor: t.borderStrong }]}>
            <Ic name="check" size={24} color={t.good} strokeWidth={2} />
            <Text style={{ marginTop: 8, fontSize: 14, color: t.text3 }}>No open reports.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {reports.map((r) => (
              <Card key={r.id} style={styles.card}>
                <View style={styles.head}>
                  <Badge label={REASON_LABEL[r.reason] ?? r.reason} tone="accentSoft" />
                  <Text style={[styles.kind, { color: t.text3 }]}>{r.targetKind}</Text>
                </View>
                <Text style={[styles.meta, { color: t.text2 }]}>
                  Reported by <Text style={{ fontWeight: '700', color: t.text }}>{r.reporterName}</Text>
                  {r.targetName ? <> · about <Text style={{ fontWeight: '700', color: t.text }}>{r.targetName}</Text></> : null}
                </Text>
                {r.messageContent ? (
                  <View style={[styles.quote, { backgroundColor: t.surface2, borderLeftColor: t.borderStrong }]}>
                    <Text numberOfLines={4} style={{ fontSize: 13, color: t.text }}>{r.messageContent}</Text>
                  </View>
                ) : null}
                {r.detail ? <Text style={{ fontSize: 12.5, color: t.text3 }}>“{r.detail}”</Text> : null}
                <Text style={[styles.when, { color: t.text3 }]}>
                  {new Date(r.createdAt).toLocaleString()}
                </Text>
                <View style={styles.actions}>
                  <Button
                    label="Dismiss"
                    kind="secondary"
                    size="sm"
                    style={{ flex: 1 }}
                    disabled={busy === r.id}
                    onPress={() => void resolve(r, 'dismissed')}
                  />
                  <Button
                    label={busy === r.id ? '…' : 'Mark actioned'}
                    kind="primary"
                    size="sm"
                    style={{ flex: 1.3 }}
                    disabled={busy === r.id}
                    onPress={() => void resolve(r, 'actioned')}
                  />
                </View>
              </Card>
            ))}
          </View>
        )}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 19.5, marginBottom: 6 },
  card: { padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kind: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '700' },
  meta: { fontSize: 13, lineHeight: 18 },
  quote: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, borderLeftWidth: 3 },
  when: { fontSize: 11 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  empty: { paddingVertical: 28, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center' },
});
