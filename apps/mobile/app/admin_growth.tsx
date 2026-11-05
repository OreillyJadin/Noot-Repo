import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, type AdminCourseRequest, type GrowthFunnel } from '@noot/core';
import { Body, Button, Chip, NavTop, Screen, Skeleton, useTheme } from '@noot/ui';
import { AdminMfaGate } from '../lib/AdminMfaGate';
import { AdminRow, AdminSection } from '../lib/adminUi';

function GrowthScreen() {
  const t = useTheme();
  const router = useRouter();
  const [range, setRange] = useState<7 | 30 | null>(30);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<GrowthFunnel | null>(null);
  const [error, setError] = useState(false);
  const [courseRequests, setCourseRequests] = useState<AdminCourseRequest[] | null>(null);
  const [courseRequestsError, setCourseRequestsError] = useState(false);
  useEffect(() => {
    let active = true;
    const until = new Date();
    const since = range ? new Date(until.getTime() - range * 86400000).toISOString() : null;
    api.admin.growthFunnel(since, until.toISOString())
      .then((value) => { if (active) setData(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [range, retry]);
  useEffect(() => {
    let active = true;
    api.admin.courseRequests()
      .then((value) => { if (active) setCourseRequests(value); })
      .catch(() => { if (active) setCourseRequestsError(true); });
    return () => { active = false; };
  }, []);
  const selectRange = (days: 7 | 30 | null) => {
    if (days === range) return;
    setData(null);
    setError(false);
    setRange(days);
  };
  const reload = () => {
    setData(null);
    setError(false);
    setRetry((value) => value + 1);
  };
  const steps: [string, number][] = data ? [
    ['Signed up', data.signups], ['Onboarded', data.onboarded], ['Searched', data.searchers],
    ['Viewed a tutor', data.profileViewers], ['Started booking', data.bookingStarters],
    ['Requested a booking', data.requesters], ['Booking accepted', data.acceptedStudents],
    ['Completed a session', data.completedStudents], ['Reviewed a session', data.reviewedStudents],
  ] : [];
  return (
    <Screen>
      <NavTop title="Growth funnel" onBack={() => router.back()} />
      <Body pad={20} contentStyle={{ gap: 20, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([7, 30, null] as const).map((days) => (
            <Chip key={days ?? 'all'} label={days ? `${days}d` : 'All'} on={range === days} onPress={() => selectRange(days)} />
          ))}
        </View>
        {error ? <View style={{ gap: 12 }}><Text style={{ color: t.text2 }}>Could not load growth data.</Text><Button label="Retry" onPress={reload} /></View> : !data ? <Skeleton height={220} /> : (
          <>
            <AdminSection label="North star · rebook rate">
              <AdminRow title={`${(data.rebook.rate * 100).toFixed(1)}%`} titleStyle={{ color: t.accent, fontSize: 30 }} subtitle={`${data.rebook.students} of ${data.rebook.completers} students completed 2+ sessions with one tutor in this range`} subtitleLines={0} />
              <AdminRow title="All time" detail={<Text style={{ color: t.text }}>{(data.rebookAllTime.rate * 100).toFixed(1)}%</Text>} subtitle={`${data.rebookAllTime.students} of ${data.rebookAllTime.completers} completing students`} />
            </AdminSection>
            <AdminSection label="Funnel · unique people">
              {steps.map(([label, count], index) => {
                const previous = steps[index - 1]?.[1];
                return <AdminRow key={label} title={label} detail={<Text style={{ color: t.text }}>{count}</Text>} subtitle={index ? previous ? `${(count / previous * 100).toFixed(1)}% of previous step` : 'No previous-step users' : 'New accounts in range'} />;
              })}
            </AdminSection>
            <Text style={{ color: t.text3, fontSize: 12 }}>Period totals, not a linked signup cohort: returning users can make step ratios exceed 100%. Missing historical acceptance times use request time; historical completions use the last recorded update. New completions are timestamped by the server.</Text>
            <AdminSection label="Activity totals">
              {([['Searches', data.searches], ['Empty searches', data.emptySearches], ['Booking requests', data.bookingsRequested], ['Accepted', data.accepted], ['Declined / expired', data.declinedExpired], ['Other cancellations', data.cancelled], ['Completed', data.completed], ['Reviewed bookings', data.reviewed], ['Invites shared', data.invitesShared], ['Unique invite sharers', data.inviteSharers]] as [string, number][]).map(([label, count]) => <AdminRow key={label} title={label} detail={<Text style={{ color: t.text }}>{count}</Text>} />)}
            </AdminSection>
            <AdminSection label="Unmet demand · top empty searches">
              {data.emptyDemand.length ? data.emptyDemand.map((item) => <AdminRow key={item.term} title={item.term} count={item.searches} subtitle={`${item.users} unique searchers`} />) : <AdminRow title="No empty searches recorded" muted />}
            </AdminSection>
            <AdminSection label="Unmet demand · open course requests · open now">
              {courseRequestsError
                ? <AdminRow title="Could not load open course requests" muted />
                : courseRequests === null
                  ? <Skeleton height={64} />
                  : courseRequests.length
                    ? courseRequests.map((item) => (
                      <AdminRow
                        key={item.courseCode}
                        title={`${item.courseCode} · ${item.courseTitle}`}
                        count={item.requests}
                        subtitle={item.covered ? 'Tutor now available' : 'No tutor yet'}
                      />
                    ))
                    : <AdminRow title="No open course requests" muted />}
            </AdminSection>
          </>
        )}
      </Body>
    </Screen>
  );
}

export default function AdminGrowth() {
  return <AdminMfaGate><GrowthScreen /></AdminMfaGate>;
}
