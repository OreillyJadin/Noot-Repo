// tc-app.jsx — UNIFIED noot app: one router across every flow + a Jump-to launcher.
const { useState: useU, useEffect: useEffU, useCallback: useCbU } = React;

// Every screen key → component name on window
const U_REG = {
  landing: 'Landing', signup: 'SignUp', verified: 'Verified', role: 'Role',
  student_profile: 'StudentProfile', student_home: 'StudentHome', home: 'StudentHomeFeed',
  tutor_home: 'TutorHome', tutor_sessions: 'TutorSessions', tutor_calendar: 'TutorCalendar',
  t1: 'T1', t2: 'T2', t3: 'T3', t4: 'T4', t5: 'T5', t6: 'T6', t7: 'T7', t8: 'T8', t9: 'T9', t10: 'T10',
  saved: 'SavedTab', sessions: 'SessionsTab', profile: 'ProfileTabStudent', tutor_profile: 'ProfileTabTutor',
  edit_personal: 'EditPersonal', edit_courses: 'EditCourses', edit_tutor: 'EditTutorProfile', edit_rates: 'EditRates', edit_availability: 'EditAvailability',
  b1: 'B1', b2: 'B2', b3: 'B3', b4: 'B4', b5: 'B5',
  tb1: 'TB1', tb2: 'TB2',
  c1: 'C1', c2: 'C2', c3: 'C3', c4: 'C4',
  xsc: 'XStudentCancel', xtc: 'XTutorCancel', xtr: 'XReschedulePropose', xsr: 'XRescheduleRequest', xns: 'XNoShow',
  chat: 'Chat', chat_tutor: 'ChatTutor',
};

// Launcher menu — built from the screen map (window.SCREENS) so names stay in sync.
const LAUNCH = (() => {
  const S = window.SCREENS || {};
  const flows = window.SCREEN_FLOWS || [];
  const groups = [{ group: 'Start here', items: [
    ['landing', '▶  Full experience — from Landing'],
    ['home', '⏭  Skip sign-up → Student Home'],
    ['tutor_home', '⏭  Skip → Tutor Dashboard'],
  ]}];
  flows.forEach(flow => {
    const items = Object.keys(S)
      .filter(k => S[k].flow === flow)
      .map(k => [k, `${S[k].code} · ${S[k].name}`]);
    if (items.length) groups.push({ group: flow, items });
  });
  return groups;
})();

const U_W = 402, U_H = 874, U_LS = 'tc_unified_nav_v1';
const U_TWEAKS = /*EDITMODE-BEGIN*/{
  "direction": "sage",
  "dark": false,
  "handshake": true,
  "defaultLength": "1"
}/*EDITMODE-END*/;

function UnifiedApp() {
  const [tw, setTweak] = useTweaks(U_TWEAKS);
  const dir = tw.direction, dark = !!tw.dark;

  const load = () => { try { return JSON.parse(localStorage.getItem(U_LS)) || {}; } catch { return {}; } };
  const saved = load();
  const [stack, setStack] = useU(Array.isArray(saved.stack) && saved.stack.length ? saved.stack : ['landing']);
  const [booking, setBooking] = useU(saved.booking || { course: 'MGT 300', tutor: 'sara', length: tw.defaultLength || '1' });
  const [role, setRole] = useU(saved.role || null);
  const [navDir, setNavDir] = useU('fwd');
  const [anim, setAnim] = useU(false);
  const [menu, setMenu] = useU(false);
  const cur = stack[stack.length - 1];

  useEffU(() => { localStorage.setItem(U_LS, JSON.stringify({ stack, booking, role })); }, [stack, booking, role]);
  useEffU(() => { setAnim(true); const id = setTimeout(() => setAnim(false), 380); return () => clearTimeout(id); }, [cur]);

  const go = useCbU((key) => {
    setNavDir('fwd');
    // Bottom-tab destinations are roots: switching to one clears history
    // (this also locks onboarding once you land on Home / Tutor Dashboard).
    const isTab = !!(window.SCREENS && window.SCREENS[key] && window.SCREENS[key].tabs);
    setStack(s => isTab ? [key] : [...s, key]);
  }, []);
  const back = useCbU(() => { setNavDir('back'); setStack(s => s.length > 1 ? s.slice(0, -1) : s); }, []);
  const jump = useCbU((key) => {
    setNavDir('fwd');
    // ensure booking has a tutor when jumping straight into booking screens
    setBooking(b => (b.tutor ? b : { ...b, tutor: 'sara', course: 'MGT 300', length: tw.defaultLength || '1' }));
    if (key === 'student_home' || key === 'home') setRole('student');
    if (key === 'tutor_home' || key === 'tutor_sessions' || key === 'tutor_calendar' || key === 'tutor_profile') setRole('tutor');
    // Seed a parent for dead-end screens so their back button works when jumped to directly.
    const parent = { chat: 'sessions', chat_tutor: 'tutor_home' };
    setStack(parent[key] ? [parent[key], key] : [key]); setMenu(false);
  }, [tw.defaultLength]);

  const [scale, setScale] = useU(1);
  useEffU(() => {
    const fit = () => setScale(Math.min((window.innerWidth - 40) / U_W, (window.innerHeight - 120) / U_H, 1));
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit);
  }, []);

  const compName = U_REG[cur] || 'Landing';
  const Comp = window[compName] || (() => <div style={{ padding: 40, color: 'var(--text)' }}>Missing: {cur}</div>);
  const themeVars = themeStyle(dir, dark);

  return (
    <div style={{ position: 'fixed', inset: 0, background: dark ? '#0a0a0b' : '#e7e4de',
      display: 'flex', alignItems: 'center', justifyContent: 'center', paddingBottom: 80, transition: 'background .3s', overflow: 'hidden' }}>

      <div style={{ position: 'absolute', top: 18, left: 20, display: 'flex', alignItems: 'center', gap: 8,
        color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.5)', fontSize: 12, fontWeight: 600, fontFamily: BODY_FONT }}>
        <Gecko size={16} tone={dark ? 'sage' : 'deep'}/>
        noot · <span style={{ opacity: 0.7 }}>{window.screenLabel ? window.screenLabel(cur) : cur}</span>
      </div>

      <div style={{ width: U_W * scale, height: U_H * scale, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: U_W, height: U_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <IOSDevice dark={statusIsDark(dir, dark)} width={U_W} height={U_H}>
            <div style={{ ...themeVars, position: 'absolute', inset: 0, overflow: 'hidden' }}>
              <div key={cur} className={anim ? `scr scr-${navDir}` : 'scr'} style={{ height: '100%', background: 'var(--bg)' }}>
                <Comp go={go} back={back} booking={booking} setBooking={setBooking} role={role} setRole={setRole}
                  tw={tw} setTweak={setTweak} handshake={!!tw.handshake} course={booking.course || 'MGT 300'}/>
              </div>
              {/* Launcher overlay lives inside the themed device */}
              {menu && <Launcher onClose={() => setMenu(false)} onJump={jump} cur={cur}/>}
              <Toast/>
            </div>
          </IOSDevice>
        </div>
      </div>

      {/* compact controls */}
      <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 6, padding: 6, borderRadius: 999,
        background: dark ? 'rgba(30,30,32,0.9)' : 'rgba(255,255,255,0.95)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)', backdropFilter: 'blur(10px)', fontFamily: BODY_FONT }}>
        <UCtrl label="‹ Back" onClick={back} disabled={stack.length <= 1} dark={dark}/>
        <UCtrl label="Jump to…" onClick={() => setMenu(true)} dark={dark} accent/>
        <UCtrl label="Restart" onClick={() => jump('landing')} dark={dark}/>
      </div>

      <TweaksPanel>
        <TweakSection label="Visual direction"/>
        <DirectionPicker value={dir} onChange={(v) => setTweak('direction', v)}/>
        <TweakSection label="Appearance"/>
        <TweakToggle label="Dark mode" value={dark} onChange={(v) => setTweak('dark', v)}/>
        <TweakSection label="Booking"/>
        <TweakToggle label="Handshake animation" value={!!tw.handshake} onChange={(v) => setTweak('handshake', v)}/>
        <TweakRadio label="Default session length" value={tw.defaultLength}
          options={[{ value: '0.5', label: '30m' }, { value: '1', label: '1 hr' }, { value: '1.5', label: '1.5h' }, { value: '2', label: '2 hr' }]}
          onChange={(v) => setTweak('defaultLength', v)}/>
      </TweaksPanel>
    </div>
  );
}

function UCtrl({ label, onClick, disabled, dark, accent }) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{ border: 'none', cursor: disabled ? 'default' : 'pointer',
      padding: '9px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, fontFamily: BODY_FONT,
      background: accent ? '#78A070' : 'transparent',
      color: accent ? '#fff' : dark ? (disabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.85)') : (disabled ? 'rgba(0,0,0,0.25)' : '#1a1a1a'),
      opacity: disabled ? 0.6 : 1, transition: 'background .15s', whiteSpace: 'nowrap' }}>{label}</button>
  );
}

// In-device launcher overlay
function Launcher({ onClose, onJump, cur }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column' }}>
      <div onClick={onClose} className="bk-fade" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}/>
      <div className="bk-sheet" style={{ position: 'relative', marginTop: 'auto', maxHeight: '88%', background: 'var(--bg)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24, display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '10px 0 2px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 38, height: 5, borderRadius: 3, background: 'var(--border-strong)' }}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 20px 12px', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--heading-font)', fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>Jump to a screen</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Review tool — not part of the shipped app</div>
          </div>
          <button onClick={onClose} className="tc-tap" style={{ background: 'var(--surface-2)', border: 'none', width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Ic name="x" size={17} stroke="var(--text-2)" sw={2}/>
          </button>
        </div>
        <div className="tc-scroll" style={{ overflowY: 'auto', padding: '0 20px 28px' }}>
          {LAUNCH.map((sec, si) => (
            <div key={si} style={{ marginTop: si ? 18 : 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>{sec.group}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {sec.items.map(([key, label], i) => {
                  const here = key === cur;
                  const primary = si === 0;
                  return (
                    <div key={key + i} onClick={() => onJump(key)} className="tc-tap"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: primary ? '14px 14px' : '12px 14px', borderRadius: 12, cursor: 'pointer',
                        background: primary ? 'var(--accent)' : here ? 'var(--accent-weak)' : 'var(--surface)',
                        color: primary ? 'var(--on-accent)' : 'var(--text)',
                        border: `1px solid ${primary ? 'transparent' : here ? 'var(--accent-border)' : 'var(--border)'}` }}>
                      <span style={{ flex: 1, fontSize: primary ? 15 : 14, fontWeight: primary ? 700 : 600 }}>{label}</span>
                      {here && !primary && <Badge tone="accentSoft">Here</Badge>}
                      <Ic name="chevron" size={16} stroke={primary ? 'var(--on-accent)' : 'var(--text-3)'} sw={2}/>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DirectionPicker({ value, onChange }) {
  const SW = { sage: ['#78A070', '#FFFFFF', '#F4F2EC'], sand: ['#78A070', '#D0C0A0', '#F3EBDC'], forest: ['#3A4A38', '#283028', '#EEF0EA'] };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0 8px' }}>
      {DIRECTIONS.map(d => {
        const on = value === d.id;
        return (
          <div key={d.id} onClick={() => onChange(d.id)} style={{ cursor: 'pointer', padding: '10px 12px', borderRadius: 12,
            border: `1.5px solid ${on ? '#78A070' : 'rgba(255,255,255,0.14)'}`, background: on ? 'rgba(120,160,112,0.16)' : 'rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {SW[d.id].map((c, i) => <span key={i} style={{ width: 14, height: 14, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,0.15)' }}/>)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>{d.blurb}</div>
            </div>
            <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${on ? '#78A070' : 'rgba(255,255,255,0.3)'}`,
              background: on ? '#78A070' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {on && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }}/>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<UnifiedApp/>);
