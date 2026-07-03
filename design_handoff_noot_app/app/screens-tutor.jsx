// screens-tutor.jsx — tutor verification branch (T1–T10)
const { useState: useT } = React;

// Shared step header for T2–T9
function StepHead({ step, title, sub, onBack, onExit }) {
  return (
    <div style={{ paddingTop: TOP_INSET, flexShrink: 0, background: 'var(--bg)', position: 'relative', zIndex: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 40, padding: '0 12px 0 8px' }}>
        <button onClick={onBack} className="tc-tap" style={{ background: 'none', border: 'none', padding: '6px 6px 6px 0',
          cursor: 'pointer', display: 'flex' }}>
          <Ic name="back" size={22} stroke="var(--accent)" sw={2.4}/>
        </button>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--text-3)', textAlign: 'center' }}>Step {step} of 10</span>
        <span onClick={onExit} className="tc-tap" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', width: 78, textAlign: 'right', whiteSpace: 'nowrap' }}>Save & exit</span>
      </div>
      <div style={{ padding: '8px 20px 0' }}>
        <ProgressDots total={10} current={step}/>
        {title && <H1 style={{ fontSize: 24, marginTop: 14 }}>{title}</H1>}
        {sub && <Sub style={{ marginTop: 6, fontSize: 14 }}>{sub}</Sub>}
      </div>
    </div>
  );
}

// ── T1 · WELCOME ─────────────────────────────────────────────────────────────
function T1({ go, back }) {
  const need = [
    ['cap', 'Profile photo'],
    ['doc', 'Courses you can tutor'],
    ['shield', 'Transcripts or grade screenshots'],
    ['card', 'Bank account for payouts'],
  ];
  return (
    <Screen>
      <NavTop onBack={back} title="Become a tutor"/>
      <Body pad={22}>
        <HeroIcon name="cap" size={64} style={{ marginTop: 8 }}/>
        <H1 style={{ fontSize: 28, marginTop: 18, maxWidth: 280 }}>You're about to become a tutor.</H1>
        <Sub style={{ marginTop: 10 }}>About 10–15 minutes. You can save and pick up later — your progress is always kept.</Sub>

        <Eyebrow style={{ color: 'var(--text-3)', marginTop: 26, marginBottom: 12 }}>You'll need</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {need.map(([ic, t]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent-weak)',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic name={ic} size={20} stroke="var(--accent)" sw={1.8}/>
              </div>
              <span style={{ fontSize: 16, color: 'var(--text)' }}>{t}</span>
            </div>
          ))}
        </div>
      </Body>
      <ActionBar>
        <Btn kind="primary" full onClick={() => go('t2')} iconRight="chevron">Get started</Btn>
      </ActionBar>
    </Screen>
  );
}

// ── T2 · PROFILE ─────────────────────────────────────────────────────────────
function T2({ go, back }) {
  return (
    <Screen>
      <StepHead step={2} title="Your profile" sub="Students see this on your tutor card." onBack={back} onExit={() => go('landing')}/>
      <Body pad={20} style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Avatar size={64}/>
            <div style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: '50%',
              background: 'var(--accent)', color: 'var(--on-accent)', border: '2px solid var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic name="plus" size={13} stroke="var(--on-accent)" sw={2.6}/>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Profile photo <span style={{ color: 'var(--accent)' }}>•</span></div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.4 }}>Required. Clear face, no group photos or filters.</div>
          </div>
        </div>
        <Divider style={{ margin: '18px 0' }}/>
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="First" value="Lindsay" style={{ flex: 1 }}/>
          <Field label="Last" value="Thomas" style={{ flex: 1 }}/>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <Select label="Year" value="Junior" options={window.YEAR_OPTIONS} style={{ flex: 1 }}/>
          <Field label="Grad" value="May 2026" style={{ flex: 1 }}/>
        </div>
        <Field style={{ marginTop: 14 }} label="Major" value="Chemistry" placeholder="e.g. Chemistry"/>
        <Field style={{ marginTop: 14 }} label="Bio (optional)" multiline placeholder="Tell students why you're a great tutor…"/>
      </Body>
      <ActionBar><Btn kind="primary" full onClick={() => go('t3')}>Save & Continue</Btn></ActionBar>
    </Screen>
  );
}

// ── T3 · COURSES ─────────────────────────────────────────────────────────────
function T3({ go, back }) {
  const existing = [['CH 101', 'A', 'Fall 2024'], ['CH 102', 'A-', 'Spring 2025']];
  return (
    <Screen>
      <StepHead step={3} title="Courses you tutor" sub="Add up to 10. Add the ones you crushed." onBack={back} onExit={() => go('landing')}/>
      <Body pad={20} style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <H2 style={{ fontSize: 16 }}>Your courses</H2>
          <Badge tone="neutral">2 / 10</Badge>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {existing.map(([c, g, s]) => (
            <Card key={c} onClick={() => showToast('Edit ' + c + ' — built with backend')} style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--accent)', color: 'var(--on-accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>{g}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{c}</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{s}</div>
              </div>
              <Ic name="edit" size={18} stroke="var(--text-3)" sw={1.7}/>
            </Card>
          ))}
        </div>
        <Card flat style={{ marginTop: 12, padding: 16, border: '1.5px dashed var(--border-strong)', background: 'var(--surface-alt)' }}>
          <Eyebrow style={{ marginBottom: 10 }}>Adding</Eyebrow>
          <Field placeholder="Search UA course catalog…" focus suffix={<Ic name="search" size={18} stroke="var(--text-3)" sw={1.8}/>}/>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <Select placeholder="Grade" options={window.GRADE_OPTIONS} style={{ flex: 1 }}/>
            <Select placeholder="Semester" options={window.SEMESTER_OPTIONS} style={{ flex: 1 }}/>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 10 }}>Professor <Muted>(optional, v1)</Muted></div>
        </Card>
      </Body>
      <ActionBar>
        <Btn kind="secondary" size="md" style={{ flex: 1 }} onClick={() => showToast('Add a course you aced \u2014 built with backend')}><Ic name="plus" size={16} stroke="var(--text)" sw={2.2}/>Add</Btn>
        <Btn kind="primary" style={{ flex: 1.6 }} onClick={() => go('t4')}>Save & Continue</Btn>
      </ActionBar>
    </Screen>
  );
}

// ── T4 · RATES ───────────────────────────────────────────────────────────────
function T4({ go, back }) {
  const [rates, setRates] = useT([['CH 101', 'A', '25'], ['CH 102', 'A-', '30']]);
  const setRate = (i, v) => setRates(rs => rs.map((r, ri) => ri === i ? [r[0], r[1], v.replace(/[^0-9]/g, '')] : r));
  return (
    <Screen>
      <StepHead step={4} title="Set your rates" sub="Charge what you're worth. Adjust anytime." onBack={back} onExit={() => go('landing')}/>
      <Body pad={20} style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rates.map(([c, g, rate], i) => (
            <Card key={c} style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{g}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{c}</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>per hour</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '6px 12px', borderRadius: 'var(--field-radius)',
                border: '1.5px solid var(--border-strong)', background: 'var(--surface)' }}>
                <span style={{ color: 'var(--text-3)', fontSize: 15 }}>$</span>
                <input value={rate} inputMode="numeric" onChange={e => setRate(i, e.target.value)}
                  style={{ width: 34, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit',
                    fontWeight: 700, fontSize: 19, color: 'var(--text)', textAlign: 'center', padding: 0 }}/>
                <span style={{ color: 'var(--text-3)', fontSize: 12 }}>/hr</span>
              </div>
            </Card>
          ))}
        </div>
        <Card flat style={{ marginTop: 14, padding: 14, background: 'var(--accent-weak)', border: '1px solid var(--accent-border)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
            <strong style={{ color: 'var(--accent)' }}>You keep the majority of every session.</strong> You'll always see your exact payout before you accept — set your rate to what feels fair.
          </div>
        </Card>
        <div style={{ marginTop: 16, fontSize: 15, color: 'var(--text-2)' }}>
          Your payout for a 1-hour {rates[0][0]} session: <strong style={{ color: 'var(--accent)', fontWeight: 700 }}>${(rates[0][2] * 0.85).toFixed(2)}</strong>
        </div>
      </Body>
      <ActionBar><Btn kind="primary" full onClick={() => go('t5')}>Save & Continue</Btn></ActionBar>
    </Screen>
  );
}

// ── T5 · AVAILABILITY (weekly grid, paintable) ───────────────────────────────
function T5({ go, back }) {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const rowLabels = ['8a', '11a', '2p', '5p', '8p'];
  const init = [
    [0,1,1,0,1,0,0], [0,0,0,1,0,0,0], [1,1,1,1,1,0,0], [1,0,1,0,1,0,1], [0,0,0,0,0,1,1],
  ];
  const [grid, setGrid] = useT(init);
  const [online, setOnline] = useT(true);
  const [locs, setLocs] = useT(['Gorgas Library, Fl 2', 'Bidgood Hall lobby']);
  const toggle = (r, c) => setGrid(g => g.map((row, ri) => ri === r ? row.map((v, ci) => ci === c ? (v ? 0 : 1) : v) : row));
  const total = grid.flat().reduce((a, b) => a + b, 0) * 3; // 3h per block, demo
  return (
    <Screen>
      <StepHead step={5} title="When can you tutor?" onBack={back} onExit={() => go('landing')}/>
      <Body pad={20} style={{ paddingTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <Eyebrow style={{ color: 'var(--text-3)' }}>Weekly availability</Eyebrow>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{total} hrs/wk ✓</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '24px repeat(7, 1fr)', gap: 5 }}>
          <div/>
          {days.map((d, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', fontWeight: 600 }}>{d}</div>)}
          {grid.map((row, ri) => (
            <React.Fragment key={ri}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center' }}>{rowLabels[ri]}</div>
              {row.map((cell, ci) => (
                <div key={ci} onClick={() => toggle(ri, ci)} className="tc-tap"
                  style={{ height: 30, borderRadius: 7, cursor: 'pointer', transition: 'background .1s',
                    background: cell ? 'var(--accent)' : 'var(--surface-2)',
                    border: `1px solid ${cell ? 'var(--accent)' : 'var(--border)'}` }}/>
              ))}
            </React.Fragment>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Tap cells to paint your availability.</div>

        <Divider style={{ margin: '18px 0' }}/>
        <Eyebrow style={{ color: 'var(--text-3)', marginBottom: 10 }}>Common locations (up to 3)</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {locs.map((l, i) => (
            <Card key={i} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Ic name="pin" size={18} stroke="var(--accent)" sw={1.8}/>
              <input value={l} placeholder="e.g. Gorgas Library, Fl 2" autoFocus={l === ''}
                onChange={e => setLocs(ls => ls.map((v, vi) => vi === i ? e.target.value : v))}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 15, color: 'var(--text)', padding: 0 }}/>
              <button onClick={() => setLocs(ls => ls.filter((_, vi) => vi !== i))} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex' }}>
                <Ic name="x" size={15} stroke="var(--text-3)" sw={2}/>
              </button>
            </Card>
          ))}
          <div onClick={() => setLocs(l => [...l, ''])} className="tc-tap" style={{ padding: '12px 14px', borderRadius: 'var(--card-radius)', border: '1.5px dashed var(--border-strong)',
            display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 15, cursor: 'pointer' }}>
            <Ic name="plus" size={16} stroke="var(--text-3)" sw={2}/>Add a location
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <div>
            <div style={{ fontSize: 16, color: 'var(--text)' }}>Offer online sessions</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Over video, anywhere</div>
          </div>
          <Toggle on={online} onClick={() => setOnline(o => !o)}/>
        </div>
      </Body>
      <ActionBar><Btn kind="primary" full onClick={() => go('t6')}>Save & Continue</Btn></ActionBar>
    </Screen>
  );
}

// ── T6 · TRANSCRIPT VERIFICATION ─────────────────────────────────────────────
function T6({ go, back }) {
  const files = [['CH 101', 'transcript.pdf', 'pending'], ['CH 102', 'ch102-grade.png', 'verified']];
  return (
    <Screen>
      <StepHead step={6} title="Verify your grades" sub="Upload a transcript or screenshot per course." onBack={back} onExit={() => go('landing')}/>
      <Body pad={20} style={{ paddingTop: 14 }}>
        <div onClick={() => pickFile('application/pdf,image/png,image/jpeg')} className="tc-tap" style={{ height: 110, borderRadius: 'var(--card-radius)', border: '2px dashed var(--accent-border)', cursor: 'pointer',
          background: 'var(--accent-weak)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Ic name="upload" size={26} stroke="var(--accent)" sw={1.8}/>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)' }}>Drop transcript or screenshots</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>PDF or PNG · max 10MB</div>
        </div>
        <Eyebrow style={{ color: 'var(--text-3)', margin: '18px 0 10px' }}>Coverage</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map(([c, file, st]) => (
            <Card key={c} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 40, borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ic name="doc" size={18} stroke="var(--text-3)" sw={1.6}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{c}</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</div>
              </div>
              {st === 'verified'
                ? <Badge tone="good"><Ic name="check" size={11} stroke="var(--good)" sw={3}/>Verified</Badge>
                : <Badge tone="accentSoft">Pending</Badge>}
            </Card>
          ))}
        </div>
        <Card flat style={{ marginTop: 14, padding: 14, background: 'var(--surface-alt)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Ic name="lock" size={18} stroke="var(--good)" sw={1.7} style={{ marginTop: 1 }}/>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
            Reviewed by a noot team member within 24h. <strong style={{ color: 'var(--text)' }}>We never share your transcript.</strong>
          </div>
        </Card>
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45, padding: '0 2px' }}>
          If a grade comes back below B-, only that course is removed — you stay on the platform.
        </div>
      </Body>
      <ActionBar><Btn kind="primary" full onClick={() => go('t7')}>Submit for review</Btn></ActionBar>
    </Screen>
  );
}

// ── T7 · CONTRACTOR AGREEMENT ────────────────────────────────────────────────
function T7({ go, back }) {
  const [checks, setChecks] = useT([true, true, false]);
  const items = ['I have read and agree to the Agreement.', 'I am responsible for my own taxes.', 'I am 18 years or older.'];
  const allChecked = checks.every(Boolean);
  const toggle = i => setChecks(c => c.map((v, ci) => ci === i ? !v : v));
  return (
    <Screen>
      <StepHead step={7} title="Tutor Agreement" onBack={back} onExit={() => go('landing')}/>
      <Body pad={20} style={{ paddingTop: 14 }}>
        <Card flat style={{ padding: 14, height: 132, overflow: 'hidden', position: 'relative', background: 'var(--surface)' }}>
          <Eyebrow style={{ color: 'var(--text-3)', marginBottom: 10 }}>Independent Contractor Agreement</Eyebrow>
          {[100, 96, 100, 64, 100, 88, 92].map((w, i) => (
            <div key={i} style={{ height: 7, width: w + '%', borderRadius: 3, background: 'var(--surface-2)', marginBottom: 7 }}/>
          ))}
          <div style={{ position: 'absolute', right: 8, top: 36, bottom: 14, width: 4, borderRadius: 2, background: 'var(--surface-2)' }}>
            <div style={{ position: 'absolute', top: '15%', left: 0, right: 0, height: '32%', background: 'var(--accent)', borderRadius: 2 }}/>
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {items.map((t, i) => (
            <div key={i} onClick={() => toggle(i)} className="tc-tap" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                border: `1.5px solid ${checks[i] ? 'var(--accent)' : 'var(--border-strong)'}`,
                background: checks[i] ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {checks[i] && <Ic name="check" size={14} stroke="var(--on-accent)" sw={3}/>}
              </div>
              <div style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.4 }}>{t}</div>
            </div>
          ))}
        </div>
        <Divider style={{ margin: '18px 0 14px' }}/>
        <Label>Sign by typing your full name</Label>
        <input defaultValue="Lindsay M. Thomas" placeholder="Type your full name"
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px 16px', borderRadius: 'var(--field-radius)', border: '1.5px solid var(--accent)', background: 'var(--surface)',
          fontFamily: '"Snell Roundhand", "Segoe Script", "Bradley Hand", cursive', fontSize: 24, color: 'var(--text)', outline: 'none' }}/>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Signed May 14 · IP address captured</div>
      </Body>
      <ActionBar>
        <Btn kind="primary" full disabled={!allChecked} onClick={() => allChecked && go('t8')}>
          {allChecked ? 'Sign and Continue' : 'Check all boxes to sign'}
        </Btn>
      </ActionBar>
    </Screen>
  );
}

// ── T8 · STRIPE CONNECT ──────────────────────────────────────────────────────
function T8({ go, back }) {
  return (
    <Screen>
      <StepHead step={8} title="Get paid" sub="Stripe handles your payouts and tax forms." onBack={back} onExit={() => go('landing')}/>
      <Body pad={20} style={{ paddingTop: 14 }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Powered by</span>
            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)', letterSpacing: '-0.02em' }}>stripe</span>
          </div>
          <div style={{ padding: 16 }}>
            <H2 style={{ fontSize: 16, marginBottom: 14 }}>Verify your identity</H2>
            <Field label="Legal name" value="Lindsay M. Thomas"/>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <Field label="Date of birth" value="01/14/2004" style={{ flex: 1 }}/>
              <Field label="SSN (last 4)" value="•••• 4521" style={{ flex: 1 }}/>
            </div>
            <Field style={{ marginTop: 12 }} label="Bank account" placeholder="Routing + account number"/>
          </div>
        </Card>
        <Card flat style={{ marginTop: 14, padding: 14, background: 'var(--surface-alt)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Ic name="lock" size={18} stroke="var(--good)" sw={1.7} style={{ marginTop: 1 }}/>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
            Stripe is PCI-DSS compliant and issues your 1099-K at year-end. <strong style={{ color: 'var(--text)' }}>noot never sees your SSN or bank info.</strong>
          </div>
        </Card>
      </Body>
      <ActionBar><Btn kind="primary" full onClick={() => go('t9')} iconRight="chevron">Continue with Stripe</Btn></ActionBar>
    </Screen>
  );
}

// ── T9 · PROFILE REVIEW ──────────────────────────────────────────────────────
function T9({ go, back }) {
  return (
    <Screen>
      <StepHead step={9} title="How your profile looks" onBack={back} onExit={() => go('landing')}/>
      <Body pad={20} style={{ paddingTop: 14 }}>
        <Card onClick={() => go('t2')} style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
          <div style={{ padding: '12px 16px 0', display: 'flex', justifyContent: 'flex-end' }}>
            <Badge tone="accentSoft">Pending review</Badge>
          </div>
          <div style={{ display: 'flex', gap: 14, padding: '8px 16px 16px' }}>
            <Avatar size={56}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <H2 style={{ fontSize: 18 }}>Lindsay T.</H2>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>Junior · Chemistry</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Badge tone="accentSoft">CH 101</Badge>
                <Badge tone="accentSoft">CH 102</Badge>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>$25</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>/hr</div>
            </div>
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[100, 86, 60].map((w, i) => <div key={i} style={{ height: 7, width: w + '%', borderRadius: 3, background: 'var(--surface-2)' }}/>)}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Ic name="dollar" size={16} stroke="var(--accent)" sw={1.8}/>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>CH 101</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>$25</span>
              </div>
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Ic name="star" size={16} stroke="none" fill="var(--accent)"/>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Online</span>
                <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Yes</span>
              </div>
            </div>
          </div>
        </Card>
        <div onClick={() => go('t2')} className="tc-tap" style={{ marginTop: 12, padding: 14, borderRadius: 'var(--card-radius)', border: '1.5px dashed var(--border-strong)',
          display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
          <Ic name="edit" size={18} stroke="var(--text-3)" sw={1.7}/>
          <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>Tap to review &amp; change any of your info before submitting.</span>
        </div>
      </Body>
      <ActionBar>
        <Btn kind="secondary" size="md" style={{ flex: 1 }} onClick={() => go('t2')}>Edit</Btn>
        <Btn kind="primary" style={{ flex: 1.8 }} onClick={() => go('t10')}>Submit for review</Btn>
      </ActionBar>
    </Screen>
  );
}

// ── T10 · IN REVIEW ──────────────────────────────────────────────────────────
function T10({ go }) {
  const tasks = [['user', 'Set notification preferences'], ['edit', 'Add a bio (recommended)'], ['star', 'Refer a tutor — earn $10']];
  return (
    <Screen>
      <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
      <Body pad={22}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 18 }}>
          <HeroIcon name="clock" size={76}/>
          <H1 style={{ fontSize: 27, marginTop: 18 }}>You're in review!</H1>
          <Sub style={{ marginTop: 10, maxWidth: 250 }}>We'll email you within 24 hours once your grade verification is approved.</Sub>
        </div>
        <Eyebrow style={{ color: 'var(--text-3)', margin: '28px 0 12px' }}>While you wait</Eyebrow>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map(([ic, t]) => (
            <Card key={t} onClick={() => showToast(t)} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-weak)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic name={ic} size={17} stroke="var(--accent)" sw={1.8}/>
              </div>
              <span style={{ flex: 1, fontSize: 15, color: 'var(--text)' }}>{t}</span>
              <Ic name="chevron" size={16} stroke="var(--text-3)" sw={2}/>
            </Card>
          ))}
        </div>
      </Body>
      <ActionBar><Btn kind="secondary" full onClick={() => go('tutor_home')}>Go to dashboard</Btn></ActionBar>
    </Screen>
  );
}

Object.assign(window, { T1, T2, T3, T4, T5, T6, T7, T8, T9, T10 });
