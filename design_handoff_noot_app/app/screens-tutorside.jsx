// screens-tutorside.jsx — Tutor-side booking flow: TB1 (notification + handshake), TB2 (session detail)
const { useState: useTS, useEffect: useEffTS } = React;

const STUDENT = { name: 'Lindsay Thomas', first: 'Lindsay', year: 'Sophomore', major: 'Pre-Business' };
const FEE_RATE = 0.175; // 15–20% platform fee; using 17.5% midpoint

function sessionFacts(booking, t) {
  const dayObj = DAYS.find(d => d.i === booking.day) || DAYS[1];
  const length = booking.length || '1';
  const lenLabel = length === '0.5' ? '30 min' : `${length} hr`;
  const slot = booking.slot || '3:00 PM';
  const location = booking.location || 'Gorgas Library, Fl 2';
  const course = booking.course || t.courses[0][0];
  const rate = booking.rate || (t.courses.find(c => c[0] === course) || t.courses[0])[2];
  const gross = rate * parseFloat(length);
  const fee = gross * FEE_RATE;
  const payout = gross - fee;
  const online = location.startsWith('Online');
  return { dayObj, length, lenLabel, slot, location, course, rate, gross, fee, payout, online };
}

// ── TB1 · NEW BOOKING NOTIFICATION + HANDSHAKE ────────────────────────────────
function TB1({ go, booking, handshake = true }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const f = sessionFacts(booking, t);
  const [pop, setPop] = useTS(handshake);
  useEffTS(() => { if (!handshake) return; const id = setTimeout(() => setPop(false), 700); return () => clearTimeout(id); }, [handshake]);

  return (
    <Screen>
      <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
      <Body pad={24}>
        {/* push-notification chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999,
          background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', width: 'fit-content', margin: '4px auto 0' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--good)' }}/>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>New session booked</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 18 }}>
          <div className={pop ? 'bk-hs' : ''} style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className={handshake ? 'bk-ring' : ''} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--accent)', opacity: 0 }}/>
            <span className={handshake ? 'bk-ring bk-ring2' : ''} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--accent)', opacity: 0 }}/>
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}>
              <Ic name="handshake" size={50} stroke="var(--on-accent)" sw={1.9}/>
            </div>
          </div>
          <H1 style={{ fontSize: 26, marginTop: 22 }}>You've got a session!</H1>
          <Sub style={{ marginTop: 8, maxWidth: 280 }}>
            <strong style={{ color: 'var(--text)' }}>{STUDENT.first}</strong> booked <strong style={{ color: 'var(--text)' }}>{f.course}</strong> with you for {f.dayObj.label === 'Today' ? 'today' : f.dayObj.label === 'Tomorrow' ? 'tomorrow' : f.dayObj.label}.
          </Sub>
        </div>

        {/* quick recap */}
        <Card style={{ marginTop: 26, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar size={44} label={STUDENT.first[0]}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{STUDENT.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{STUDENT.year} · {STUDENT.major}</div>
            </div>
            <Badge tone="good"><Ic name="check" size={11} stroke="var(--good)" sw={3}/>Confirmed</Badge>
          </div>
          <Divider style={{ margin: '14px 0' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ic name="cal" size={17} stroke="var(--accent)" sw={1.8}/>
            <span style={{ fontSize: 14, color: 'var(--text)' }}>{f.dayObj.label} · {f.slot}</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--good)' }}>+${f.payout.toFixed(2)}</span>
          </div>
        </Card>
      </Body>
      <ActionBar><Btn kind="primary" full onClick={() => go('tb2')} iconRight="chevron">View session details</Btn></ActionBar>
    </Screen>
  );
}

// ── TB2 · SESSION DETAIL (tutor) ──────────────────────────────────────────────
function TB2({ go, back, booking }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const f = sessionFacts(booking, t);
  const [moreOpen, setMoreOpen] = useTS(false);

  return (
    <Screen>
      <NavTop onBack={back} title="Session details"/>
      <Body pad={20}>
        {/* student */}
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar size={48} label={STUDENT.first[0]}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{STUDENT.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{STUDENT.year} · {STUDENT.major}</div>
            </div>
            <Badge tone="good"><Ic name="check" size={11} stroke="var(--good)" sw={3}/>Confirmed</Badge>
          </div>
        </Card>

        {/* facts */}
        <Card style={{ marginTop: 12, padding: 16 }}>
          <Eyebrow style={{ color: 'var(--text-3)', marginBottom: 12 }}>Session</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <FactRow ic="cap" label="Course" value={f.course}/>
            <FactRow ic="cal" label="Date" value={f.dayObj.label}/>
            <FactRow ic="clock" label="Time" value={`${f.slot} · ${f.lenLabel}`}/>
            <FactRow ic={f.online ? 'video' : 'pin'} label={f.online ? 'Virtual' : 'In person'} value={f.online ? 'Integrated video' : f.location}/>
          </div>
        </Card>

        {/* student's message + focus */}
        <Card onClick={() => go && go('chat_tutor')} style={{ marginTop: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Eyebrow style={{ color: 'var(--text-3)' }}>From {STUDENT.first}</Eyebrow>
            {booking.tag && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
                fontSize: 12, fontWeight: 700, background: 'var(--accent-weak)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
                {booking.tag}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Avatar size={32} label={STUDENT.first[0]}/>
            <div style={{ flex: 1, padding: '11px 13px', background: 'var(--surface-alt)', borderRadius: '4px 14px 14px 14px', fontSize: 14, lineHeight: 1.5, color: 'var(--text)' }}>
              {booking.message || `Hey, I'm ${STUDENT.first}! Looking forward to working through ${f.course} with you.`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: 12.5, fontWeight: 600, color: 'var(--accent)' }}>
            <Ic name="chat" size={14} stroke="var(--accent)" sw={1.9}/>Tap to open the full conversation
          </div>
        </Card>

        {/* earnings preview */}
        <Card style={{ marginTop: 12, padding: 16 }}>
          <Eyebrow style={{ color: 'var(--text-3)', marginBottom: 12 }}>Earnings preview</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{f.lenLabel} × ${f.rate}/hr</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>${f.gross.toFixed(2)}</span>
            </div>
          </div>
          <Divider style={{ margin: '13px 0' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>You earn</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--good)' }}>${f.gross.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }}>
            <Ic name="lock" size={13} stroke="var(--text-3)" sw={1.8}/>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Paid out to your Stripe account after the session.</span>
          </div>
        </Card>

        {/* primary CTAs */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Btn kind="secondary" size="md" style={{ flex: 1 }} onClick={() => go && go('chat_tutor')}><Ic name="chat" size={17} stroke="var(--text)" sw={1.8}/>Message</Btn>
          <Btn kind="secondary" size="md" style={{ flex: 1 }} onClick={() => showToast('Added to your calendar')}><Ic name="cal" size={17} stroke="var(--text)" sw={1.8}/>Add to calendar</Btn>
        </div>

        {/* reschedule/cancel — small text link */}
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <span onClick={() => setMoreOpen(true)} className="tc-tap" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Need to reschedule or cancel?
          </span>
        </div>

        <Card flat style={{ marginTop: 18, padding: 12, background: 'var(--surface-alt)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Ic name="clock" size={16} stroke="var(--text-3)" sw={1.8} style={{ marginTop: 1 }}/>
          <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45 }}>
            We'll remind you both <strong style={{ color: 'var(--text)' }}>24 hours</strong> and <strong style={{ color: 'var(--text)' }}>1 hour</strong> before. The {f.online ? 'video link' : 'location'} is included in the 1-hour reminder.
          </span>
        </Card>
      </Body>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Reschedule or cancel">
        <div style={{ paddingBottom: BOT_INSET }}>
          <Card flat style={{ padding: 14, background: 'var(--surface-alt)', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
              This booking is confirmed. Changing it affects {STUDENT.first} and may impact your reliability score.
            </span>
          </Card>
          <Card onClick={() => { setMoreOpen(false); go('xtr'); }} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--accent-weak)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic name="cal" size={18} stroke="var(--accent)" sw={1.8}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Propose a new time</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{STUDENT.first} confirms the change</div>
            </div>
            <Ic name="chevron" size={16} stroke="var(--text-3)" sw={2}/>
          </Card>
          <Card onClick={() => { setMoreOpen(false); go('xtc'); }} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic name="x" size={18} stroke="var(--text-2)" sw={2}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Cancel session</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{STUDENT.first} is refunded per policy</div>
            </div>
            <Ic name="chevron" size={16} stroke="var(--text-3)" sw={2}/>
          </Card>
        </div>
      </BottomSheet>
    </Screen>
  );
}

function FactRow({ ic, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-weak)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Ic name={ic} size={17} stroke="var(--accent)" sw={1.8}/>
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-3)', width: 64, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textAlign: 'right', flex: 1 }}>{value}</span>
    </div>
  );
}

Object.assign(window, { TB1, TB2, sessionFacts });
