// screens-edit.jsx — dedicated profile-editing screens (P1–P4).
// These are settings-style editors reached from Profile/Home, NOT the onboarding
// steps (S1 / T2–T5) — those remain first-run only. All saves are front-end
// stubs: showToast(...) then back().
const { useState: useEd } = React;

// Shared save bar
function EdSave({ label = 'Save changes', onSave }) {
  return (
    <ActionBar>
      <Btn kind="primary" full onClick={onSave}>{label}</Btn>
    </ActionBar>
  );
}

// Shared avatar-with-edit header
function EdAvatar({ label = 'L' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div style={{ position: 'relative' }}>
        <Avatar size={78} label={label} />
        <button className="tc-tap" onClick={() => showToast('Change photo — built with backend')}
          style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', padding: 0,
            cursor: 'pointer', border: '2px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ic name="edit" size={12} stroke="var(--on-accent)" sw={2.2} />
        </button>
      </div>
      <span onClick={() => showToast('Change photo — built with backend')} className="tc-tap"
        style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>Change photo</span>
    </div>
  );
}

// ── P1 · EDIT PERSONAL INFO (student + tutor) ────────────────────────────────
function EditPersonal({ go, back }) {
  const save = () => { showToast('Profile updated'); back(); };
  return (
    <Screen>
      <NavTop onBack={back} title="Personal info" />
      <Body pad={20}>
        <EdAvatar />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="First name" value="Lindsay" /></div>
          <div style={{ flex: 1 }}><Field label="Last name" value="Thomas" /></div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Select label="Year" value="Sophomore" options={['Freshman', 'Sophomore', 'Junior', 'Senior', 'Grad']} />
        </div>
        <div style={{ marginTop: 14 }}>
          <Field label="Major" value="Pre-Business" />
        </div>
        {/* locked email */}
        <div style={{ marginTop: 14 }}>
          <Label style={{ fontSize: 13, marginBottom: 8 }}>Campus email</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, padding: '0 14px', borderRadius: 'var(--field-radius)',
            background: 'var(--surface-2)', border: '1.5px solid var(--border)' }}>
            <Ic name="lock" size={16} stroke="var(--text-3)" sw={1.8} />
            <span style={{ flex: 1, fontSize: 15, color: 'var(--text-2)' }}>lindsay.t@students.edu</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 7 }}>Your verified .edu email can't be changed.</div>
        </div>
      </Body>
      <EdSave onSave={save} />
    </Screen>
  );
}

// ── P2 · MY COURSES (student) ────────────────────────────────────────────────
function EditCourses({ go, back }) {
  const [courses, setCourses] = useEd(['MGT 300', 'EC 110', 'CH 101']);
  const [draft, setDraft] = useEd('');
  const add = () => {
    const c = draft.trim().toUpperCase();
    if (c && !courses.includes(c)) setCourses([...courses, c]);
    setDraft('');
  };
  const save = () => { showToast('Courses updated'); back(); };
  return (
    <Screen>
      <NavTop onBack={back} title="My courses" />
      <Body pad={20}>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 16 }}>
          Your current courses power your For-You feed and exam reminders — we match tutors who took your exact classes, same professor when we can.
        </div>
        <Label style={{ fontSize: 13, marginBottom: 10 }}>Current courses</Label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {courses.map(c => (
            <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--field-radius)',
              background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent-weak)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ic name="cap" size={16} stroke="var(--accent)" sw={1.8} />
              </div>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{c}</span>
              <button onClick={() => setCourses(courses.filter(x => x !== c))} className="tc-tap"
                style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic name="x" size={13} stroke="var(--text-2)" sw={2.2} />
              </button>
            </div>
          ))}
          {courses.length === 0 && (
            <div style={{ padding: '18px 14px', borderRadius: 'var(--field-radius)', border: '1.5px dashed var(--border-strong)', textAlign: 'center',
              fontSize: 13, color: 'var(--text-3)' }}>No courses yet — add one below.</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 16 }}>
          <div style={{ flex: 1 }}>
            <Field label="Add a course" placeholder="e.g. MATH 125" value={draft} onChange={setDraft} />
          </div>
          <Btn kind="tint" size="md" onClick={add} style={{ height: 50 }}><Ic name="plus" size={16} stroke="var(--accent)" sw={2.2} />Add</Btn>
        </div>
      </Body>
      <EdSave onSave={save} />
    </Screen>
  );
}

// ── P3 · EDIT TUTOR PROFILE (public-facing) ──────────────────────────────────
function EditTutorProfile({ go, back }) {
  const save = () => { showToast('Tutor profile updated'); back(); };
  return (
    <Screen>
      <NavTop onBack={back} title="Edit tutor profile" />
      <Body pad={20}>
        <EdAvatar />
        <Field label="Display name" value="Lindsay T." hint="Shown to students — first name + last initial." />
        <div style={{ marginTop: 14 }}>
          <Field label="About you" multiline value={"Sophomore in Pre-Business. I took CH 101 with Prof. Weaver and pulled an A — I keep sessions practical: we work your actual problem sets, not generic notes."}
            hint="What students see on your profile. Mention the professor and how you run sessions." />
        </div>
        {/* what students see */}
        <Card onClick={() => go('b2')} style={{ marginTop: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-weak)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic name="search" size={17} stroke="var(--accent)" sw={1.9} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>Preview your public profile</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>See exactly what students see</div>
          </div>
          <Ic name="chevR" size={17} stroke="var(--text-3)" sw={2} />
        </Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: '0 2px' }}>
          <Ic name="shield2" size={14} stroke="var(--good)" sw={1.8} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>Verified grades and session counts update automatically — you can't edit those.</span>
        </div>
      </Body>
      <EdSave onSave={save} />
    </Screen>
  );
}

// ── P4 · COURSES & RATES (tutor) ─────────────────────────────────────────────
function EditRates({ go, back }) {
  const [rates, setRates] = useEd([
    { code: 'CH 101', grade: 'A', rate: 25 },
    { code: 'CH 102', grade: 'A', rate: 30 },
  ]);
  const bump = (i, d) => setRates(rs => rs.map((r, j) => j === i ? { ...r, rate: Math.min(120, Math.max(10, r.rate + d)) } : r));
  const save = () => { showToast('Rates updated'); back(); };
  return (
    <Screen>
      <NavTop onBack={back} title="Courses & rates" />
      <Body pad={20}>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 16 }}>
          Set an hourly rate per course. Changes apply to new bookings only — upcoming sessions keep the rate the student paid.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rates.map((r, i) => (
            <Card key={r.code} style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-weak)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{r.grade}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{r.code}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Grade {r.grade} verified</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => bump(i, -1)} className="tc-tap" style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--border-strong)',
                    background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ic name="minus" size={15} stroke="var(--text)" sw={2.2} />
                  </button>
                  <span style={{ minWidth: 58, textAlign: 'center', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>${r.rate}<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>/hr</span></span>
                  <button onClick={() => bump(i, 1)} className="tc-tap" style={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid var(--border-strong)',
                    background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ic name="plus" size={15} stroke="var(--text)" sw={2.2} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
        <Card onClick={() => go('t3')} flat style={{ marginTop: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-alt)' }}>
          <Ic name="plus" size={17} stroke="var(--accent)" sw={2.2} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Add a course</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>New courses need grade verification (~24h)</div>
          </div>
          <Ic name="chevR" size={16} stroke="var(--text-3)" sw={2} />
        </Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: '0 2px' }}>
          <Ic name="bolt" size={14} stroke="var(--accent)" sw={1.8} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>Most tutors on campus charge $22–$34/hr. You keep 100% during launch.</span>
        </div>
      </Body>
      <EdSave onSave={save} />
    </Screen>
  );
}

// ── P5 · SET AVAILABILITY (tutor) ───────────────────────────────────────────
// Recurring weekly template — the tutor's "typical week". Distinct from the
// Calendar tab, which is the day-by-day agenda + one-off slot toggles.
const AV_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const AV_BLOCKS = [['morning', 'Morning', '8a–12p'], ['afternoon', 'Afternoon', '12–5p'], ['evening', 'Evening', '5–10p']];
function avInit() {
  const m = {};
  AV_DAYS.forEach((d, i) => { m[d] = new Set(i < 5 ? ['afternoon', 'evening'] : (i === 5 ? ['morning'] : [])); });
  return m;
}
function EditAvailability({ go, back }) {
  const [av, setAv] = useEd(avInit);
  const toggle = (day, block) => setAv(prev => {
    const next = { ...prev, [day]: new Set(prev[day]) };
    if (next[day].has(block)) next[day].delete(block); else next[day].add(block);
    return next;
  });
  const total = AV_DAYS.reduce((n, d) => n + av[d].size, 0);
  const save = () => { showToast('Availability saved'); back(); };
  return (
    <Screen>
      <NavTop onBack={back} title="Set availability" />
      <Body pad={20}>
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 16 }}>
          This is your <strong style={{ color: 'var(--text)' }}>typical week</strong> — students can request these times. Need to block one specific day or open an extra slot? Use the <span onClick={() => go('tutor_calendar')} className="tc-tap" style={{ color: 'var(--accent)', fontWeight: 600, cursor: 'pointer' }}>Calendar</span>.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {AV_DAYS.map(day => {
            const on = av[day].size > 0;
            return (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 42, flexShrink: 0, fontSize: 14, fontWeight: 700, color: on ? 'var(--text)' : 'var(--text-3)' }}>{day}</div>
                <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                  {AV_BLOCKS.map(([id, label, hrs]) => {
                    const sel = av[day].has(id);
                    return (
                      <div key={id} onClick={() => toggle(day, id)} className="tc-tap"
                        style={{ flex: 1, padding: '9px 4px', borderRadius: 11, textAlign: 'center', cursor: 'pointer',
                          background: sel ? 'var(--accent)' : 'var(--surface)', border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}` }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: sel ? 'var(--on-accent)' : 'var(--text-2)' }}>{label}</div>
                        <div style={{ fontSize: 10, color: sel ? 'rgba(255,255,255,0.7)' : 'var(--text-3)', marginTop: 1 }}>{hrs}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 16, padding: '0 2px' }}>
          <Ic name="clock" size={14} stroke="var(--accent)" sw={1.8} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>{total} time block{total === 1 ? '' : 's'} open each week. You'll only ever get requests inside these windows.</span>
        </div>
      </Body>
      <EdSave onSave={save} />
    </Screen>
  );
}

Object.assign(window, { EditPersonal, EditCourses, EditTutorProfile, EditRates, EditAvailability });
