// screens-completion.jsx — Session Completion flow C1–C4 (double-blind ratings)
const { useState: useC, useRef: useRefC } = React;

// Interactive 1–5 star rating
function StarRating({ value, onChange, size = 40 }) {
  const [hover, setHover] = useC(0);
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map(n => {
        const on = n <= (hover || value);
        return (
          <button key={n} onClick={() => onChange(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            className="tc-tap" style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0 }}>
            <Ic name="star" size={size} stroke={on ? 'none' : 'var(--border-strong)'} fill={on ? 'var(--accent)' : 'none'} sw={1.6}/>
          </button>
        );
      })}
    </div>
  );
}

const RATING_WORDS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

// Themed textarea with live character counter
function ReviewArea({ value, onChange, placeholder, max = 500 }) {
  return (
    <div>
      <textarea value={value} maxLength={max} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', minHeight: 96, resize: 'none', boxSizing: 'border-box', padding: 14,
          borderRadius: 'var(--field-radius)', border: '1.5px solid var(--border-strong)', background: 'var(--surface)',
          color: 'var(--text)', fontSize: 15, lineHeight: 1.45, fontFamily: 'var(--font)', outline: 'none' }}/>
      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{value.length} / {max}</div>
    </div>
  );
}

// Yes / No "did this happen as expected?"
function HappenedToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {[['yes', 'Yes', 'check'], ['no', 'No', 'alert']].map(([v, l, ic]) => {
        const on = value === v;
        const danger = v === 'no';
        return (
          <div key={v} onClick={() => onChange(v)} className="tc-tap" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            height: 50, borderRadius: 'var(--field-radius)', cursor: 'pointer', fontSize: 15, fontWeight: 600,
            border: `1.5px solid ${on ? (danger ? 'var(--accent)' : 'var(--good)') : 'var(--border-strong)'}`,
            background: on ? (danger ? 'var(--accent-weak)' : 'var(--good-weak)') : 'var(--surface)',
            color: on ? (danger ? 'var(--accent)' : 'var(--good)') : 'var(--text)' }}>
            <Ic name={ic} size={18} stroke="currentColor" sw={2}/>{l}
          </div>
        );
      })}
    </div>
  );
}

const C_STUDENT = { name: 'Lindsay Thomas', first: 'Lindsay' };

// ── C1 · COMPLETION PROMPT (auto-routes by signed-in role) ─────────────────────
function C1({ go, booking, setBooking, role }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const f = (window.sessionFacts ? window.sessionFacts(booking, t) : { dayObj: DAYS[1], slot: '3:00 PM', course: booking.course || 'MGT 300', lenLabel: '1 hr' });
  const isTutor = role === 'tutor';
  const rateTarget = isTutor ? C_STUDENT.first : t.name;
  const go_rate = () => { setBooking(b => ({ ...b, completionRole: isTutor ? 'tutor' : 'student' })); go(isTutor ? 'c3' : 'c2'); };
  const preview = () => { setBooking(b => ({ ...b, completionRole: isTutor ? 'student' : 'tutor' })); go(isTutor ? 'c2' : 'c3'); };
  return (
    <Screen>
      <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
      <Body pad={24}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 30 }}>
          <HeroIcon name="check" size={72}/>
          <H1 style={{ fontSize: 26, marginTop: 20, maxWidth: 280 }}>How did your session go?</H1>
          <Sub style={{ marginTop: 8, maxWidth: 260 }}>Your {f.course} session just wrapped up. Take a few seconds to rate {rateTarget}.</Sub>
        </div>

        <Card style={{ marginTop: 26, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ic name="cap" size={17} stroke="var(--accent)" sw={1.8}/>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{f.course}</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-3)' }}>{f.dayObj.label} · {f.slot}</span>
          </div>
        </Card>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, padding: 14, borderRadius: 'var(--card-radius)', background: 'var(--surface-alt)' }}>
          <Avatar size={42} label={isTutor ? C_STUDENT.first[0] : undefined}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>You're rating</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{rateTarget}</div>
          </div>
          <Badge tone="accentSoft">{isTutor ? 'Tutor view' : 'Student view'}</Badge>
        </div>
      </Body>
      <ActionBar style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <Btn kind="primary" full onClick={go_rate} iconRight="chevron">Rate your session</Btn>
        <div onClick={preview} className="tc-tap" style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', cursor: 'pointer' }}>
          Demo: preview the {isTutor ? 'student' : 'tutor'} side →
        </div>
      </ActionBar>
    </Screen>
  );
}

// ── C2 · STUDENT RATES TUTOR ──────────────────────────────────────────────────
function C2({ go, back, booking, setBooking }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const [rating, setRating] = useC(0);
  const [review, setReview] = useC('');
  const [happened, setHappened] = useC(null);
  const ready = rating > 0 && happened != null;
  const submit = () => { if (!ready) return; setBooking(b => ({ ...b, completionRole: 'student' })); go(happened === 'no' ? 'c4' : 'c4'); };
  return (
    <Screen>
      <NavTop onBack={back} title="Rate your session"/>
      <Body pad={20}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Avatar size={72}/>
          <H2 style={{ fontSize: 19, marginTop: 12 }}>{t.name}</H2>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{booking.course || 'MGT 300'} · {t.year}</div>
        </div>

        <div style={{ marginTop: 24, marginBottom: 8 }}>
          <StarRating value={rating} onChange={setRating}/>
          <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: rating ? 'var(--accent)' : 'var(--text-3)', marginTop: 12, height: 18 }}>
            {RATING_WORDS[rating] || 'Tap to rate'}
          </div>
        </div>

        <Label style={{ marginTop: 12 }}>Add a review <Muted>· optional</Muted></Label>
        <ReviewArea value={review} onChange={setReview} placeholder={`What stood out about your session with ${t.name.split(' ')[0]}?`}/>

        <Card flat style={{ marginTop: 16, padding: 16, background: 'var(--surface-alt)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Did this session happen as expected?</div>
          <HappenedToggle value={happened} onChange={setHappened}/>
          {happened === 'no' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: 12, borderRadius: 'var(--field-radius)',
              background: 'var(--accent-weak)', border: '1px solid var(--accent-border)' }}>
              <Ic name="alert" size={17} stroke="var(--accent)" sw={1.9} style={{ marginTop: 1, flexShrink: 0 }}/>
              <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
                We'll open a dispute and pause the payout while our team reviews. Your card won't be charged until it's resolved.
              </span>
            </div>
          )}
        </Card>
      </Body>
      <ActionBar>
        <Btn kind="primary" full disabled={!ready} onClick={submit}>
          {happened === 'no' ? 'Submit & open dispute' : 'Submit rating'}
        </Btn>
      </ActionBar>
    </Screen>
  );
}

// ── C3 · TUTOR RATES STUDENT ──────────────────────────────────────────────────
function C3({ go, back, booking, setBooking }) {
  const [rating, setRating] = useC(0);
  const [review, setReview] = useC('');
  const [happened, setHappened] = useC(null);
  const ready = rating > 0 && happened != null;
  const submit = () => { if (!ready) return; setBooking(b => ({ ...b, completionRole: 'tutor' })); go('c4'); };
  return (
    <Screen>
      <NavTop onBack={back} title="Rate your student"/>
      <Body pad={20}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Avatar size={72} label={C_STUDENT.first[0]}/>
          <H2 style={{ fontSize: 19, marginTop: 12 }}>{C_STUDENT.name}</H2>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{booking.course || 'MGT 300'}</div>
        </div>

        <div style={{ marginTop: 24, marginBottom: 8 }}>
          <StarRating value={rating} onChange={setRating}/>
          <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: rating ? 'var(--accent)' : 'var(--text-3)', marginTop: 12, height: 18 }}>
            {RATING_WORDS[rating] || 'Tap to rate'}
          </div>
        </div>

        <Label style={{ marginTop: 12 }}>Private notes <Muted>· optional</Muted></Label>
        <ReviewArea value={review} onChange={setReview} placeholder="Punctual? Prepared? Anything other tutors should know…"/>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, padding: '0 2px' }}>
          <Ic name="lock" size={14} stroke="var(--text-3)" sw={1.8} style={{ marginTop: 1, flexShrink: 0 }}/>
          <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 }}>
            Never shown to students — visible only to other tutors and the noot team.
          </span>
        </div>

        <Card flat style={{ marginTop: 16, padding: 16, background: 'var(--surface-alt)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Did this session happen as expected?</div>
          <HappenedToggle value={happened} onChange={setHappened}/>
          {happened === 'no' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: 12, borderRadius: 'var(--field-radius)',
              background: 'var(--accent-weak)', border: '1px solid var(--accent-border)' }}>
              <Ic name="alert" size={17} stroke="var(--accent)" sw={1.9} style={{ marginTop: 1, flexShrink: 0 }}/>
              <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
                We'll open a dispute and hold the payout while our team reviews what happened.
              </span>
            </div>
          )}
        </Card>
      </Body>
      <ActionBar>
        <Btn kind="primary" full disabled={!ready} onClick={submit}>
          {happened === 'no' ? 'Submit & report issue' : 'Submit rating'}
        </Btn>
      </ActionBar>
    </Screen>
  );
}

// ── C4 · CONFIRMATION (role-dependent) ────────────────────────────────────────
function C4({ go, booking }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const role = booking.completionRole || 'student';
  const f = (window.sessionFacts ? window.sessionFacts(booking, t) : { payout: 23.10 });
  const isTutor = role === 'tutor';
  return (
    <Screen>
      <div style={{ height: TOP_INSET, flexShrink: 0 }}/>
      <Body pad={24}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 24 }}>
          <HeroIcon name={isTutor ? 'dollar' : 'check'} size={72}/>
          <H1 style={{ fontSize: 26, marginTop: 20 }}>Thanks for the feedback.</H1>
          {isTutor ? (
            <Sub style={{ marginTop: 10, maxWidth: 270 }}>
              Payment of <strong style={{ color: 'var(--text)' }}>${f.payout.toFixed(2)}</strong> will be released to your Stripe account within <strong style={{ color: 'var(--text)' }}>2 business days</strong>.
            </Sub>
          ) : (
            <Sub style={{ marginTop: 10, maxWidth: 280 }}>
              Thanks for rating — it helps great tutors get surfaced to more students. Every review keeps <strong style={{ color: 'var(--text)' }}>students helping students</strong>.
            </Sub>
          )}
        </div>

        {isTutor ? (
          <Card style={{ marginTop: 26, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Releasing to</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ic name="card" size={15} stroke="var(--text-2)" sw={1.7}/>Stripe · •••• 4242
              </span>
            </div>
            <Divider style={{ margin: '12px 0' }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Net payout</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--good)' }}>${f.payout.toFixed(2)}</span>
            </div>
          </Card>
        ) : (
          <Card style={{ marginTop: 26, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic name="bolt" size={18} stroke="var(--accent)" sw={1.8}/>
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
              Your rating feeds <strong style={{ color: 'var(--text)' }}>{t.name.split(' ')[0]}'s</strong> standing in search. noot reviews feedback and decides when ratings publish — so scores stay fair and can't be gamed.
            </span>
          </Card>
        )}

        {!isTutor && (
        <Card flat style={{ marginTop: 12, padding: 14, background: 'var(--accent-weak)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Ic name="shield2" size={16} stroke="var(--accent)" sw={1.8} style={{ marginTop: 1, flexShrink: 0 }}/>
          <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Ratings are never shown publicly the moment they're left. noot's team holds and releases them so the community stays trustworthy.
          </span>
        </Card>
        )}

        <Card flat style={{ marginTop: 12, padding: 14, background: 'var(--surface-alt)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Ic name="clock" size={16} stroke="var(--text-3)" sw={1.8} style={{ marginTop: 1, flexShrink: 0 }}/>
          <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
            If neither side responds within <strong style={{ color: 'var(--text)' }}>24 hours</strong>, the session auto-completes and payment is released.
          </span>
        </Card>
      </Body>
      <ActionBar><Btn kind="secondary" full onClick={() => go('home')}>Done</Btn></ActionBar>
    </Screen>
  );
}

Object.assign(window, { C1, C2, C3, C4, StarRating, ReviewArea });
