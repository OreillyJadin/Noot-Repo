// screens-changes.jsx — Cancellation, reschedule & no-show mechanics
const { useState: useX } = React;

const X_STUDENT = { name: 'Lindsay Thomas', first: 'Lindsay' };

function money(n) { return '$' + n.toFixed(2).replace('.00', ''); }
function baseCost(booking) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const f = window.sessionFacts ? window.sessionFacts(booking, t) : { gross: 28 };
  return f.gross || 28;
}

// Recap strip reused across these screens
function SessionStrip({ booking, who }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const f = window.sessionFacts ? window.sessionFacts(booking, t) : { dayObj: DAYS[1], slot: '3:00 PM', course: 'MGT 300', lenLabel: '1 hr' };
  const name = who === 'tutor' ? X_STUDENT.name : t.name;
  const sub = who === 'tutor' ? `${f.course}` : `${f.course} · ${t.year}`;
  return (
    <Card flat style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-alt)' }}>
      <Avatar size={42} label={who === 'tutor' ? X_STUDENT.first[0] : undefined}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{f.dayObj.label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{f.slot}</div>
      </div>
    </Card>
  );
}

// ── XS1 · STUDENT CANCEL (refund tiers) ───────────────────────────────────────
const TIERS = [
  { id: 'early', label: '> 24 hrs', refundPct: 1.0, tutorPct: 0, note: 'Full refund — no charge.' },
  { id: 'mid', label: '2–24 hrs', refundPct: 0.5, tutorPct: 0.5, note: 'Half refund — your tutor is paid 50% for the reserved slot.' },
  { id: 'late', label: '< 2 hrs', refundPct: 0, tutorPct: 1.0, note: 'No refund — the full amount goes to your tutor for the held time.' },
];

function XStudentCancel({ go, back, booking }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const cost = baseCost(booking);
  const [tier, setTier] = useX('early');
  const [done, setDone] = useX(false);
  const tobj = TIERS.find(x => x.id === tier);
  const refund = cost * tobj.refundPct;

  if (done) {
    return (
      <Screen>
        <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
        <Body pad={24}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 26 }}>
            <HeroIcon name="check" size={72}/>
            <H1 style={{ fontSize: 25, marginTop: 20 }}>Session cancelled</H1>
            <Sub style={{ marginTop: 10, maxWidth: 260 }}>
              {refund > 0 ? <>A refund of <strong style={{ color: 'var(--text)' }}>{money(refund)}</strong> is on its way to your card — typically 5–10 business days via Stripe.</> : <>No refund applies at this time. {t.name.split(' ')[0]} has been notified.</>}
            </Sub>
          </div>
        </Body>
        <ActionBar><Btn kind="secondary" full onClick={() => go('home')}>Done</Btn></ActionBar>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavTop onBack={back} title="Cancel session"/>
      <Body pad={20}>
        <SessionStrip booking={booking} who="student"/>

        {/* demo: timing selector so all tiers are visible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 10px' }}>
          <Eyebrow style={{ color: 'var(--text-3)' }}>Time until session</Eyebrow>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· demo</span>
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--field-radius)' }}>
          {TIERS.map(x => {
            const on = tier === x.id;
            return (
              <div key={x.id} onClick={() => setTier(x.id)} className="tc-tap" style={{ flex: 1, textAlign: 'center', padding: '9px 0', cursor: 'pointer',
                borderRadius: 'calc(var(--field-radius) - 2px)', fontSize: 13, fontWeight: 600, background: on ? 'var(--surface)' : 'transparent',
                color: on ? 'var(--text)' : 'var(--text-3)', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>{x.label}</div>
            );
          })}
        </div>

        {/* refund breakdown */}
        <Card style={{ marginTop: 16, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>You paid</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{money(cost)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Paid to tutor</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)' }}>{money(cost * tobj.tutorPct)}</span>
            </div>
          </div>
          <Divider style={{ margin: '13px 0' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Refund to you</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: refund > 0 ? 'var(--good)' : 'var(--text-3)' }}>{money(refund)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 10 }}>
            <Ic name="shield2" size={15} stroke="var(--text-3)" sw={1.8} style={{ marginTop: 1, flexShrink: 0 }}/>
            <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>{tobj.note}</span>
          </div>
        </Card>
      </Body>
      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <Btn kind="primary" full onClick={() => setDone(true)}>
          {refund > 0 ? `Cancel & refund ${money(refund)}` : 'Cancel session'}
        </Btn>
        <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>Refund timing follows our cancellation policy.</div>
      </ActionBar>
    </Screen>
  );
}

// ── XT1 · TUTOR CANCEL (rate impact) ──────────────────────────────────────────
function XTutorCancel({ go, back, booking }) {
  const cost = baseCost(booking);
  const [done, setDone] = useX(false);
  const cancelsThisMonth = 1; // tracked internally; flag at >2 / 30 days

  if (done) {
    return (
      <Screen>
        <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
        <Body pad={24}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 26 }}>
            <HeroIcon name="check" size={72}/>
            <H1 style={{ fontSize: 25, marginTop: 20 }}>Session cancelled</H1>
            <Sub style={{ marginTop: 10, maxWidth: 260 }}>{X_STUDENT.first} has been fully refunded {money(cost)}. This counts toward your cancellation rate.</Sub>
          </div>
        </Body>
        <ActionBar><Btn kind="secondary" full onClick={() => go('home')}>Done</Btn></ActionBar>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavTop onBack={back} title="Cancel session"/>
      <Body pad={20}>
        <SessionStrip booking={booking} who="tutor"/>

        <Card style={{ marginTop: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{X_STUDENT.first} is refunded</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--good)' }}>{money(cost)} · 100%</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>You earn</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-3)' }}>{money(0)}</span>
          </div>
        </Card>

        {/* cancellation-rate warning */}
        <Card flat style={{ marginTop: 12, padding: 14, background: 'var(--accent-weak)', border: '1px solid var(--accent-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Ic name="alert" size={17} stroke="var(--accent)" sw={1.9}/>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>This affects your cancellation rate</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            You've cancelled <strong style={{ color: 'var(--text)' }}>{cancelsThisMonth} session</strong> in the last 30 days. More than <strong style={{ color: 'var(--text)' }}>2</strong> flags your account for review and can affect your ranking.
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 12 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < cancelsThisMonth ? 'var(--accent)' : 'var(--surface-2)' }}/>
            ))}
          </div>
        </Card>

        <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5, marginTop: 14, padding: '0 2px' }}>
          Can't make the time? Consider <strong style={{ color: 'var(--accent)' }}>proposing a reschedule</strong> instead — it keeps your payment and doesn't count against you.
        </div>
      </Body>
      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <Btn kind="secondary" full onClick={() => go('xtr')}>Propose a reschedule instead</Btn>
        <Btn kind="primary" full onClick={() => setDone(true)}>Cancel & refund {X_STUDENT.first}</Btn>
      </ActionBar>
    </Screen>
  );
}

// ── XT2 · TUTOR RESCHEDULE — propose new time ─────────────────────────────────
function XReschedulePropose({ go, back, booking, setBooking }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const slots = slotsFor(t.name.charCodeAt(0) % 5);
  const availableDays = DAYS.filter(d => slots[d.i] && slots[d.i].length);
  const [day, setDay] = useX(availableDays[1] ? availableDays[1].i : availableDays[0].i);
  const [slot, setSlot] = useX(null);
  const [sent, setSent] = useX(false);
  const f = window.sessionFacts ? window.sessionFacts(booking, t) : { dayObj: DAYS[1], slot: '3:00 PM' };
  const daySlots = slots[day] || [];
  const dayObj = DAYS.find(d => d.i === day);

  if (sent) {
    return (
      <Screen>
        <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
        <Body pad={24}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 24 }}>
            <HeroIcon name="clock" size={72}/>
            <H1 style={{ fontSize: 24, marginTop: 20 }}>Request sent</H1>
            <Sub style={{ marginTop: 10, maxWidth: 260 }}>{X_STUDENT.first} will get a notification to accept or decline your new time. Payment stays unchanged.</Sub>
          </div>
          <Card style={{ marginTop: 24, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>From</div>
                <div style={{ fontSize: 14, color: 'var(--text-3)', textDecoration: 'line-through' }}>{f.dayObj.label} · {f.slot}</div>
              </div>
              <Ic name="arrow" size={18} stroke="var(--accent)" sw={2}/>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Proposed</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{dayObj.label} · {slot}</div>
              </div>
            </div>
          </Card>
        </Body>
        <ActionBar><Btn kind="secondary" full onClick={() => go('xsr')}>See student's view →</Btn></ActionBar>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavTop onBack={back} title="Propose new time"/>
      <Body pad={20}>
        <Card flat style={{ padding: 12, background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ic name="cal" size={17} stroke="var(--text-3)" sw={1.8}/>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Current: <strong style={{ color: 'var(--text)' }}>{f.dayObj.label} · {f.slot}</strong></span>
        </Card>

        <Label style={{ fontSize: 13, margin: '20px 0 10px' }}>Pick a new day</Label>
        <div className="tc-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -20px', padding: '2px 20px 4px' }}>
          {DAYS.map(d => {
            const has = slots[d.i] && slots[d.i].length; const on = day === d.i;
            return (
              <div key={d.i} onClick={() => has && (setDay(d.i), setSlot(null))} className={has ? 'tc-tap' : ''}
                style={{ flexShrink: 0, width: 58, padding: '10px 0', borderRadius: 14, textAlign: 'center', cursor: has ? 'pointer' : 'default',
                  background: on ? 'var(--accent)' : 'var(--surface)', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`, opacity: has ? 1 : 0.4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--on-accent)' : 'var(--text-3)' }}>{d.i === 0 ? 'Today' : d.dow}</div>
                <div style={{ fontSize: 19, fontWeight: 700, color: on ? 'var(--on-accent)' : 'var(--text)', marginTop: 2 }}>{d.dom}</div>
              </div>
            );
          })}
        </div>

        <Label style={{ fontSize: 13, margin: '18px 0 10px' }}>Available times · {dayObj.label}</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {daySlots.map(s => {
            const on = slot === s;
            return (
              <div key={s} onClick={() => setSlot(s)} className="tc-tap" style={{ padding: '11px 0', textAlign: 'center', borderRadius: 'var(--field-radius)',
                cursor: 'pointer', fontSize: 14, fontWeight: 600, background: on ? 'var(--accent)' : 'var(--surface)', color: on ? 'var(--on-accent)' : 'var(--text)',
                border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}` }}>{s}</div>
            );
          })}
        </div>
      </Body>
      <ActionBar>
        <Btn kind="primary" full disabled={!slot} onClick={() => slot && setSent(true)}>
          {slot ? 'Send request to ' + X_STUDENT.first : 'Pick a time'}
        </Btn>
      </ActionBar>
    </Screen>
  );
}

// ── XS2 · STUDENT RESCHEDULE REQUEST (accept / decline) ────────────────────────
function XRescheduleRequest({ go, back, booking }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const f = window.sessionFacts ? window.sessionFacts(booking, t) : { dayObj: DAYS[1], slot: '3:00 PM' };
  const newDay = DAYS[3], newSlot = '4:30 PM';
  const [result, setResult] = useX(null); // accepted | declined

  if (result) {
    const accepted = result === 'accepted';
    return (
      <Screen>
        <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
        <Body pad={24}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 24 }}>
            <HeroIcon name={accepted ? 'check' : 'x'} size={72}/>
            <H1 style={{ fontSize: 24, marginTop: 20 }}>{accepted ? 'Session moved' : 'Request declined'}</H1>
            <Sub style={{ marginTop: 10, maxWidth: 264 }}>
              {accepted
                ? <>Your session with {t.name.split(' ')[0]} is now <strong style={{ color: 'var(--text)' }}>{newDay.label} · {newSlot}</strong>. Payment is unchanged and all reminders are updated.</>
                : <>{t.name.split(' ')[0]} will either honor the original time or cancel for a full refund.</>}
            </Sub>
          </div>
          <Card flat style={{ marginTop: 22, padding: 12, background: 'var(--surface-alt)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Ic name="alert" size={16} stroke="var(--text-3)" sw={1.8} style={{ marginTop: 1, flexShrink: 0 }}/>
            <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>After <strong style={{ color: 'var(--text)' }}>3 reschedules</strong> of the same session, you're automatically refunded in full plus a credit for the inconvenience.</span>
          </Card>
        </Body>
        <ActionBar><Btn kind="secondary" full onClick={() => go('home')}>Done</Btn></ActionBar>
      </Screen>
    );
  }

  return (
    <Screen>
      <NavTop onBack={back} title="Reschedule request"/>
      <Body pad={20}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <Avatar size={48}/>
          <div>
            <H2 style={{ fontSize: 18 }}>{t.name} wants to reschedule</H2>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{booking.course || 'MGT 300'}</div>
          </div>
        </div>

        <Card style={{ marginTop: 20, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 3 }}>Original</div>
              <div style={{ fontSize: 15, color: 'var(--text-3)', textDecoration: 'line-through' }}>{f.dayObj.label}</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'line-through' }}>{f.slot}</div>
            </div>
            <Ic name="arrow" size={20} stroke="var(--accent)" sw={2}/>
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600, marginBottom: 3 }}>New time</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{newDay.label}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{newSlot}</div>
            </div>
          </div>
          <Divider style={{ margin: '14px 0' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ic name="check" size={15} stroke="var(--good)" sw={2.4}/>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Same price · <strong style={{ color: 'var(--text)' }}>{money(baseCost(booking))}</strong>. Nothing else changes.</span>
          </div>
        </Card>
      </Body>
      <ActionBar>
        <Btn kind="secondary" size="md" style={{ flex: 1 }} onClick={() => setResult('declined')}>Decline</Btn>
        <Btn kind="primary" style={{ flex: 1.6 }} onClick={() => setResult('accepted')}>Accept new time</Btn>
      </ActionBar>
    </Screen>
  );
}

// ── XN1 · NO-SHOW HANDLING (both sides) ───────────────────────────────────────
function XNoShow({ go, back, booking, role }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const cost = baseCost(booking);
  const [persona, setPersona] = useX(role === 'tutor' ? 'tutor' : 'student'); // driven by signed-in role
  const [done, setDone] = useX(false);

  if (done) {
    const studentMarked = persona === 'student';
    return (
      <Screen>
        <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
        <Body pad={24}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 22 }}>
            <HeroIcon name={studentMarked ? 'check' : 'dollar'} size={72}/>
            <H1 style={{ fontSize: 24, marginTop: 20 }}>{studentMarked ? 'Reported — full refund' : 'No-show recorded'}</H1>
            <Sub style={{ marginTop: 10, maxWidth: 264 }}>
              {studentMarked
                ? <>You'll be refunded <strong style={{ color: 'var(--text)' }}>{money(cost)}</strong> in full. This impacts {t.name.split(' ')[0]}'s cancellation rate.</>
                : <>Payment of <strong style={{ color: 'var(--text)' }}>{money(cost)}</strong> is processed to you automatically — no review needed for routine no-shows.</>}
            </Sub>
          </div>
          {!studentMarked && (
            <Card style={{ marginTop: 22, padding: 16 }}>
              <Eyebrow style={{ color: 'var(--text-3)', marginBottom: 12 }}>{X_STUDENT.first}'s record · 3-strike policy</Eyebrow>
              {[['1st no-show', 'Warning + loses any cancellation credits', true],
                ['2nd no-show', 'Must pre-pay all sessions, no refunds for 30 days', false],
                ['3rd no-show', 'Account suspended pending review', false]].map(([k, v, active], i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? 'var(--accent)' : 'var(--surface-2)', color: active ? 'var(--on-accent)' : 'var(--text-3)', fontSize: 11, fontWeight: 700 }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--text)' : 'var(--text-3)' }}>{k}{active && ' · now'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{v}</div>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </Body>
        <ActionBar><Btn kind="secondary" full onClick={() => go('home')}>Done</Btn></ActionBar>
      </Screen>
    );
  }

  const studentView = persona === 'student';
  return (
    <Screen>
      <NavTop onBack={back} title="Report a no-show"/>
      <Body pad={20}>
        <SessionStrip booking={booking} who={studentView ? 'student' : 'tutor'}/>

        <Card style={{ marginTop: 16, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent-weak)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic name="clock" size={19} stroke="var(--accent)" sw={1.8}/>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              {studentView ? `${t.name.split(' ')[0]} is 15+ minutes late` : `${X_STUDENT.first} hasn't shown up`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.45 }}>
              {studentView
                ? 'If your tutor is 15 minutes late with no message, you can mark them as a no-show for a full refund.'
                : 'You can report a student no-show up to 1 hour after the scheduled start. Payment processes to you automatically.'}
            </div>
          </div>
        </Card>

        <Card flat style={{ marginTop: 12, padding: 14, background: 'var(--surface-alt)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{studentView ? 'Your refund' : 'Your payout'}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--good)' }}>{money(cost)}</span>
          </div>
        </Card>
      </Body>
      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <Btn kind="primary" full onClick={() => setDone(true)}>
          {studentView ? "Tutor didn't show" : "Student didn't show"}
        </Btn>
        <div onClick={() => setPersona(studentView ? 'tutor' : 'student')} className="tc-tap" style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', cursor: 'pointer' }}>
          Demo: preview the {studentView ? 'tutor' : 'student'} side →
        </div>
      </ActionBar>
    </Screen>
  );
}

Object.assign(window, { XStudentCancel, XTutorCancel, XReschedulePropose, XRescheduleRequest, XNoShow });
