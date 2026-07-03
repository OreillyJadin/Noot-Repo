// screens-calendar.jsx — TC · Tutor Calendar.
// Booked sessions + availability on ONE weekly surface: pick a day, then tap any
// empty time to open/close it for booking. Sessions are tappable → TB2 detail.
const { useState: useCal, useMemo: useCalMemo } = React;

const CAL_TIMES = ['9:00 AM', '10:30 AM', '12:00 PM', '1:30 PM', '3:00 PM', '4:30 PM', '6:00 PM', '7:30 PM'];

// Demo booked sessions on the tutor's calendar: DAYS index -> { time -> session }
const CAL_SESSIONS = {
  1: { '3:00 PM':  { name: 'Lindsay Thomas', av: 'L', course: 'MGT 300', where: 'Gorgas Library, Fl 2', pay: '$28', len: '1 hr' } },
  9: { '10:30 AM': { name: 'Marcus B.',      av: 'M', course: 'MGT 300', where: 'Online — Integrated Video', pay: '$28', len: '1 hr' } },
};

// Start from the same deterministic availability generator the booking flow uses (T5 calendar)
function calInitOpen() {
  const base = slotsFor(1);
  const map = {};
  for (let d = 0; d < 14; d++) map[d] = new Set(base[d] || []);
  return map;
}

function TutorCalendar({ go, setBooking }) {
  const [week, setWeek] = useCal(0);           // 0 = this week · 1 = next week
  const [day, setDay] = useCal(1);             // selected index into DAYS
  const [open, setOpen] = useCal(calInitOpen);
  const days = DAYS.slice(week * 7, week * 7 + 7);
  const sessions = CAL_SESSIONS[day] || {};
  const openSet = open[day] || new Set();
  const dayObj = DAYS.find(d => d.i === day) || DAYS[0];

  const toggle = (time) => {
    setOpen(prev => {
      const next = { ...prev, [day]: new Set(prev[day]) };
      if (next[day].has(time)) next[day].delete(time); else next[day].add(time);
      return next;
    });
  };
  const pickWeek = (w) => { setWeek(w); setDay(w * 7); };
  const openDetail = () => { if (setBooking) setBooking(b => ({ ...b, tutor: 'sara' })); go('tb2'); };

  const stats = useCalMemo(() => {
    let o = 0, b = 0;
    days.forEach(d => {
      o += (open[d.i] || new Set()).size;
      b += Object.keys(CAL_SESSIONS[d.i] || {}).length;
    });
    return { o, b };
  }, [open, week]);

  return (
    <Screen>
      <div style={{ paddingTop: TOP_INSET, flexShrink: 0, padding: `${TOP_INSET}px 20px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <H2 style={{ fontSize: 22 }}>Calendar</H2>
          <Gecko size={18} tone="sage" />
        </div>
        {/* week switch */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--field-radius)', margin: '14px 0 12px' }}>
          {[['0', 'This week'], ['1', 'Next week']].map(([v, l]) => {
            const on = week === Number(v);
            return (
              <div key={v} onClick={() => pickWeek(Number(v))} className="tc-tap" style={{ flex: 1, textAlign: 'center', padding: '9px 0', cursor: 'pointer',
                borderRadius: 'calc(var(--field-radius) - 2px)', fontSize: 14, fontWeight: 600, background: on ? 'var(--surface)' : 'transparent',
                color: on ? 'var(--text)' : 'var(--text-3)', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>{l}</div>
            );
          })}
        </div>
        {/* day strip — dot = booked session, count = open times */}
        <div style={{ display: 'flex', gap: 6 }}>
          {days.map(d => {
            const on = day === d.i;
            const booked = Object.keys(CAL_SESSIONS[d.i] || {}).length > 0;
            const nOpen = (open[d.i] || new Set()).size;
            return (
              <div key={d.i} onClick={() => setDay(d.i)} className="tc-tap"
                style={{ flex: 1, padding: '8px 0 7px', borderRadius: 13, textAlign: 'center', cursor: 'pointer',
                  background: on ? 'var(--accent)' : 'var(--surface)', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}` }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: on ? 'var(--on-accent)' : 'var(--text-3)' }}>{d.dow}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: on ? 'var(--on-accent)' : 'var(--text)', marginTop: 1 }}>{d.dom}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 4, height: 6 }}>
                  {booked && <span style={{ width: 5, height: 5, borderRadius: '50%', background: on ? 'var(--on-accent)' : 'var(--accent)' }}></span>}
                  {nOpen > 0 && <span style={{ width: 5, height: 5, borderRadius: '50%', background: on ? 'rgba(255,255,255,0.55)' : 'var(--good)', opacity: 0.9 }}></span>}
                </div>
              </div>
            );
          })}
        </div>
        {/* weekly summary */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 4px' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            <strong style={{ color: 'var(--text)' }}>{stats.b}</strong> booked · <strong style={{ color: 'var(--text)' }}>{stats.o}</strong> open this week
          </span>
          <span onClick={() => showToast('Availability copied to next week')} className="tc-tap"
            style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>Copy to next week</span>
        </div>
      </div>

      <Body pad={20} style={{ paddingTop: 12 }}>
        <Label style={{ fontSize: 13, marginBottom: 10 }}>{dayObj.label}</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CAL_TIMES.map(time => {
            const s = sessions[time];
            const isOpen = openSet.has(time);
            return (
              <div key={time} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 60, flexShrink: 0, fontSize: 12, fontWeight: 600, textAlign: 'right',
                  color: s ? 'var(--text)' : isOpen ? 'var(--text-2)' : 'var(--text-3)' }}>{time}</div>
                {s ? (
                  <Card onClick={openDetail} style={{ flex: 1, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Avatar size={36} label={s.av} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--good)', flexShrink: 0 }}>{s.pay}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                        <Ic name={s.where.startsWith('Online') ? 'video' : 'pin'} size={12} stroke="var(--accent)" sw={1.8} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.course} · {s.len}</span>
                      </div>
                    </div>
                    <Ic name="chevR" size={16} stroke="var(--text-3)" sw={2} />
                  </Card>
                ) : (
                  <div onClick={() => toggle(time)} className="tc-tap"
                    style={{ flex: 1, minHeight: 46, borderRadius: 12, cursor: 'pointer', padding: '0 14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: isOpen ? 'var(--accent-weak)' : 'var(--surface)',
                      border: isOpen ? '1.5px solid var(--accent-border)' : '1.5px dashed var(--border-strong)',
                      opacity: isOpen ? 1 : 0.6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: isOpen ? 'var(--accent)' : 'var(--text-3)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOpen ? 'var(--good)' : 'var(--border-strong)' }}></span>
                      {isOpen ? 'Open for booking' : 'Closed'}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{isOpen ? 'Tap to close' : 'Tap to open'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16, padding: '0 2px' }}>
          <Ic name="bolt" size={14} stroke="var(--accent)" sw={1.8} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>Open times are instantly bookable by students. Booked sessions can be rescheduled from their detail view.</span>
        </div>
      </Body>
      <TabBar active="tutor_calendar" go={go} role="tutor" />
    </Screen>
  );
}

Object.assign(window, { TutorCalendar });
