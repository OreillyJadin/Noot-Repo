// screens-home.jsx — branded Home hubs (Option B).
// StudentHomeFeed = study hub (live countdown + streak/goals + continue).
// TutorHome = lightweight tutor dashboard. TutorSessions = tutor's session list.
const { useState: useHome, useEffect: useHomeEff } = React;

function moneyH(n) {return '$' + n.toFixed(2).replace('.00', '');}

// Live countdown to a target Date → { d, h, m }
function useCountdown(target) {
  const [now, setNow] = useHome(Date.now());
  useHomeEff(() => {const id = setInterval(() => setNow(Date.now()), 30000);return () => clearInterval(id);}, []);
  let ms = Math.max(0, target - now);
  const d = Math.floor(ms / 86400000);ms -= d * 86400000;
  const h = Math.floor(ms / 3600000);ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  return { d, h, m };
}
// Next occurrence of tomorrow at 15:00 (demo target for the countdown)
function nextTarget(hoursOut = 27) {return Date.now() + hoursOut * 3600000;}

function CountdownPills({ target }) {
  const { d, h, m } = useCountdown(target);
  const parts = [[d, 'days'], [h, 'hrs'], [m, 'min']];
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {parts.map(([v, l]) =>
      <div key={l} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 12, background: 'rgba(255,255,255,0.16)' }}>
          <div style={{ fontFamily: 'var(--heading-font)', fontWeight: 800, fontSize: 22, color: 'var(--on-accent)', lineHeight: 1 }}>{String(v).padStart(2, '0')}</div>
          <div style={{ fontSize: 10, color: 'var(--on-accent)', opacity: 0.85, marginTop: 3, letterSpacing: '0.06em' }}>{l.toUpperCase()}</div>
        </div>
      )}
    </div>);

}

function StatCard({ ic, big, label, tint }) {
  return (
    <div style={{ flex: 1, padding: '13px 12px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ width: 30, height: 30, borderRadius: 9, background: tint || 'var(--accent-weak)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Ic name={ic} size={16} stroke="var(--accent)" sw={1.9} />
      </div>
      <div style={{ fontFamily: 'var(--heading-font)', fontWeight: 800, fontSize: 20, color: 'var(--text)', lineHeight: 1 }}>{big}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.3 }}>{label}</div>
    </div>);

}

// ── STUDENT HOME · study hub ──────────────────────────────────────────────────
function StudentHomeFeed({ go, setBooking }) {
  const store = useNootStore();
  const up = store.getUpcoming();
  const next = up[0];
  const t = next ? tutorById(next.id) || TUTORS[0] : TUTORS[0];
  const target = React.useMemo(() => nextTarget(27), []);
  const openTutor = (id, course) => {if (setBooking) setBooking((b) => ({ ...b, tutor: id, course: course || 'MGT 300' }));go('b2');};
  const openChat = () => {if (setBooking) setBooking((b) => ({ ...b, tutor: t.id, chatWith: t.id }));go('chat');};
  const goalDone = 3,goalTotal = 5;
  const pop = [['Sara W.', 'sara', 'Senior · Management', 'MGT 300', '$28'], ['Devon R.', 'devon', 'Grad · MBA', 'MGT 300', '$34'], ['Priya N.', 'priya', 'Senior · Chemistry', 'CH 101', '$30']];
  return (
    <Screen>
      <div style={{ paddingTop: TOP_INSET, flexShrink: 0, padding: `${TOP_INSET}px 20px 8px` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Wordmark size={22}/>
          <button onClick={() => showToast('Notifications — built with backend')} className="tc-tap" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Ic name="bell" size={19} stroke="var(--text-2)" sw={1.7} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Welcome back</div>
            <H2 style={{ fontSize: 24 }}>Hey, Lindsay</H2>
          </div>
          <Gecko size={40} tone="sage" />
        </div>
      </div>
      <Body pad={20} style={{ paddingTop: 8 }}>
        {/* Next session countdown */}
        {next &&
        <div style={{ position: 'relative', borderRadius: 'var(--card-radius)', overflow: 'hidden', background: 'var(--accent)', padding: '16px 16px 16px', marginBottom: 18 }}>
            <Gecko size={120} tone="cream" style={{ position: 'absolute', right: -26, bottom: -30, opacity: 0.16, transform: 'rotate(10deg)' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--on-accent)', opacity: 0.9 }}>YOUR NEXT SESSION</span>
              <Badge tone="ink" style={{ fontSize: 10 }}>{next.course}</Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 14px', position: 'relative' }}>
              <Avatar size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-accent)' }}>{t.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--on-accent)', opacity: 0.85 }}>{next.when} · {next.where}</div>
              </div>
            </div>
            <CountdownPills target={target} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, position: 'relative' }}>
              <button onClick={openChat} className="tc-tap" style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.18)', color: 'var(--on-accent)', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Ic name="chat" size={15} stroke="currentColor" sw={1.9} />Message
              </button>
              <button onClick={() => go('sessions')} className="tc-tap" style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--surface)', color: 'var(--accent)', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 14 }}>
                Details
              </button>
            </div>
          </div>
        }

        {/* Exam radar — course-aware nudge */}
        <Card flat style={{ padding: 14, marginBottom: 18, background: 'var(--accent-weak)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic name="cap" size={20} stroke="var(--accent)" sw={1.8}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>MGT 300 exam in 10 days</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 1 }}>Sara W. has 4 open times</div>
          </div>
          <button onClick={() => { if (setBooking) setBooking((b) => ({ ...b, tutor: 'sara', course: 'MGT 300' })); go('b3'); }} className="tc-tap"
            style={{ flexShrink: 0, height: 36, padding: '0 12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--on-accent)', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 12.5 }}>Grab a slot</button>
        </Card>

        {/* Streak + goals */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <H2 style={{ fontSize: 17 }}>Your momentum</H2>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>This month</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <StatCard ic="flame" big="4 wk" label="Study streak — keep it alive!" />
          <StatCard ic="target" big={`${goalDone}/${goalTotal}`} label="Sessions toward your goal" />
          <StatCard ic="trophy" big="12h" label="Hours learned" />
        </div>
        {/* goal progress bar */}
        <div style={{ marginTop: 12, padding: 14, borderRadius: 16, background: 'var(--accent-weak)', border: '1px solid var(--accent-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Monthly goal · {goalDone} of {goalTotal} sessions</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{Math.round(goalDone / goalTotal * 100)}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${goalDone / goalTotal * 100}%`, height: '100%', borderRadius: 4, background: 'var(--accent)' }} />
          </div>
        </div>

        {/* Continue / popular */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '24px 0 12px' }}>
          <H2 style={{ fontSize: 17 }}>Pick up where you left off</H2>
          <span onClick={() => go('student_home')} className="tc-tap" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>Browse</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pop.map(([n, id, meta, course, rate]) =>
          <TutorRow key={id} onClick={() => openTutor(id, course)} name={n} meta={meta} course={course} sessions="—" rate={rate} />
          )}
        </div>
      </Body>
      <TabBar active="home" go={go} role="student" />
    </Screen>);

}

// ── TUTOR HOME · lightweight dashboard ────────────────────────────────────────
function TutorHome({ go, setBooking }) {
  const target = React.useMemo(() => nextTarget(20), []);
  const openChat = () => {if (setBooking) setBooking((b) => ({ ...b, tutor: 'sara' }));go('chat_tutor');};
  return (
    <Screen>
      <div style={{ paddingTop: TOP_INSET, flexShrink: 0, padding: `${TOP_INSET}px 20px 8px` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Wordmark size={22}/>
          <Badge tone="good"><Ic name="check" size={11} stroke="var(--good)" sw={3} />Verified</Badge>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Tutor dashboard</div>
            <H2 style={{ fontSize: 24 }}>Hey, Lindsay</H2>
          </div>
          <Gecko size={40} tone="sage" />
        </div>
      </div>
      <Body pad={20} style={{ paddingTop: 8 }}>
        {/* Next session + payout */}
        <div style={{ position: 'relative', borderRadius: 'var(--card-radius)', overflow: 'hidden', background: 'var(--accent)', padding: '16px', marginBottom: 18 }}>
          <Gecko size={120} tone="cream" style={{ position: 'absolute', right: -26, bottom: -30, opacity: 0.16, transform: 'rotate(10deg)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--on-accent)', opacity: 0.9 }}>YOUR NEXT SESSION</span>
            <Badge tone="ink" style={{ fontSize: 10 }}>MGT 300</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0 14px', position: 'relative' }}>
            <Avatar size={40} label="L" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--on-accent)' }}>Lindsay Thomas</div>
              <div style={{ fontSize: 12.5, color: 'var(--on-accent)', opacity: 0.85 }}>Tomorrow · 3:00 PM · Gorgas Library</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--on-accent)' }}>$28</div>
              <div style={{ fontSize: 10, color: 'var(--on-accent)', opacity: 0.8 }}>payout</div>
            </div>
          </div>
          <CountdownPills target={target} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, position: 'relative' }}>
            <button onClick={openChat} className="tc-tap" style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.18)', color: 'var(--on-accent)', fontFamily: 'var(--font)', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Ic name="chat" size={15} stroke="currentColor" sw={1.9} />Message
            </button>
            <button onClick={() => go('tb2')} className="tc-tap" style={{ flex: 1, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--surface)', color: 'var(--accent)', fontFamily: 'var(--font)', fontWeight: 700, fontSize: 14 }}>
              Details
            </button>
          </div>
        </div>

        {/* This week stats */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <H2 style={{ fontSize: 17 }}>This week</H2>
          <span onClick={() => showToast('Earnings history — built with backend')} className="tc-tap" style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>Earnings →</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <StatCard ic="dollar" big="$182" label="Earned this week" />
          <StatCard ic="cap" big="6" label="Sessions taught" />
          <StatCard ic="flame" big="4.9" label="Avg rating (noot)" />
        </div>

        {/* Quick actions */}
        <Eyebrow style={{ color: 'var(--text-3)', margin: '22px 0 10px' }}>Manage</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[['cal', 'Set your availability', 'edit_availability'], ['dollar', 'Adjust your rates', 'edit_rates'], ['user', 'Edit tutor profile', 'edit_tutor']].map(([ic, label, key]) =>
          <Card key={label} onClick={() => go(key)} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-weak)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic name={ic} size={17} stroke="var(--accent)" sw={1.8} />
              </div>
              <span style={{ flex: 1, fontSize: 15, color: 'var(--text)' }}>{label}</span>
              <Ic name="chevR" size={17} stroke="var(--text-3)" sw={2} />
            </Card>
          )}
        </div>

        {/* Recent message */}
        <Eyebrow style={{ color: 'var(--text-3)', margin: '22px 0 10px' }}>Recent message</Eyebrow>
        <Card onClick={openChat} style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Avatar size={40} label="L" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Lindsay Thomas</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>That session was super helpful, thank you!</div>
          </div>
          <Ic name="chevR" size={17} stroke="var(--text-3)" sw={2} />
        </Card>
      </Body>
      <TabBar active="tutor_home" go={go} role="tutor" />
    </Screen>);

}

// ── TUTOR SESSIONS · list ─────────────────────────────────────────────────────
function TutorSessions({ go, setBooking }) {
  const [tab, setTab] = useHome('upcoming');
  const upcoming = [
  ['Lindsay Thomas', 'L', 'MGT 300', 'Tomorrow · 3:00 PM', 'Gorgas Library, Fl 2', '$28'],
  ['Marcus B.', 'M', 'MGT 300', 'Thu Jun 25 · 10:30 AM', 'Online — Integrated Video', '$28']];

  const past = [
  ['Priya S.', 'P', 'CH 101', 'Jun 12 · 2:00 PM', '$25'],
  ['Jordan K.', 'J', 'CH 102', 'Jun 5 · 4:30 PM', '$30']];

  const openDetail = () => {if (setBooking) setBooking((b) => ({ ...b, tutor: 'sara' }));go('tb2');};
  return (
    <Screen>
      <div style={{ paddingTop: TOP_INSET, flexShrink: 0, padding: `${TOP_INSET}px 20px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <H2 style={{ fontSize: 22 }}>Your sessions</H2>
          <Gecko size={18} tone="sage" />
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--field-radius)', margin: '14px 0 4px' }}>
          {[['upcoming', 'Upcoming'], ['past', 'Past']].map(([v, l]) => {
            const on = tab === v;
            return (
              <div key={v} onClick={() => setTab(v)} className="tc-tap" style={{ flex: 1, textAlign: 'center', padding: '9px 0', cursor: 'pointer',
                borderRadius: 'calc(var(--field-radius) - 2px)', fontSize: 14, fontWeight: 600, background: on ? 'var(--surface)' : 'transparent',
                color: on ? 'var(--text)' : 'var(--text-3)', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>{l}</div>);

          })}
        </div>
      </div>
      <Body pad={20} style={{ paddingTop: 14 }}>
        {tab === 'upcoming' ?
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map(([n, av, course, when, where, pay], i) =>
          <Card key={i} onClick={openDetail} style={{ padding: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Avatar size={44} label={av} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{n}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--good)' }}>{pay}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{course} · {when}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, color: 'var(--text-2)' }}>
                      <Ic name={where.startsWith('Online') ? 'video' : 'pin'} size={13} stroke="var(--accent)" sw={1.8} />{where}
                    </div>
                  </div>
                </div>
              </Card>
          )}
          </div> :

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {past.map(([n, av, course, when, pay], i) =>
          <Card key={i} style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar size={44} label={av} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{n}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{course} · {when}</div>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>{pay}</span>
              </Card>
          )}
          </div>
        }
      </Body>
      <TabBar active="tutor_sessions" go={go} role="tutor" />
    </Screen>);

}

Object.assign(window, { StudentHomeFeed, TutorHome, TutorSessions });