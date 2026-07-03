// screens-booking2.jsx — B3 (select), B4 (payment), B5 (handshake)
const { useState: useB2, useEffect: useEffB2 } = React;

const LENGTHS = [['0.5', '30 min'], ['1', '1 hr'], ['1.5', '1.5 hr'], ['2', '2 hr']];

// Session focus tags (required) + auto-filled intro message templates.
const FOCUS_TAGS = [
  ['General',    'chat'],
  ['Finish HW',  'edit'],
  ['Exam Study', 'cap'],
  ['Resume',     'doc'],
  ['Advising',   'user'],
];
function focusMessage(tag, course, me = 'Lindsay') {
  switch (tag) {
    case 'Finish HW':  return `Hey, I'm ${me}! I look forward to going over my homework for ${course} with you.`;
    case 'Exam Study': return `Hey, I'm ${me}! I'd love your help preparing for an upcoming ${course} exam — hoping to feel solid on the key topics.`;
    case 'Resume':     return `Hey, I'm ${me}! I'd like help polishing my resume and getting some feedback. Looking forward to it!`;
    case 'Advising':   return `Hey, I'm ${me}! I'm looking for some advising and guidance around ${course}. Excited to chat.`;
    default:           return `Hey, I'm ${me}! Looking forward to working through ${course} with you.`;
  }
}

// ── B3 · SELECT COURSE, TIME, LOCATION ────────────────────────────────────────
function B3({ go, back, booking, setBooking }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const slots = slotsFor(t.name.charCodeAt(0) % 5);
  const availableDays = DAYS.filter(d => slots[d.i] && slots[d.i].length);
  const [day, setDay] = useB2(booking.day != null ? booking.day : availableDays[0].i);
  const [slot, setSlot] = useB2(booking.slot || null);
  const [length, setLength] = useB2(booking.length || '1');
  const [courseOpen, setCourseOpen] = useB2(false);
  const [spotOpen, setSpotOpen] = useB2(false);
  const [course, setCourse] = useB2(booking.course || t.courses[0][0]);
  const [tag, setTag] = useB2(booking.tag || null);
  const [repeat, setRepeat] = useB2(booking.repeat || 'once');
  const [msg, setMsg] = useB2(booking.message || '');
  const [msgEdited, setMsgEdited] = useB2(!!booking.message);
  const tutorFirst = t.name.split(' ')[0];
  // Pick a focus → auto-fill the intro message (unless the student already typed their own)
  const pickTag = (newTag) => {
    setTag(newTag);
    if (!msgEdited || msg.trim() === '') { setMsg(focusMessage(newTag, course, 'Lindsay')); setMsgEdited(false); }
  };
  // Keep an un-edited template in sync if the course changes after a tag is picked
  useEffB2(() => {
    if (tag && !msgEdited) setMsg(focusMessage(tag, course, 'Lindsay'));
  }, [course]);
  // In-person spots the tutor agreed to (from T5) + a free-text "suggest"
  const IN_PERSON_SPOTS = ['Gorgas Library, Fl 2', 'Bidgood Hall lobby', 'Other — I\'ll suggest'];
  const ONLINE = 'Online — Integrated Video';
  const initOnline = (booking.location || '').startsWith('Online');
  const [mode, setMode] = useB2(initOnline ? 'online' : 'person'); // person | online
  const [spot, setSpot] = useB2(initOnline ? IN_PERSON_SPOTS[0] : (booking.location || IN_PERSON_SPOTS[0]));
  const location = mode === 'online' ? ONLINE : spot;

  const rate = (t.courses.find(c => c[0] === course) || t.courses[0])[2];
  const cost = (rate * parseFloat(length)).toFixed(2).replace('.00', '');
  const daySlots = slots[day] || [];
  const ready = !!slot && !!tag && msg.trim().length > 0;
  const dayObj = DAYS.find(d => d.i === day);

  const cont = () => {
    setBooking(b => ({ ...b, tutor: t.id, course, day, slot, length, location, rate, cost, tag, repeat, message: msg.trim(),
      whenLabel: `${dayObj.label}${dayObj.label !== 'Today' && dayObj.label !== 'Tomorrow' ? '' : ''} · ${slot}` }));
    go('b4');
  };

  return (
    <Screen>
      <NavTop onBack={back} title="Book a session"/>
      <Body pad={20}>
        {/* tutor mini */}
        <Card flat style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-alt)' }}>
          <Avatar size={42}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{t.year} · {t.major}</div>
          </div>
          <Badge tone="good"><Ic name="check" size={11} stroke="var(--good)" sw={3}/>Verified</Badge>
        </Card>

        <FieldBlock label="Course">
          <Selectable onClick={() => setCourseOpen(true)} value={course}
            sub={`$${rate}/hr · Grade ${(t.courses.find(c => c[0] === course) || t.courses[0])[1]} verified`}/>
        </FieldBlock>

        <FieldBlock label="Session focus">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FOCUS_TAGS.map(([label, ic]) => {
              const on = tag === label;
              return (
                <div key={label} onClick={() => pickTag(label)} className="tc-tap"
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 999, cursor: 'pointer',
                    fontSize: 13.5, fontWeight: 600, background: on ? 'var(--accent)' : 'var(--surface)', color: on ? 'var(--on-accent)' : 'var(--text)',
                    border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}` }}>
                  <Ic name={ic} size={15} stroke={on ? 'var(--on-accent)' : 'var(--text-3)'} sw={1.8}/>{label}
                </div>
              );
            })}
          </div>
          {!tag && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 9 }}>Pick one so {tutorFirst} can prep — we'll draft your intro message.</div>}
        </FieldBlock>

        <FieldBlock label="Pick a day">
          <div className="tc-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -20px', padding: '2px 20px 4px' }}>
            {DAYS.map(d => {
              const has = slots[d.i] && slots[d.i].length;
              const on = day === d.i;
              return (
                <div key={d.i} onClick={() => has && (setDay(d.i), setSlot(null))} className={has ? 'tc-tap' : ''}
                  style={{ flexShrink: 0, width: 58, padding: '10px 0', borderRadius: 14, textAlign: 'center', cursor: has ? 'pointer' : 'default',
                    background: on ? 'var(--accent)' : 'var(--surface)', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    opacity: has ? 1 : 0.4 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--on-accent)' : 'var(--text-3)' }}>{d.i === 0 ? 'Today' : d.dow}</div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: on ? 'var(--on-accent)' : 'var(--text)', marginTop: 2 }}>{d.dom}</div>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', margin: '5px auto 0',
                    background: has ? (on ? 'var(--on-accent)' : 'var(--good)') : 'transparent' }}/>
                </div>
              );
            })}
          </div>
        </FieldBlock>

        <FieldBlock label={`Available times · ${dayObj.label}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {daySlots.map(s => {
              const on = slot === s;
              return (
                <div key={s} onClick={() => setSlot(s)} className="tc-tap"
                  style={{ padding: '11px 0', textAlign: 'center', borderRadius: 'var(--field-radius)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    background: on ? 'var(--accent)' : 'var(--surface)', color: on ? 'var(--on-accent)' : 'var(--text)',
                    border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}` }}>{s}</div>
              );
            })}
          </div>
        </FieldBlock>

        <FieldBlock label="Session length">
          <div style={{ display: 'flex', gap: 6, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--field-radius)' }}>
            {LENGTHS.map(([v, l]) => {
              const on = length === v;
              return (
                <div key={v} onClick={() => setLength(v)} className="tc-tap"
                  style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 'calc(var(--field-radius) - 2px)', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text)' : 'var(--text-3)',
                    boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>{l}{v === '1' && <span style={{ fontSize: 9, display: 'block', color: on ? 'var(--accent)' : 'var(--text-3)' }}>default</span>}</div>
              );
            })}
          </div>
        </FieldBlock>

        <FieldBlock label="Repeats">
          <div style={{ display: 'flex', gap: 6, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--field-radius)' }}>
            {[['once', 'Just once'], ['weekly', 'Weekly']].map(([v, l]) => {
              const on = repeat === v;
              return (
                <div key={v} onClick={() => setRepeat(v)} className="tc-tap"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0',
                    borderRadius: 'calc(var(--field-radius) - 2px)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text)' : 'var(--text-3)', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>
                  {v === 'weekly' && <Ic name="repeat" size={15} stroke={on ? 'var(--accent)' : 'var(--text-3)'} sw={1.8}/>}{l}
                </div>
              );
            })}
          </div>
          {repeat === 'weekly' && (
            <Card flat style={{ marginTop: 10, padding: 12, background: 'var(--accent-weak)', border: '1px solid var(--accent-border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Ic name="repeat" size={16} stroke="var(--accent)" sw={1.9} style={{ marginTop: 2, flexShrink: 0 }}/>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>
                Locks this time with {tutorFirst} every week. You're charged per session — skip or cancel anytime.
              </span>
            </Card>
          )}
        </FieldBlock>

        <FieldBlock label="How you'll meet">
          <div style={{ display: 'flex', gap: 6, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--field-radius)' }}>
            {[['person', 'In person', 'pin'], ['online', 'Virtual', 'video']].map(([v, l, ic]) => {
              const on = mode === v;
              return (
                <div key={v} onClick={() => setMode(v)} className="tc-tap"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0',
                    borderRadius: 'calc(var(--field-radius) - 2px)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text)' : 'var(--text-3)', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>
                  <Ic name={ic} size={17} stroke={on ? 'var(--accent)' : 'var(--text-3)'} sw={1.8}/>{l}
                </div>
              );
            })}
          </div>
          {mode === 'person' ? (
            <div style={{ marginTop: 10 }}>
              <Selectable onClick={() => setSpotOpen(true)} value={spot} icon="pin"
                sub={spot.startsWith('Other') ? 'You\'ll propose a spot in chat' : `${t.name.split(' ')[0]}'s agreed meeting spot`}/>
            </div>
          ) : (
            <Card flat style={{ marginTop: 10, padding: 14, background: 'var(--accent-weak)', border: '1px solid var(--accent-border)',
              display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ic name="video" size={20} stroke="var(--accent)" sw={1.8}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Integrated video call</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.4 }}>A secure link appears here 10 minutes before the session — no app needed.</div>
              </div>
            </Card>
          )}
        </FieldBlock>

        <FieldBlock label={`Message to ${tutorFirst}`}>
          <div style={{ position: 'relative' }}>
            <textarea
              value={msg}
              onChange={(e) => { setMsg(e.target.value); setMsgEdited(true); }}
              placeholder={tag ? '' : 'Pick a session focus above and we\u2019ll draft this for you…'}
              rows={4}
              style={{ width: '100%', resize: 'none', padding: '13px 14px', fontSize: 14.5, lineHeight: 1.5, fontFamily: 'inherit',
                color: 'var(--text)', background: 'var(--surface)', borderRadius: 'var(--field-radius)',
                border: `1.5px solid ${msg.trim() ? 'var(--border-strong)' : 'var(--border-strong)'}`, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)' }}>
              <Ic name="bolt" size={13} stroke="var(--accent)" sw={1.8}/>
              {tag ? 'Auto-drafted — edit it to make it yours' : 'Required'}
            </span>
            {tag && msgEdited && (
              <span onClick={() => { setMsg(focusMessage(tag, course, 'Lindsay')); setMsgEdited(false); }} className="tc-tap"
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>Reset to template</span>
            )}
          </div>
        </FieldBlock>
      </Body>

      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{length === '0.5' ? '30 min' : `${length} hr`} × ${rate}/hr</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>${cost}</span>
        </div>
        <Btn kind="primary" full disabled={!ready} onClick={() => ready && cont()} iconRight="chevron">
          {!slot ? 'Pick a time to continue' : !tag ? 'Pick a session focus' : !msg.trim() ? 'Add a message to continue' : 'Continue to payment'}
        </Btn>
      </ActionBar>

      <BottomSheet open={courseOpen} onClose={() => setCourseOpen(false)} title="Choose course">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: BOT_INSET }}>
          {t.courses.map(([code, grade, r]) => (
            <Card key={code} selected={course === code} onClick={() => { setCourse(code); setCourseOpen(false); }}
              style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-weak)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{grade}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{code}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Grade {grade} verified</div>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>${r}/hr</span>
            </Card>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={spotOpen} onClose={() => setSpotOpen(false)} title="Meeting spot">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: BOT_INSET }}>
          {IN_PERSON_SPOTS.map(l => (
            <Card key={l} selected={spot === l} onClick={() => { setSpot(l); setSpotOpen(false); }}
              style={{ padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Ic name={l.startsWith('Other') ? 'edit' : 'pin'} size={19} stroke="var(--accent)" sw={1.8}/>
              <span style={{ flex: 1, fontSize: 15, color: 'var(--text)' }}>{l}</span>
              {spot === l && <Ic name="check" size={18} stroke="var(--accent)" sw={2.6}/>}
            </Card>
          ))}
        </div>
      </BottomSheet>
    </Screen>
  );
}

function FieldBlock({ label, children }) {
  return (
    <div style={{ marginTop: 20 }}>
      <Label style={{ fontSize: 13, marginBottom: 10 }}>{label}</Label>
      {children}
    </div>
  );
}
function Selectable({ value, sub, icon, onClick }) {
  return (
    <div onClick={onClick} className="tc-tap" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '0 14px',
      borderRadius: 'var(--field-radius)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)', cursor: 'pointer' }}>
      {icon && <Ic name={icon} size={18} stroke="var(--accent)" sw={1.8}/>}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>}
      </div>
      <Ic name="chevdown" size={18} stroke="var(--text-3)" sw={1.8}/>
    </div>
  );
}

// ── B4 · PAYMENT (Stripe Connect — Payment Element) ───────────────────────────
function B4({ go, back, booking }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const dayObj = DAYS.find(d => d.i === booking.day) || DAYS[1];
  const length = booking.length || '1';
  const lenLabel = length === '0.5' ? '30 min' : `${length} hr`;
  const slot = booking.slot || '3:00 PM';
  const location = booking.location || 'Gorgas Library, Fl 2';
  const course = booking.course || t.courses[0][0];
  const rate = booking.rate || (t.courses.find(c => c[0] === course) || t.courses[0])[2];
  const cost = booking.cost || (rate * parseFloat(length)).toFixed(2).replace('.00', '');

  // Stripe-ish state machine: idle | wallet | processing | declined
  const [status, setStatus] = useB2('idle');
  const [card, setCard] = useB2('4242');     // 4242 = approves · 0002 = declines (Stripe test cards)
  const [wallet, setWallet] = useB2('apple'); // which wallet sheet to show
  const [policyOpen, setPolicyOpen] = useB2(false);

  const repeatWeekly = booking.repeat === 'weekly';
  const rows = [
    ['Tutor', t.name],
    ['Course', course],
    ['Date', dayObj.label],
    ['Time', `${slot} · ${lenLabel}`],
    ['Location', location],
    ...(repeatWeekly ? [['Repeats', 'Weekly · same time']] : []),
  ];

  // PaymentIntent confirm → success routes to B5; test-decline card fails
  const confirmPI = () => {
    setStatus('processing');
    setTimeout(() => { card === '0002' ? setStatus('declined') : go('b5'); }, 1800);
  };
  const openWallet = (w) => { setWallet(w); setStatus('wallet'); };
  const confirmWallet = () => { setStatus('processing'); setTimeout(() => go('b5'), 1600); };

  return (
    <Screen>
      <NavTop onBack={back} title="Confirm & pay"/>
      <Body pad={20}>
        {/* Summary + price breakdown */}
        <Card style={{ padding: 16 }}>
          <Eyebrow style={{ color: 'var(--text-3)', marginBottom: 12 }}>Session summary</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>{k}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
          <Divider style={{ margin: '14px 0' }}/>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Session · {lenLabel}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>${cost}</span>
            </div>

          </div>
          <Divider style={{ margin: '14px 0' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Total{repeatWeekly ? ' · per session' : ''}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>${cost}</span>
          </div>
          {repeatWeekly && (
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.4 }}>
              Weekly sessions are charged one at a time — this payment covers your first session only.
            </div>
          )}
        </Card>

        {/* Stripe Payment Element */}
        <Eyebrow style={{ color: 'var(--text-3)', margin: '24px 0 12px' }}>Payment</Eyebrow>
        <Card style={{ padding: 14 }}>
          {/* Express checkout — wallets on top */}
          <button onClick={() => openWallet('apple')} className="tc-tap" style={{ width: '100%', height: 48, border: 'none', borderRadius: 10,
            background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 17, fontWeight: 600 }}>
            <Ic name="apple" size={20} stroke="#fff" fill="#fff" sw={1.4}/>Pay
          </button>
          <button onClick={() => openWallet('google')} className="tc-tap" style={{ width: '100%', height: 48, marginTop: 8, borderRadius: 10,
            background: '#fff', border: '1px solid #dadce0', color: '#3c4043', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 16, fontWeight: 600 }}>
            <Ic name="google" size={18} stroke="#3c4043" sw={1.8}/>Pay
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Or pay with card</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
          </div>

          {/* Card fields — Stripe Element styling */}
          <div style={{ borderRadius: 10, border: '1px solid var(--border-strong)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 46, borderBottom: '1px solid var(--border)' }}>
              <Ic name="card" size={18} stroke="var(--text-3)" sw={1.7}/>
              <span style={{ flex: 1, fontSize: 15, color: 'var(--text)', letterSpacing: '0.02em' }}>{card === '0002' ? '4000 0000 0000 0002' : '4242 4242 4242 4242'}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>VISA</span>
            </div>
            <div style={{ display: 'flex' }}>
              <div style={{ flex: 1, padding: '0 12px', height: 46, display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border)', fontSize: 15, color: 'var(--text)' }}>08 / 27</div>
              <div style={{ width: 96, padding: '0 12px', height: 46, display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border)', fontSize: 15, color: 'var(--text)' }}>123</div>
              <div style={{ width: 88, padding: '0 12px', height: 46, display: 'flex', alignItems: 'center', fontSize: 15, color: 'var(--text)' }}>35487</div>
            </div>
          </div>

          {/* Test-card switch (demo) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Test card</span>
            <Chip on={card === '4242'} onClick={() => setCard('4242')} style={{ height: 28, fontSize: 11 }}>•••• 4242 approves</Chip>
            <Chip on={card === '0002'} onClick={() => setCard('0002')} style={{ height: 28, fontSize: 11 }}>•••• 0002 declines</Chip>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, fontSize: 11, color: 'var(--text-3)' }}>
            <Ic name="lock" size={12} stroke="var(--text-3)" sw={1.8}/>Secured by Stripe · <Ic name="link" size={13} stroke="var(--text-3)" sw={1.8}/>Link
          </div>
        </Card>

        {/* Held-payment trust line */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16, padding: '0 2px' }}>
          <Ic name="lock" size={18} stroke="var(--good)" sw={1.8} style={{ marginTop: 1, flexShrink: 0 }}/>
          <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Payment held securely and released to your tutor after your session is complete.
          </span>
        </div>

        {/* Cancellation policy — one line + expand */}
        <Card flat style={{ marginTop: 14, padding: 14, background: 'var(--surface-alt)' }}>
          <div onClick={() => setPolicyOpen(o => !o)} className="tc-tap" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <Ic name="shield2" size={17} stroke="var(--good)" sw={1.8}/>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>Free cancellation up to <strong style={{ color: 'var(--text)' }}>24 hours</strong> before.</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 2 }}>
              {policyOpen ? 'Hide' : 'View policy'}
              <Ic name="chevdown" size={15} stroke="var(--accent)" sw={2} style={{ transform: policyOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}/>
            </span>
          </div>
          {policyOpen && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['24h+ before', 'Full refund', 'good'], ['2–24h before', '50% refund', 'neutral'], ['Under 2h', 'No refund', 'neutral']].map(([when, amt, tone]) => (
                <div key={when} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{when}</span>
                  <Badge tone={tone === 'good' ? 'good' : 'neutral'}>{amt}</Badge>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Refunds are processed to your original payment method via Stripe.</div>
            </div>
          )}
        </Card>
      </Body>

      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        {status === 'declined' && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 'var(--field-radius)',
            background: 'var(--accent-weak)', border: '1px solid var(--accent-border)' }}>
            <Ic name="alert" size={18} stroke="var(--accent)" sw={1.9} style={{ marginTop: 1, flexShrink: 0 }}/>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--accent)' }}>Your card was declined.</strong> No charge was made — try another card or a wallet.
            </div>
          </div>
        )}
        <Btn kind="primary" full onClick={confirmPI}>
          {status === 'declined' ? `Try again · $${cost}` : `Confirm & pay $${cost}`}
        </Btn>
      </ActionBar>

      {/* Wallet sheet */}
      <BottomSheet open={status === 'wallet'} onClose={() => setStatus('idle')} title={wallet === 'apple' ? 'Apple Pay' : 'Google Pay'}
        footer={<Btn kind="dark" full onClick={confirmWallet}><Ic name="lock" size={15} stroke="var(--surface)" sw={2}/>Pay ${cost} with {wallet === 'apple' ? 'Apple Pay' : 'Google Pay'}</Btn>}>
        <div style={{ paddingBottom: 4 }}>
          <Card flat style={{ padding: 14, background: 'var(--surface-alt)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Card</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>•••• 4242</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Pay to</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>noot</span>
            </div>
            <Divider style={{ margin: '4px 0 10px' }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Total</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>${cost}</span>
            </div>
          </Card>
          <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 12 }}>
            Double-click the side button to confirm on a real device.
          </div>
        </div>
      </BottomSheet>

      {/* Processing overlay */}
      {status === 'processing' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'var(--bg)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <div className="bk-spin" style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid var(--surface-2)', borderTopColor: 'var(--accent)' }}/>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>Processing payment…</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>Please don't close this screen.</div>
          </div>
        </div>
      )}
    </Screen>
  );
}

function PayBtn({ label, icon, on, onClick, dark }) {
  return (
    <button onClick={onClick} className="tc-tap" style={{ flex: 1, height: 46, borderRadius: 'var(--field-radius)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600,
      border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`, background: 'var(--surface)', color: 'var(--text)' }}>
      <Ic name={icon} size={18} stroke="var(--text)" fill={icon === 'apple' ? 'var(--text)' : 'none'} sw={1.6}/>{label}
    </button>
  );
}

// ── B5 · HANDSHAKE CONFIRMATION ───────────────────────────────────────────────
function B5({ go, booking, setBooking, handshake = true }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const [pop, setPop] = useB2(handshake);
  useEffB2(() => { if (!handshake) return; const id = setTimeout(() => setPop(false), 700); return () => clearTimeout(id); }, [handshake]);
  const dayObj = DAYS.find(d => d.i === booking.day) || DAYS[1];
  const length = booking.length || '1';
  const lenLabel = length === '0.5' ? '30 min' : `${length} hr`;
  const slot = booking.slot || '3:00 PM';
  const location = booking.location || 'Gorgas Library, Fl 2';
  const course = booking.course || t.courses[0][0];
  const dayWord = dayObj.label === 'Today' ? 'today' : dayObj.label === 'Tomorrow' ? 'tomorrow' : dayObj.label;
  const rows = [
    ['cap', course],
    ['cal', `${dayObj.label} · ${slot}`],
    [location.startsWith('Online') ? 'video' : 'pin', location],
    ['clock', `${lenLabel} session`],
    ...(booking.repeat === 'weekly' ? [['repeat', 'Repeats weekly — skip or cancel anytime']] : []),
  ];
  // On arrival: add this booking to Upcoming + drop the student's intro message into the thread (once).
  useEffB2(() => {
    const when = `${dayObj.label} · ${slot}`;
    if (window.NootStore) {
      NootStore.addUpcoming({ id: t.id, when, course, where: location, soon: dayObj.label === 'Today' || dayObj.label === 'Tomorrow' });
      if (booking.message) {
        const th = NootStore.getThread(t.id);
        if (!th.some(m => m.text === booking.message)) NootStore.send(t.id, { who: 'student', text: booking.message, time: 'Just now' });
      }
    }
  }, []);
  const openChat = () => { if (setBooking) setBooking(b => ({ ...b, tutor: t.id, chatWith: t.id })); go('chat'); };
  return (
    <Screen>
      <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
      <Body pad={24}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 24 }}>
          <div className={pop ? 'bk-hs' : ''} style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className={handshake ? 'bk-ring' : ''} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--accent)', opacity: 0 }}/>
            <span className={handshake ? 'bk-ring bk-ring2' : ''} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--accent)', opacity: 0 }}/>
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)' }}>
              <Ic name="handshake" size={50} stroke="var(--on-accent)" sw={1.9}/>
            </div>
          </div>
          <H1 style={{ fontSize: 26, marginTop: 22 }}>Deal locked in.</H1>
          <Sub style={{ marginTop: 8, maxWidth: 260 }}>You're set with <strong style={{ color: 'var(--text)' }}>{t.name}</strong> {dayWord}. We've emailed the details to you both.</Sub>
        </div>

        <Card style={{ marginTop: 26, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map(([ic, v], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-weak)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic name={ic} size={17} stroke="var(--accent)" sw={1.8}/>
                </div>
                <span style={{ fontSize: 15, color: 'var(--text)', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Btn kind="secondary" size="md" style={{ flex: 1 }} onClick={openChat}><Ic name="chat" size={17} stroke="var(--text)" sw={1.8}/>Message</Btn>
          <Btn kind="secondary" size="md" style={{ flex: 1 }} onClick={() => showToast('Added to your calendar')}><Ic name="cal" size={17} stroke="var(--text)" sw={1.8}/>Add to calendar</Btn>
        </div>
        <Card flat style={{ marginTop: 14, padding: 12, background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ic name="lock" size={16} stroke="var(--good)" sw={1.8}/>
          <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>Payment held — released after your session.</span>
        </Card>
        <Card flat style={{ marginTop: 10, padding: 12, background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Ic name="clock" size={16} stroke="var(--text-3)" sw={1.8}/>
          <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>We'll remind you both 24 hours and 1 hour before.</span>
        </Card>
      </Body>
      <ActionBar><Btn kind="primary" full onClick={() => go('home')}>Done</Btn></ActionBar>
    </Screen>
  );
}

Object.assign(window, { B3, B4, B5, FieldBlock, Selectable, PayBtn });
