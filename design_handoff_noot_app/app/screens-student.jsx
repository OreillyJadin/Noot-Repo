// screens-student.jsx — student branch (Profile setup, Home / Search)
const { useState: useStateS } = React;

// ── S5 · STUDENT PROFILE SETUP ───────────────────────────────────────────────
function StudentProfile({ go, back }) {
  const [courses, setCourses] = useStateS(['CH 101', 'MGT 300']);
  return (
    <Screen>
      <NavTop onBack={back} title="Your profile"
        trailing={<span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>3 of 3</span>}/>
      <Body pad={20}>
        <ProgressDots total={3} current={3} style={{ marginBottom: 22 }}/>
        <Eyebrow style={{ color: 'var(--text-3)' }}>Required</Eyebrow>
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <Field label="First name" value="Lindsay" style={{ flex: 1 }}/>
          <Field label="Last name" value="Thomas" style={{ flex: 1 }}/>
        </div>
        <Select style={{ marginTop: 14 }} label="Year" value="Sophomore" options={window.YEAR_OPTIONS}/>
        <Field style={{ marginTop: 14 }} label="Major" placeholder="Search UA majors…"
          suffix={<Ic name="search" size={18} stroke="var(--text-3)" sw={1.8}/>}/>

        <Divider style={{ margin: '22px 0 16px' }}/>

        <Eyebrow style={{ color: 'var(--text-3)' }}>Optional</Eyebrow>
        <Label style={{ marginTop: 10 }}>Current courses</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {courses.map(c => (
            <Chip key={c} tint>{c}
              <Ic name="x" size={13} stroke="var(--accent)" sw={2.2} style={{ marginLeft: 2 }}/>
            </Chip>
          ))}
          <Chip onClick={() => showToast('Course search \u2014 built with backend')}><Ic name="plus" size={14} stroke="var(--text-2)" sw={2.2}/>Add course</Chip>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 10, lineHeight: 1.4 }}>
          Helps us match tutors who took your exact classes — same professor when we can.
        </div>
      </Body>
      <ActionBar>
        <Btn kind="primary" full onClick={() => go('home')} iconRight="chevron">Complete profile</Btn>
      </ActionBar>
    </Screen>
  );
}

// ── Tutor result row ─────────────────────────────────────────────────────────
// (defined below, before StudentHome)

// Tutor result row — no public star rating; sessions as the credibility signal
function TutorRow({ id, name, meta, course, sessions, rate, onClick }) {
  return (
    <Card onClick={onClick} style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
      <Avatar size={46}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{name}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{rate}<span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>/hr</span></div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{meta}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <Badge tone="accentSoft">{course}</Badge>
          <Badge tone="good"><Ic name="check" size={11} stroke="var(--good)" sw={3}/>Verified</Badge>
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>{sessions} sessions</span>
        </div>
      </div>
    </Card>
  );
}

// ── S6 · HOME / SEARCH (browse-first; hub into the booking flow) ─────────────
function StudentHome({ go, setBooking }) {
  const [tab, setTab] = useStateS(0);
  const cats = ['For you', 'Business', 'STEM', 'Humanities'];
  // Per-college tutor sets so switching tabs changes who you see
  const BY_CAT = {
    'For you': { title: 'Popular this week', course: 'MGT 300',
      rows: [['Sara W.', 'sara', 'Senior · Management', 'MGT 300', '48', '$28'], ['Devon R.', 'devon', 'Grad · MBA', 'MGT 300', '71', '$34'], ['Maya P.', 'maya', 'Junior · Marketing', 'MGT 300', '23', '$22']] },
    'Business': { title: 'Top in Business', course: 'MGT 300',
      rows: [['Devon R.', 'devon', 'Grad · MBA', 'MGT 300', '71', '$34'], ['Maya P.', 'maya', 'Junior · Marketing', 'MKT 300', '23', '$22'], ['Alex T.', 'alex', 'Senior · Accounting', 'ACC 210', '39', '$26']] },
    'STEM': { title: 'Top in STEM', course: 'CH 101',
      rows: [['Priya N.', 'priya', 'Senior · Chemistry', 'CH 101', '62', '$30'], ['Jordan K.', 'jordan', 'Grad · Biology', 'BSC 114', '55', '$32'], ['Sam O.', 'sam', 'Junior · Comp Sci', 'CS 100', '44', '$28']] },
    'Humanities': { title: 'Top in Humanities', course: 'ENGL 101',
      rows: [['Riley B.', 'riley', 'Senior · English', 'ENGL 101', '37', '$24'], ['Noah G.', 'noah', 'Grad · History', 'HIST 100', '29', '$26'], ['Ivy L.', 'ivy', 'Junior · Psychology', 'PSY 101', '41', '$22']] },
  };
  const cur = BY_CAT[cats[tab]];
  const openTutor = (id, course) => { if (setBooking) setBooking(b => ({ ...b, tutor: id, course: course || cur.course })); go && go('b2'); };
  const openSearch = () => { go && go('b1'); };
  return (
    <Screen>
      <div style={{ paddingTop: TOP_INSET, flexShrink: 0, padding: `${TOP_INSET}px 20px 6px` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Welcome back</div>
            <H2 style={{ fontSize: 22 }}>Hey, Lindsay</H2>
          </div>
          <Avatar size={40}/>
        </div>
        <div onClick={openSearch} className="tc-tap">
          <Field placeholder="What class? e.g. MGT 300" onClick={openSearch}
            prefix={<Ic name="search" size={18} stroke="var(--text-3)" sw={1.8}/>}
            suffix={<Ic name="sliders" size={18} stroke="var(--accent)" sw={1.8}/>}/>
        </div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', gap: 18, padding: '12px 20px 0', borderBottom: '1px solid var(--border)' }}>
        {cats.map((c, i) => (
          <div key={c} onClick={() => setTab(i)} className="tc-tap" style={{ fontSize: 15, fontWeight: i === tab ? 700 : 500,
            color: i === tab ? 'var(--accent)' : 'var(--text-3)', paddingBottom: 10,
            borderBottom: i === tab ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>{c}</div>
        ))}
      </div>
      <Body pad={0} style={{ paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 20px 10px' }}>
          <H2 style={{ fontSize: 18 }}>{tab === 0 ? 'Popular this week' : cats[tab]}</H2>
          <span onClick={openSearch} className="tc-tap" style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>See all</span>
        </div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 20px 8px' }} className="tc-scroll">
          {cur.rows.map(([n, id, , course]) => (
            <Card key={id} onClick={() => openTutor(id, course)} style={{ minWidth: 132, flexShrink: 0, padding: 14 }}>
              <Avatar size={40}/>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginTop: 10 }}>{n}</div>
              <Badge tone="accentSoft" style={{ marginTop: 6 }}>{course}</Badge>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--good)' }}>
                <Ic name="check" size={13} stroke="var(--good)" sw={2.6}/>Verified
              </div>
            </Card>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '20px 20px 10px' }}>
          <H2 style={{ fontSize: 18 }}>{cur.title}</H2>
          <span onClick={openSearch} className="tc-tap" style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>See all</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 20px 8px' }}>
          {cur.rows.map(([n, id, meta, course, sessions, rate]) => (
            <TutorRow key={id} onClick={() => openTutor(id, course)} name={n} meta={meta} course={course} sessions={sessions} rate={rate}/>
          ))}
        </div>
      </Body>
      <TabBar active="student_home" go={go}/>
    </Screen>
  );
}

Object.assign(window, { StudentProfile, StudentHome, TutorRow });
