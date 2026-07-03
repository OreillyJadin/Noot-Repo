// screens-shared.jsx — entry + shared onboarding (Landing, Sign Up, Verified, Role)
// Each screen: ({ go, back, setRole }) => JSX. Reads kit components from window.
const { useState } = React;

// ── S1 · LANDING ────────────────────────────────────────────────────────────
function Landing({ go }) {
  const courses = [['MGT 300', 18], ['CH 101', 24], ['MATH 125', 31], ['BSC 114', 12], ['EC 110', 15]];
  const moreCourses = [['PSY 101', 22], ['CS 100', 19], ['ACC 210', 14], ['ENGL 101', 27], ['HIST 100', 9],
    ['PH 105', 11], ['BUI 201', 8], ['NUR 300', 6], ['MATH 126', 21], ['CH 102', 17]];
  const [showAll, setShowAll] = useState(false);
  return (
    <Screen>
      <div style={{ paddingTop: TOP_INSET, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: `${TOP_INSET}px 20px 0` }}>
        <Wordmark size={19}/>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="ghost" size="sm" onClick={() => go('signup')}>Log In</Btn>
          <Btn kind="primary" size="sm" onClick={() => go('signup')}>Sign Up</Btn>
        </div>
      </div>
      <Body pad={20} style={{ paddingTop: 14 }}>
        {/* Branded hero band — sage field with a faded gecko watermark */}
        <div style={{ position: 'relative', borderRadius: 'var(--card-radius)', overflow: 'hidden',
          background: 'var(--accent)', padding: '24px 20px 22px', marginBottom: 22 }}>
          <Gecko size={150} tone="cream" style={{ position: 'absolute', right: -28, bottom: -28, opacity: 0.18, transform: 'rotate(8deg)' }}/>
          <Badge tone="ink" style={{ fontSize: 11, letterSpacing: '0.08em', padding: '5px 10px' }}>.EDU VERIFIED</Badge>
          <div style={{ fontFamily: 'var(--heading-font)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--on-accent)',
            fontSize: 30, lineHeight: 1.12, marginTop: 14, position: 'relative' }}>
            Peer tutoring.<br/>Built for campus&nbsp;life.
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--on-accent)', opacity: 0.92, marginTop: 10, maxWidth: 280, position: 'relative' }}>
            Same classes, same professors, same syllabus — from students who already aced them.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Btn kind="primary" full onClick={() => go('signup')} iconRight="chevron">Sign up with .edu email</Btn>
          <Btn kind="secondary" full size="md" onClick={() => go('signup')}>I already have an account</Btn>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 30, marginBottom: 12 }}>
          <H2 style={{ fontSize: 18 }}>Popular on campus</H2>
          <span className="tc-tap" onClick={() => setShowAll(s => !s)}
            style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>{showAll ? 'Show less' : 'See all'}</span>
        </div>
        {!showAll ? (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -20px', padding: '4px 20px 8px' }} className="tc-scroll">
            {courses.map(([c, n]) => (
              <Card key={c} onClick={() => go('signup')} style={{ minWidth: 116, flexShrink: 0, padding: 14 }}>
                <div style={{ fontFamily: 'var(--heading-font)', fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>{c}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>
                  <Ic name="user" size={14} stroke="var(--accent)" sw={1.8}/>{n} tutors
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {courses.concat(moreCourses).map(([c, n]) => (
              <Card key={c} onClick={() => go('signup')} style={{ padding: 14 }}>
                <div style={{ fontFamily: 'var(--heading-font)', fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{c}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: 'var(--accent)', fontWeight: 600, fontSize: 12 }}>
                  <Ic name="user" size={13} stroke="var(--accent)" sw={1.8}/>{n} tutors
                </div>
              </Card>
            ))}
          </div>
        )}
        {showAll && (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', marginTop: 14, lineHeight: 1.4 }}>
            Don't see your course? Every UA catalog course opens up once you're in.
          </div>
        )}

        <Card flat style={{ marginTop: 16, padding: 14, background: 'var(--surface-alt)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Ic name="shield" size={22} stroke="var(--good)" sw={1.8}/>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>312 active tutors · 28 departments · all grade-verified.</div>
        </Card>
      </Body>
      <div style={{ height: BOT_INSET, flexShrink: 0 }}/>
    </Screen>
  );
}

// ── S2 · SIGN UP (email) ─────────────────────────────────────────────────────
function SignUp({ go, back }) {
  const [sent, setSent] = useState(false);
  const [wl, setWl] = useState(false);
  const [wlDone, setWlDone] = useState(false);

  if (wl) {
    return (
      <Screen>
        <NavTop onBack={() => { setWl(false); setWlDone(false); }} title="Join the waitlist"/>
        <Body pad={20}>
          {!wlDone ? (
            <>
              <H1 style={{ fontSize: 25 }}>Bring noot to your campus</H1>
              <Sub style={{ marginTop: 8 }}>Not live at your school yet? Drop your info and we'll notify you the day it opens — and count you toward getting your campus prioritized.</Sub>
              <Field style={{ marginTop: 20 }} label="Your name" placeholder="Jordan Lee" focus/>
              <Field style={{ marginTop: 14 }} label="School / university" placeholder="e.g. Auburn University"/>
              <Field style={{ marginTop: 14 }} label="Email" type="email" placeholder="you@email.com"
                prefix={<Ic name="mail" size={18} stroke="var(--text-3)" sw={1.6}/>}/>
              <Select style={{ marginTop: 14 }} label="I'd use noot as a…" placeholder="Choose one"
                options={['Student looking for tutors', 'Tutor wanting to earn', 'Both']}/>
            </>
          ) : (
            <div style={{ textAlign: 'center', paddingTop: 20 }}>
              <HeroIcon name="check" size={64}/>
              <H1 style={{ fontSize: 24, marginTop: 18 }}>You're on the list</H1>
              <Sub style={{ marginTop: 10 }}>We saved your info. You'll be first to know when noot launches at your school.</Sub>
            </div>
          )}
        </Body>
        <ActionBar>
          {!wlDone
            ? <Btn kind="primary" full onClick={() => setWlDone(true)}>Join the waitlist</Btn>
            : <Btn kind="secondary" full onClick={() => { setWl(false); setWlDone(false); }}>Back to sign up</Btn>}
        </ActionBar>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavTop onBack={back} title="Sign Up"/>
      <Body pad={20}>
        <ProgressDots total={3} current={1} style={{ marginBottom: 22 }}/>
        {!sent ? (
          <>
            <H1 style={{ fontSize: 26 }}>What's your campus email?</H1>
            <Sub style={{ marginTop: 8 }}>We'll send you a magic link to verify it's really you.</Sub>

            <Card flat style={{ marginTop: 20, padding: 14, background: 'var(--accent-weak)', border: '1px solid var(--accent-border)' }}>
              <Eyebrow style={{ fontSize: 11 }}>Why .edu?</Eyebrow>
              <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.45, marginTop: 5 }}>
                noot is closed to verified students. No bots, no scrapers, no randoms.
              </div>
            </Card>

            <Field style={{ marginTop: 20 }} label="Campus email" placeholder="yourname@students.edu" focus
              prefix={<Ic name="mail" size={18} stroke="var(--text-3)" sw={1.6}/>}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 13, color: 'var(--text-3)' }}>
              <Ic name="lock" size={14} stroke="var(--text-3)" sw={1.6}/>
              Must be a verified <strong style={{ color: 'var(--text-2)' }}>.edu</strong> address from your school
            </div>
          </>
        ) : (
          <>
            <H1 style={{ fontSize: 26 }}>Check your inbox</H1>
            <Sub style={{ marginTop: 8 }}>We sent a magic link to <strong style={{ color: 'var(--text)' }}>lindsay.t@students.edu</strong>. Tap it to continue.</Sub>
            <Card style={{ marginTop: 22, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <HeroIcon name="mail" size={60}/>
              <Btn kind="tint" full size="md" onClick={() => go('verified')} iconRight="chevron">Open the link (demo)</Btn>
              <div style={{ display: 'flex', gap: 18, fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
                <span className="tc-tap" style={{ cursor: 'pointer' }} onClick={() => setSent(false)}>Change email</span>
                <span className="tc-tap" style={{ cursor: 'pointer' }}>Resend</span>
              </div>
            </Card>
          </>
        )}
        <div onClick={() => setWl(true)} className="tc-tap" style={{ marginTop: 18, padding: 14, border: '1px dashed var(--border-strong)', borderRadius: 'var(--field-radius)',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <Ic name="pin" size={18} stroke="var(--text-3)" sw={1.6}/>
          <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>School not live yet? Join the waitlist →</span>
        </div>
      </Body>
      {!sent && (
        <ActionBar>
          <Btn kind="primary" full onClick={() => setSent(true)}>Send magic link</Btn>
        </ActionBar>
      )}
    </Screen>
  );
}

// ── S3 · EMAIL VERIFIED (roadmap preview) ────────────────────────────────────
function Verified({ go }) {
  const steps = [
    ['Tell us who you are', 'Name, year, major'],
    ['Pick your role', 'Student or tutor'],
    ['Find your first tutor', 'Browse by course'],
  ];
  return (
    <Screen>
      <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
      <Body pad={22}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, marginBottom: 22 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--good-weak)', color: 'var(--good)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic name="check" size={20} stroke="var(--good)" sw={2.6}/>
          </div>
          <H2 style={{ fontSize: 17 }}>Email verified</H2>
        </div>
        <H1 style={{ fontSize: 30, maxWidth: 300 }}>Three quick steps to get you matched.</H1>

        <div style={{ marginTop: 26 }}>
          {steps.map(([t, sub], i) => (
            <div key={t} style={{ display: 'flex', gap: 14, padding: '16px 0',
              borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
              <Stepper n={i + 1}/>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{t}</div>
                <div style={{ fontSize: 14, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Body>
      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>About 90 seconds</div>
        <Btn kind="primary" full onClick={() => go('role')} iconRight="chevron">Let's go</Btn>
      </ActionBar>
    </Screen>
  );
}

// ── S4 · ROLE SELECTION (imagery-led) ────────────────────────────────────────
function Role({ go, back, setRole }) {
  const [sel, setSel] = useState('student');
  const roles = [
    { id: 'student', title: "I'm a student", img: 'Student illustration',
      bullets: ['Search by course code', 'Filter by professor', 'Book a session in minutes'] },
    { id: 'tutor', title: 'I want to tutor', img: 'Tutor illustration',
      bullets: ['Upload grade transcript', 'Set your hourly rate', 'Earn a verified badge'] },
  ];
  const go_next = () => { setRole(sel); go(sel === 'student' ? 'student_profile' : 't1'); };
  return (
    <Screen>
      <NavTop onBack={back} title="Your role"/>
      <Body pad={20}>
        <H1 style={{ fontSize: 25 }}>How will you start?</H1>
        <Sub style={{ marginTop: 8 }}>Pick what you'll do first. One noot account holds both — you can add the other role anytime and switch modes from your profile.</Sub>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
          {roles.map(r => {
            const on = sel === r.id;
            return (
              <Card key={r.id} selected={on} onClick={() => setSel(r.id)}
                style={{ padding: 0, overflow: 'hidden', borderWidth: on ? 2 : 1 }}>
                <div style={{ position: 'relative' }}>
                  <ImgSlot h={88} label={r.img} style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--border)' }}/>
                  <div style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: '50%',
                    border: `2px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`, background: on ? 'var(--accent)' : 'var(--surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Ic name="check" size={14} stroke="var(--on-accent)" sw={3}/>}
                  </div>
                </div>
                <div style={{ padding: '12px 16px 16px' }}>
                  <H2 style={{ fontSize: 17 }}>{r.title}</H2>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {r.bullets.map(b => (
                      <div key={b} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: 'var(--text-2)' }}>
                        <Ic name="check" size={14} stroke="var(--accent)" sw={2.4}/>{b}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Body>
      <ActionBar>
        <Btn kind="primary" full onClick={go_next} iconRight="chevron">
          {sel === 'student' ? 'Continue as Student' : 'Continue as Tutor'}
        </Btn>
      </ActionBar>
    </Screen>
  );
}

Object.assign(window, { Landing, SignUp, Verified, Role });
