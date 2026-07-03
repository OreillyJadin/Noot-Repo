// screens-booking.jsx — Core Booking Loop B1–B5. Reuses kit.jsx + theme.jsx.
const { useState: useB, useEffect: useEffB } = React;

// ── small shared helpers ─────────────────────────────────────────────────────
function Stars({ n, size = 13 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: size, fontWeight: 700, color: 'var(--text)' }}>
      <Ic name="star" size={size + 1} stroke="none" fill="var(--accent)"/>{n}
    </span>
  );
}

function BottomSheet({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} className="bk-fade" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }}/>
      <div className="bk-sheet" style={{ position: 'relative', background: 'var(--surface)', borderTopLeftRadius: 22, borderTopRightRadius: 22,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.25)', maxHeight: '82%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: 'var(--border-strong)' }}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px', flexShrink: 0 }}>
          <H2 style={{ fontSize: 19 }}>{title}</H2>
          <button onClick={onClose} className="tc-tap" style={{ background: 'var(--surface-2)', border: 'none', width: 30, height: 30,
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Ic name="x" size={16} stroke="var(--text-2)" sw={2}/>
          </button>
        </div>
        <div className="tc-scroll" style={{ overflowY: 'auto', padding: '0 20px 8px' }}>{children}</div>
        {footer && <div style={{ padding: `12px 20px ${BOT_INSET}px`, borderTop: '1px solid var(--border)', flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  );
}

// ── B1 · SEARCH RESULTS ───────────────────────────────────────────────────────
const SORTS = [['best', 'Best match'], ['sessions', 'Most experienced'], ['price', 'Lowest price'], ['soon', 'Soonest']];

function B1({ go, back, setBooking, course = 'MGT 300' }) {
  const [sort, setSort] = useB('best');
  const [filterOpen, setFilterOpen] = useB(false);
  const [maxPrice, setMaxPrice] = useB(40);
  const [avail, setAvail] = useB('any'); // any | today | week
  const [gender, setGender] = useB('any'); // any | f | m
  const activeFilters = (maxPrice < 40 ? 1 : 0) + (avail !== 'any' ? 1 : 0) + (gender !== 'any' ? 1 : 0);

  let list = TUTORS.filter(t =>
    t.rate <= maxPrice &&
    (avail === 'any' || (avail === 'today' && t.next === 0) || (avail === 'week' && t.next <= 6)) &&
    (gender === 'any' || t.gender === gender)
  );
  const sorters = {
    best: (a, b) => (b.rating * 10 - b.next) - (a.rating * 10 - a.next),
    sessions: (a, b) => b.sessions - a.sessions,
    price: (a, b) => a.rate - b.rate,
    soon: (a, b) => a.next - b.next,
  };
  list = [...list].sort(sorters[sort]);

  const open = (t) => { setBooking(b => ({ ...b, tutor: t.id, course })); go('b2'); };

  return (
    <Screen>
      <div style={{ paddingTop: TOP_INSET, flexShrink: 0, padding: `${TOP_INSET}px 16px 0`, background: 'var(--bg)', position: 'relative', zIndex: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
          <button onClick={() => back && back()} className="tc-tap" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
            <Ic name="back" size={24} stroke="var(--accent)" sw={2.4}/>
          </button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', borderRadius: 'var(--field-radius)',
            background: 'var(--surface)', border: '1.5px solid var(--border-strong)' }}>
            <Ic name="search" size={17} stroke="var(--text-3)" sw={1.8}/>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{course}</span>
          </div>
        </div>
      </div>

      {/* sort + filter bar */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--bg)' }}>
        <div className="tc-scroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', flex: 1 }}>
          {SORTS.map(([k, l]) => (
            <Chip key={k} on={sort === k} onClick={() => setSort(k)} style={{ height: 32 }}>{l}</Chip>
          ))}
        </div>
        <button onClick={() => setFilterOpen(true)} className="tc-tap" style={{ display: 'flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px',
          borderRadius: 'var(--chip-radius)', border: '1px solid var(--border-strong)', background: activeFilters ? 'var(--accent)' : 'var(--surface)',
          color: activeFilters ? 'var(--on-accent)' : 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font)' }}>
          <Ic name="filter" size={15} stroke="currentColor" sw={1.8}/>Filters{activeFilters ? ` · ${activeFilters}` : ''}
        </button>
      </div>

      <Body pad={16} style={{ paddingTop: 4 }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
          <strong style={{ color: 'var(--text-2)' }}>{list.length}</strong> verified tutor{list.length !== 1 ? 's' : ''} for {course}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map(t => (
            <Card key={t.id} onClick={() => open(t)} style={{ padding: 12 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <Avatar size={56}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{t.name}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>${t.rate}<span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>/hr</span></div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 1 }}>{t.year} · {t.major}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                    <Ic name="cap" size={15} stroke="var(--text-3)" sw={1.7}/>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}><strong style={{ color: 'var(--text)', fontWeight: 600 }}>{t.sessions}</strong> sessions completed</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                    <Badge tone="good"><Ic name="check" size={11} stroke="var(--good)" sw={3}/>Verified {t.verified}</Badge>
                    <Badge tone="accentSoft" style={{ whiteSpace: 'nowrap' }}>{course}</Badge>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--border)',
                fontSize: 13, color: 'var(--text-2)' }}>
                <Ic name="clock" size={15} stroke="var(--good)" sw={1.8}/>
                Next available: <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{t.nextLabel}</strong>
                <Ic name="chevron" size={15} stroke="var(--text-3)" sw={2} style={{ marginLeft: 'auto' }}/>
              </div>
            </Card>
          ))}
          {list.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)' }}>
              <Ic name="search" size={28} stroke="var(--text-3)" sw={1.6}/>
              <div style={{ marginTop: 10, fontSize: 15 }}>No tutors match these filters.</div>
            </div>
          )}
        </div>
      </Body>

      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filters"
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn kind="secondary" size="md" style={{ flex: 1 }} onClick={() => { setMaxPrice(40); setAvail('any'); setGender('any'); }}>Reset</Btn>
            <Btn kind="primary" size="md" style={{ flex: 1.8 }} onClick={() => setFilterOpen(false)}>Show {list.length} tutors</Btn>
          </div>
        }>
        <FilterGroup label={`Max price · $${maxPrice}/hr`}>
          <input type="range" min="19" max="40" step="1" value={maxPrice} onChange={e => setMaxPrice(+e.target.value)}
            className="bk-range" style={{ width: '100%' }}/>
        </FilterGroup>
        <FilterGroup label="Availability">
          {[['any', 'Any time'], ['today', 'Today'], ['week', 'This week']].map(([v, l]) => (
            <Chip key={v} on={avail === v} onClick={() => setAvail(v)}>{l}</Chip>
          ))}
        </FilterGroup>
        <FilterGroup label="Tutor gender" hint="Optional — for comfort or cultural preference.">
          {[['any', 'Any'], ['f', 'Female'], ['m', 'Male']].map(([v, l]) => (
            <Chip key={v} on={gender === v} onClick={() => setGender(v)}>{l}</Chip>
          ))}
        </FilterGroup>
        <div style={{ height: 8 }}/>
      </BottomSheet>
    </Screen>
  );
}

function FilterGroup({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <Label style={{ fontSize: 13, marginBottom: 10 }}>{label}</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>{hint}</div>}
    </div>
  );
}

// ── B2 · TUTOR PROFILE ────────────────────────────────────────────────────────
function B2({ go, back, booking, setBooking }) {
  const t = tutorById(booking.tutor) || TUTORS[0];
  const minRate = Math.min(...t.courses.map(c => c[2]));

  const book = (courseCode) => { setBooking(b => ({ ...b, tutor: t.id, course: courseCode || booking.course })); go('b3'); };

  return (
    <Screen>
      <NavTop onBack={() => back ? back() : go('student_home')} title="" transparent trailing={
        <button onClick={() => showToast('Saved to your list')} className="tc-tap" style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: 34, height: 34, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Ic name="bookmark" size={17} stroke="var(--text-2)" sw={1.8}/>
        </button>
      }/>
      <Body pad={20} style={{ paddingTop: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Avatar size={92}/>
          <H1 style={{ fontSize: 24, marginTop: 14 }}>{t.name}</H1>
          <div style={{ fontSize: 14, color: 'var(--text-3)', marginTop: 3 }}>{t.year} · {t.major}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text-2)' }}><strong style={{ color: 'var(--text)' }}>{t.sessions}</strong> sessions completed</div>
            <div style={{ width: 1, height: 16, background: 'var(--border)' }}/>
            <Badge tone="good"><Ic name="check" size={11} stroke="var(--good)" sw={3}/>Verified</Badge>
          </div>
        </div>

        <Section title="About">
          <Sub style={{ fontSize: 14 }}>{t.bio}</Sub>
        </Section>

        <Section title="Courses & rates">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {t.courses.map(([code, grade, rate, sess]) => (
              <Card key={code} onClick={() => book(code)} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--accent)', color: 'var(--on-accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{grade}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{code}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Badge tone="good" style={{ padding: '2px 7px' }}><Ic name="check" size={10} stroke="var(--good)" sw={3}/>Grade {grade}</Badge>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>· {sess} sessions</span>
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>${rate}<span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>/hr</span></div>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="Verified by noot">
          <Card flat style={{ padding: 14, background: 'var(--surface-alt)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Ic name="shield2" size={18} stroke="var(--good)" sw={1.8} style={{ marginTop: 1 }}/>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
              Grades are confirmed against official UA transcripts. Session quality is monitored by our team — flag any concern and we'll review it directly.
            </div>
          </Card>
        </Section>
        <div style={{ height: 8 }}/>
      </Body>
      <ActionBar>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>From</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>${minRate}<span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>/hr</span></div>
        </div>
        <Btn kind="primary" style={{ flex: 1 }} onClick={() => book(booking.course)} iconRight="chevron">Book a session</Btn>
      </ActionBar>
    </Screen>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 24 }}>
      <Eyebrow style={{ color: 'var(--text-3)', marginBottom: 12 }}>{title}</Eyebrow>
      {children}
    </div>
  );
}

Object.assign(window, { B1, B2, Stars, BottomSheet, Section });
