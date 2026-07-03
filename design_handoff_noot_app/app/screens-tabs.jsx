// screens-tabs.jsx — student bottom-tab destinations: Saved, Sessions, Profile
const { useState: useTab } = React;

const ME = { name: 'Lindsay Thomas', first: 'Lindsay', year: 'Sophomore', major: 'Pre-Business', email: 'lindsay.t@students.edu', credits: 10 };

// Shared simple top header for tab pages with a large title
function TabHeader({ title, trailing }) {
  return (
    <div style={{ paddingTop: TOP_INSET, flexShrink: 0, padding: `${TOP_INSET}px 20px 8px`, background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <H1 style={{ fontSize: 30 }}>{title}</H1>
        {trailing}
      </div>
    </div>
  );
}

// ── SAVED ─────────────────────────────────────────────────────────────────────
function SavedTab({ go, setBooking }) {
  const saved = ['sara', 'nina', 'devon'];
  const open = (id) => { if (setBooking) setBooking(b => ({ ...b, tutor: id, course: 'MGT 300' })); go && go('b2'); };
  return (
    <Screen>
      <TabHeader title="Saved"/>
      <Body pad={20} style={{ paddingTop: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>{saved.length} tutors saved for later</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {saved.map(id => {
            const t = tutorById(id) || TUTORS[0];
            return (
              <Card key={id} onClick={() => open(id)} style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar size={48}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{t.name}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>${t.rate}<span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>/hr</span></span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 1 }}>{t.year} · {t.major}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                    <Badge tone="accentSoft">MGT 300</Badge>
                    <Badge tone="good"><Ic name="check" size={11} stroke="var(--good)" sw={3}/>Verified</Badge>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{t.sessions} sessions</span>
                  </div>
                </div>
                <Ic name="bookmark" size={19} stroke="var(--accent)" fill="var(--accent)" sw={1.6}/>
              </Card>
            );
          })}
        </div>
      </Body>
      <TabBar active="saved" go={go}/>
    </Screen>
  );
}

// ── SESSIONS ──────────────────────────────────────────────────────────────────
function SessionsTab({ go, setBooking }) {
  const store = useNootStore();
  const [tab, setTab] = useTab('upcoming');
  const upcoming = store.getUpcoming();
  const past = store.getPast();

  const message = (id) => { if (setBooking) setBooking(b => ({ ...b, tutor: id, chatWith: id })); go && go('chat'); };
  const bookAgain = (id, course) => { if (setBooking) setBooking(b => ({ ...b, tutor: id, course: course || 'MGT 300', slot: null, day: null, tag: null, message: '' })); go && go('b3'); };
  const reschedule = (id) => { if (setBooking) setBooking(b => ({ ...b, tutor: id })); go && go('xsr'); };
  const openTutor = (id) => { if (setBooking) setBooking(b => ({ ...b, tutor: id, course: 'MGT 300' })); go && go('b2'); };
  const savedIds = ['sara', 'nina', 'devon'];

  return (
    <Screen>
      <TabHeader title="Sessions"/>
      <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '8px 20px 12px', background: 'var(--bg)' }}>
        {[['upcoming', 'Upcoming'], ['past', 'Past'], ['saved', 'Saved']].map(([v, l]) => (
          <Chip key={v} on={tab === v} onClick={() => setTab(v)}>{l}</Chip>
        ))}
      </div>
      <Body pad={20} style={{ paddingTop: 4 }}>
        {tab === 'saved' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 2 }}>{savedIds.length} tutors saved for later</div>
            {savedIds.map(id => {
              const t = tutorById(id) || TUTORS[0];
              return (
                <Card key={id} onClick={() => openTutor(id)} style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Avatar size={46}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{t.name}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>${t.rate}<span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>/hr</span></span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 1 }}>{t.year} · {t.major}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                      <Badge tone="good"><Ic name="check" size={11} stroke="var(--good)" sw={3}/>Verified</Badge>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{t.sessions} sessions</span>
                    </div>
                  </div>
                  <Ic name="bookmark" size={19} stroke="var(--accent)" fill="var(--accent)" sw={1.6}/>
                </Card>
              );
            })}
          </div>
        ) : tab === 'upcoming' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {upcoming.map((s, i) => {
              const t = tutorById(s.id) || TUTORS[0];
              const online = s.where.startsWith('Online');
              return (
                <Card key={i} style={{ padding: 0, overflow: 'hidden' }}>
                  {s.soon && <div style={{ background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 700, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ic name="clock" size={13} stroke="var(--on-accent)" sw={2.2}/>Starts soon · reminder set</div>}
                  <div style={{ padding: 14 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <Avatar size={46}/>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{s.course}</div>
                      </div>
                      <Badge tone="accentSoft">{t.name.split(' ')[0]}</Badge>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text-2)' }}>
                        <Ic name="cal" size={15} stroke="var(--accent)" sw={1.8}/>{s.when}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text-2)' }}>
                        <Ic name={online ? 'video' : 'pin'} size={15} stroke="var(--accent)" sw={1.8}/>{s.where}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <Btn kind="secondary" size="sm" style={{ flex: 1 }} onClick={() => message(s.id)}><Ic name="chat" size={15} stroke="var(--text)" sw={1.8}/>Message</Btn>
                      <Btn kind="tint" size="sm" style={{ flex: 1 }} onClick={() => reschedule(s.id)}>Reschedule</Btn>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {past.map((s, i) => {
              const t = tutorById(s.id) || TUTORS[0];
              return (
                <Card key={i} style={{ padding: 14 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Avatar size={44}/>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{s.course} · {s.when}</div>
                    </div>
                    {s.rated
                      ? <Badge tone="neutral"><Ic name="check" size={11} stroke="var(--text-2)" sw={2.4}/>Rated</Badge>
                      : <Btn kind="primary" size="sm" onClick={() => go && go('c1')}>Rate</Btn>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 13 }}>
                    <Btn kind="secondary" size="sm" style={{ flex: 1 }} onClick={() => message(s.id)}><Ic name="chat" size={15} stroke="var(--text)" sw={1.8}/>Message</Btn>
                    <Btn kind="tint" size="sm" style={{ flex: 1 }} onClick={() => bookAgain(s.id, s.course)}><Ic name="plus" size={15} stroke="var(--accent)" sw={2.2}/>Book again</Btn>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Body>
      <TabBar active="sessions" go={go}/>
    </Screen>
  );
}

// ── PROFILE (decked out) ──────────────────────────────────────────────────────
function ProfileTab({ go, setTweak, tw, role, setRole }) {
  const dark = tw ? !!tw.dark : false;
  const isTutor = role === 'tutor';
  const stats = isTutor
    ? [['84', 'Sessions taught'], ['4.9', 'Avg rating'], ['112', 'Hours']]
    : [['12', 'Sessions'], ['18', 'Hours'], ['3', 'Saved']];

  const Row = ({ ic, label, sub, value, onClick, danger, last, control }) => (
    <div onClick={onClick} className={onClick ? 'tc-tap' : ''} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px',
      cursor: onClick ? 'pointer' : 'default', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: danger ? 'var(--accent-weak)' : 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Ic name={ic} size={17} stroke={danger ? 'var(--accent)' : 'var(--text-2)'} sw={1.8}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: danger ? 'var(--accent)' : 'var(--text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
      </div>
      {control}
      {value && <span style={{ fontSize: 14, color: 'var(--text-3)' }}>{value}</span>}
      {onClick && !control && <Ic name="chevR" size={17} stroke="var(--text-3)" sw={2}/>}
    </div>
  );

  return (
    <Screen>
      <div style={{ paddingTop: TOP_INSET, flexShrink: 0, padding: `${TOP_INSET}px 20px 6px`, background: 'var(--bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <H1 style={{ fontSize: 28 }}>Profile</H1>
          <button className="tc-tap" onClick={() => showToast('Settings — built with backend')} style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 36, height: 36, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Ic name="gear" size={19} stroke="var(--text-2)" sw={1.7}/>
          </button>
        </div>
      </div>
      <Body pad={20} style={{ paddingTop: 10 }}>
        {/* identity card */}
        <Card style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              <Avatar size={64} label={ME.first[0]}/>
              <button className="tc-tap" onClick={() => showToast('Change photo — built with backend')} style={{ position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', padding: 0, cursor: 'pointer',
                border: '2px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic name="edit" size={11} stroke="var(--on-accent)" sw={2.2}/>
              </button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <H2 style={{ fontSize: 19 }}>{ME.name}</H2>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{ME.year} · {ME.major}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
                <Ic name="shield2" size={13} stroke="var(--good)" sw={1.9}/>
                <span style={{ fontSize: 12, color: 'var(--good)', fontWeight: 600 }}>{isTutor ? 'Verified tutor' : '.edu verified'}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            {stats.map(([n, l], i) => (
              <div key={l} style={{ flex: 1, textAlign: 'center', borderLeft: i ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{n}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{l}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* referral credit (student) OR payout summary (tutor) */}
        {isTutor ? (
          <Card onClick={() => showToast('Stripe payouts — built with backend')} style={{ marginTop: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--accent-weak)', border: '1px solid var(--accent-border)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic name="dollar" size={20} stroke="var(--on-accent)" sw={1.8}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>$182 next payout</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>Deposits to •••• 4521 · Fri</div>
            </div>
            <Ic name="chevR" size={17} stroke="var(--accent)" sw={2}/>
          </Card>
        ) : (
          <Card onClick={() => showToast('Referrals — built with backend')} style={{ marginTop: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--accent-weak)', border: '1px solid var(--accent-border)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic name="gift" size={20} stroke="var(--on-accent)" sw={1.7}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>${ME.credits} in credits</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>Invite a classmate, you both get $10</div>
            </div>
            <Ic name="chevR" size={17} stroke="var(--accent)" sw={2}/>
          </Card>
        )}

        {/* account */}
        <Eyebrow style={{ color: 'var(--text-3)', margin: '22px 0 10px' }}>Account</Eyebrow>
        {isTutor ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Row ic="user" label="Personal info" sub={ME.email} onClick={() => go && go('edit_personal')}/>
            <Row ic="cap" label="Courses & rates" sub="CH 101 · $25/hr, CH 102 · $30/hr" onClick={() => go && go('edit_rates')}/>
            <Row ic="cal" label="Availability" sub="Set your typical week" onClick={() => go && go('edit_availability')}/>
            <Row ic="edit" label="Edit tutor profile" sub="Photo, bio — what students see" onClick={() => go && go('edit_tutor')}/>
            <Row ic="dollar" label="Payout account" sub="Stripe · •••• 4521" onClick={() => showToast('Stripe Connect — built with backend')}/>
            <Row ic="doc" label="Earnings & payment history" onClick={() => showToast('Earnings — built with backend')} last/>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Row ic="user" label="Personal info" sub={ME.email} onClick={() => go && go('edit_personal')}/>
            <Row ic="cap" label="My courses" sub="MGT 300, EC 110" onClick={() => go && go('edit_courses')}/>
            <Row ic="cardback" label="Payment methods" sub="Visa •••• 4242" onClick={() => showToast('Payment methods — built with backend')}/>
            <Row ic="doc" label="Booking & payment history" onClick={() => showToast('History — built with backend')} last/>
          </Card>
        )}

        {/* tutor standing (tutor only) */}
        {isTutor && (
          <>
            <Eyebrow style={{ color: 'var(--text-3)', margin: '22px 0 10px' }}>Standing</Eyebrow>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <Row ic="shield2" label="Cancellation rate" sub="0 in the last 30 days" value="Good"
                onClick={() => showToast('Standing details — built with backend')}/>
              <Row ic="flame" label="Response time" sub="Usually within 2 hrs" onClick={() => showToast('Stats — built with backend')} last/>
            </Card>
          </>
        )}

        {/* preferences */}
        <Eyebrow style={{ color: 'var(--text-3)', margin: '22px 0 10px' }}>Preferences</Eyebrow>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Row ic="bell" label="Notifications" sub="Reminders, messages, offers" onClick={() => showToast('Notification settings — built with backend')}/>
          <Row ic="gear" label="Dark mode" control={<Toggle on={dark} onClick={() => setTweak && setTweak('dark', !dark)}/>}/>
          <Row ic="help" label="Help & support" onClick={() => showToast('Help center — built with backend')} last/>
        </Card>

        {/* mode switch — become a tutor / switch views */}
        {isTutor ? (
          <Card onClick={() => { setRole && setRole('student'); go && go('home'); }} style={{ marginTop: 22, padding: 16, display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic name="user" size={21} stroke="var(--accent)" sw={1.7}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Switch to student mode</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>Book sessions and learn from other tutors</div>
            </div>
            <Ic name="chevR" size={18} stroke="var(--text-3)" sw={2}/>
          </Card>
        ) : (
          <Card onClick={() => go && go('t1')} style={{ marginTop: 22, padding: 16, display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic name="cap" size={21} stroke="var(--accent)" sw={1.7}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Become a tutor</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>Earn money helping classmates in courses you aced</div>
            </div>
            <Ic name="chevR" size={18} stroke="var(--text-3)" sw={2}/>
          </Card>
        )}

        {/* sign out */}
        <div style={{ marginTop: 18 }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Row ic="logout" label="Sign out" danger onClick={() => go && go('landing')} last/>
          </Card>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 18 }}>noot · v1.0 · Peer tutoring for campus</div>
      </Body>
      <TabBar active={isTutor ? 'tutor_profile' : 'profile'} go={go} role={role}/>
    </Screen>
  );
}

// Role-locked entry points so a tutor can never land on the student profile (and vice-versa).
const ProfileTabStudent = (props) => <ProfileTab {...props} role="student"/>;
const ProfileTabTutor = (props) => <ProfileTab {...props} role="tutor"/>;

Object.assign(window, { SavedTab, SessionsTab, ProfileTab, ProfileTabStudent, ProfileTabTutor });
