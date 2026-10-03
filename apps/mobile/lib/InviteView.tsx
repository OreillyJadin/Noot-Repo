// The body of the invite screens: "Refer a friend" (/invite, everyone) and the ambassador
// Referrals tab (/ambassador_referrals). Each screen supplies its own header, scroll view
// and pull-to-refresh, and passes `reloadKey` to re-fetch.
//
// Everyone: your invite code, your Noot credit, and the people you invited with whether
// they've completed a session yet ($5 credit each when they do — 0040).
// Ambassadors also see their goals (ambassador_milestones) and cash-out, both of which only
// pay once the team has approved them; credit earned in the last 7 days can't be cashed out.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Share, Alert, StyleSheet } from 'react-native';
import { Card, Badge, Avatar, Ic, Eyebrow, Skeleton, EmptyState, useTheme, type IconName } from '@noot/ui';
import { api, type Invite, type Milestone } from '@noot/core';
import { useMe } from './useMe';
import { SITE_URL } from './legal';
import { errText } from './errText';

const CASHOUT_MIN_CENTS = 1000; // request_credit_cashout's minimum

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;

export function InviteView({ reloadKey = 0 }: { reloadKey?: number }) {
  const t = useTheme();
  const { isAmbassador } = useMe();
  const [code, setCode] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [approved, setApproved] = useState<boolean | null>(null); // null = not known yet
  const [cashable, setCashable] = useState(0);
  const [paidGoals, setPaidGoals] = useState<Set<number>>(new Set()); // thresholds actually credited
  const [cashingOut, setCashingOut] = useState(false);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let alive = true;
    api.credits.myCode().then((c) => { if (alive) setCode(c); }).catch(() => { if (alive) setCode(''); });
    api.credits.balance().then((b) => { if (alive) setBalance(b); }).catch(() => { if (alive) setBalance(0); });
    api.credits.invites().then((l) => { if (alive) setInvites(l); }).catch(() => { if (alive) setInvites([]); });
    if (isAmbassador) {
      api.credits.milestones().then((m) => { if (alive) setMilestones(m); }).catch(() => {});
      api.credits.ambassadorApproved().then((a) => { if (alive) setApproved(a); }).catch(() => {});
      api.credits.cashable().then((c) => { if (alive) setCashable(c); }).catch(() => {});
      api.credits
        .history()
        .then((h) => {
          if (alive) setPaidGoals(new Set(h.filter((e) => e.kind === 'milestone_bonus').map((e) => e.milestone ?? 0)));
        })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [reloadKey, bump, isAmbassador]);

  const share = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: `Join me on noot — book a tutor who already aced your course. Use my invite code ${code} when you sign up: ${SITE_URL}`,
      });
    } catch {
      /* user dismissed the sheet */
    }
  };

  // Counts toward goals the same way the server does: refunded/disputed sessions don't.
  const completed = (invites ?? []).filter((i) => i.completed && !i.reversed).length;
  const nextGoal = milestones.find((m) => m.threshold > completed);

  const cashOut = () => {
    if (cashable < CASHOUT_MIN_CENTS) return;
    Alert.alert(
      `Cash out ${dollars(cashable)}?`,
      'That much comes off your credit balance and the noot team will be in touch to send you the money.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cash out',
          onPress: async () => {
            setCashingOut(true);
            try {
              await api.credits.requestCashout(cashable);
              Alert.alert('Cash-out requested', 'We’ll be in touch to send it to you.');
              setBump((n) => n + 1);
            } catch (e) {
              Alert.alert('Could not cash out', errText(e, 'Please try again.'));
            } finally {
              setCashingOut(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View>
      {/* balance */}
      <View style={[styles.balance, { backgroundColor: t.accent }]}>
        <Text style={[styles.balanceLabel, { color: t.onAccent }]}>NOOT CREDIT</Text>
        <Text style={[styles.balanceValue, { color: t.onAccent }]}>{balance == null ? '—' : dollars(balance)}</Text>
        <Text style={[styles.balanceSub, { color: t.onAccent }]}>
          {isAmbassador ? 'Use it on sessions or cash it out' : 'Comes off your next session automatically'}
        </Text>
      </View>

      {/* code + share */}
      <Card style={{ padding: 20, alignItems: 'center', marginTop: 12 }}>
        <Eyebrow style={{ color: t.text3 }}>Your invite code</Eyebrow>
        {code === '' ? (
          <Text style={[styles.code, { color: t.text3 }]}>—</Text>
        ) : code ? (
          // One line that shrinks to fit (tracker A1). Selectable, so a long-press copies it.
          <Text
            selectable
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            accessibilityLabel={`Your invite code, ${code.split('').join(' ')}`}
            style={[styles.code, { color: t.accent }]}
          >
            {code}
          </Text>
        ) : (
          <Skeleton width={180} height={34} style={{ marginTop: 8 }} />
        )}
        <Pressable
          onPress={share}
          disabled={!code}
          style={[styles.shareBtn, { backgroundColor: code ? t.accent : t.surface2 }]}
        >
          <Ic name="send" size={18} color={code ? t.onAccent : t.text3} strokeWidth={1.9} />
          <Text style={[styles.shareLabel, { color: code ? t.onAccent : t.text3 }]}>Invite a friend</Text>
        </Pressable>
      </Card>

      <Card flat style={{ ...styles.how, backgroundColor: t.surfaceAlt }}>
        <Eyebrow style={{ color: t.text3, marginBottom: 12 }}>How it works</Eyebrow>
        {([
          ['user', 'Your friend signs up and enters your code'],
          ['cap', 'They complete a session on noot'],
          ['gift', 'You get $5 in Noot credit'],
        ] as [IconName, string][]).map(([ic, label]) => (
          <View key={label} style={styles.step}>
            <View style={[styles.stepIcon, { backgroundColor: t.accentWeak }]}>
              <Ic name={ic} size={16} color={t.accent} strokeWidth={1.8} />
            </View>
            <Text style={[styles.stepText, { color: t.text2 }]}>{label}</Text>
          </View>
        ))}
      </Card>

      {/* ambassador goals + cash-out */}
      {isAmbassador ? (
        <>
          <Eyebrow style={{ color: t.text3, marginTop: 22, marginBottom: 10 }}>Ambassador goals</Eyebrow>
          {approved === false ? (
            <Card flat style={{ padding: 14, marginBottom: 10, backgroundColor: t.surfaceAlt }}>
              <Text style={[styles.goalTitle, { color: t.text }]}>Pending team approval</Text>
              <Text style={[styles.goalSub, { color: t.text3 }]}>
                You earn $5 credit per completed invite now. Goal bonuses and cash-out start once the noot team approves you as an ambassador.
              </Text>
            </Card>
          ) : null}
          <Card style={{ padding: 16 }}>
            {nextGoal ? (
              <>
                <Text style={[styles.goalTitle, { color: t.text }]}>
                  Next: {nextGoal.threshold} completed invites → {dollars(nextGoal.bonusCents)} bonus
                </Text>
                <View style={[styles.track, { backgroundColor: t.surface2 }]}>
                  <View
                    style={[styles.fill, { backgroundColor: t.accent, width: `${Math.min(100, (completed / nextGoal.threshold) * 100)}%` }]}
                  />
                </View>
                <Text style={[styles.goalSub, { color: t.text3 }]}>{completed} of {nextGoal.threshold} so far</Text>
              </>
            ) : milestones.length ? (
              <Text style={[styles.goalTitle, { color: t.text }]}>You’ve hit every goal — thank you!</Text>
            ) : (
              <Skeleton height={40} />
            )}
            <View style={{ marginTop: 12, gap: 8 }}>
              {milestones.map((m) => {
                // Ticked once that goal's bonus is actually credited.
                const hit = paidGoals.has(m.threshold);
                return (
                  <View key={m.threshold} style={styles.goalRow}>
                    <Ic name={hit ? 'check' : 'target'} size={16} color={hit ? t.good : t.text3} strokeWidth={2} />
                    <Text style={[styles.goalRowText, { color: hit ? t.text : t.text2 }]}>
                      {m.threshold} completed invites
                    </Text>
                    <Text style={[styles.goalRowAmt, { color: hit ? t.good : t.text2 }]}>{dollars(m.bonusCents)}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
          <Pressable
            onPress={cashOut}
            disabled={cashingOut || cashable < CASHOUT_MIN_CENTS}
            style={[styles.cashBtn, { borderColor: t.border, backgroundColor: t.surface }]}
          >
            <Ic name="wallet" size={18} color={t.accent} strokeWidth={1.8} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cashTitle, { color: t.text }]}>{cashingOut ? 'Requesting…' : 'Cash out credit'}</Text>
              <Text style={[styles.cashSub, { color: t.text3 }]}>
                {approved === null
                  ? ' '
                  : !approved
                    ? 'Opens once the team approves you'
                    : cashable >= CASHOUT_MIN_CENTS
                      ? `${dollars(cashable)} available now`
                      : `Available at ${dollars(CASHOUT_MIN_CENTS)}+ · credit earned this week unlocks after 7 days`}
              </Text>
            </View>
          </Pressable>
        </>
      ) : null}

      {/* people you invited */}
      <Eyebrow style={{ color: t.text3, marginTop: 22, marginBottom: 10 }}>People you invited</Eyebrow>
      {invites == null ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={64} radius={16} />
          <Skeleton height={64} radius={16} />
        </View>
      ) : invites.length === 0 ? (
        <EmptyState
          icon="gift"
          title="No invites yet"
          subtitle="Share your code — friends who sign up with it show up here."
          actionLabel={code ? 'Invite a friend' : undefined}
          onAction={code ? share : undefined}
        />
      ) : (
        <View style={{ gap: 10 }}>
          {invites.map((i) => (
            <Card key={i.referralId} style={styles.row}>
              <Avatar size={42} label={i.name.charAt(0) || 'A'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.name, { color: t.text }]}>{i.name}</Text>
                <Text style={[styles.sub, { color: t.text3 }]}>
                  {i.reversed
                    ? 'Their session was refunded, so no credit'
                    : i.completed
                      ? 'Completed a session'
                      : 'Joined — your $5 comes after their first session'}
                </Text>
              </View>
              <Badge
                label={i.reversed ? 'Refunded' : i.completed ? `+${dollars(i.rewardCents)}` : 'Joined'}
                tone={i.completed && !i.reversed ? 'good' : 'neutral'}
              />
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  balance: { borderRadius: 20, padding: 18 },
  balanceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, opacity: 0.9 },
  balanceValue: { fontSize: 40, fontWeight: '800', marginTop: 4 },
  balanceSub: { fontSize: 12.5, opacity: 0.9, marginTop: 2 },
  code: { fontSize: 30, fontWeight: '700', letterSpacing: 1, marginTop: 8, alignSelf: 'stretch', textAlign: 'center' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, height: 48, borderRadius: 14, alignSelf: 'stretch' },
  shareLabel: { fontSize: 15, fontWeight: '700' },
  how: { marginTop: 12, padding: 16 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  stepIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontSize: 14 },
  goalTitle: { fontSize: 14.5, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  goalSub: { fontSize: 12, marginTop: 6 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalRowText: { flex: 1, fontSize: 13.5 },
  goalRowAmt: { fontSize: 13.5, fontWeight: '700' },
  cashBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginTop: 10 },
  cashTitle: { fontSize: 14.5, fontWeight: '700' },
  cashSub: { fontSize: 12, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12.5, marginTop: 1 },
});
