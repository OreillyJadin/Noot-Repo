// kit.jsx — noot hi-fi iOS component kit.
// Every component reads CSS custom properties from theme.jsx. No raw hex here.
// Loaded after React + theme.jsx; exports to window for the screen files.

// ── Icons ────────────────────────────────────────────────────────────────
const ICONS = {
  back:    'M15 4l-7 8 7 8',
  chevron: 'M8 4l8 8-8 8',
  chevdown:'M5 8l7 7 7-7',
  plus:    'M12 5v14M5 12h14',
  check:   'M4 12l5 5L20 6',
  search:  'M11 4a7 7 0 105.3 11.7M20 20l-4.7-4.3',
  camera:  'M4 8h3l2-2h6l2 2h3v11H4z|circle:12,13,3.4',
  upload:  'M12 16V4M7 9l5-5 5 5M4 20h16',
  mail:    'M3 6h18v12H3z|M3 7l9 6 9-6',
  clock:   'M12 7v5l3 2|circle:12,12,9',
  star:    'M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.6 6.8 19l1-5.8L3.5 9.2l5.9-.8z',
  lock:    'M6 10V8a6 6 0 1112 0v2|rect:5,10,14,11,2',
  dollar:  'M12 3v18M16 7c0-2-2-3-4-3s-4 1-4 3 2 3 4 3 4 1 4 3-2 3-4 3-4-1-4-3',
  cal:     'M3 6h18v15H3z|M3 10h18M8 3v4M16 3v4',
  repeat:  'M17 2l4 4-4 4M21 6H8a5 5 0 00-5 5v1M7 22l-4-4 4-4M3 18h13a5 5 0 005-5v-1',
  list:    'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  x:       'M6 6l12 12M18 6L6 18',
  minus:   'M5 12h14',
  edit:    'M4 20h4L19 9l-4-4L4 16z',
  grid:    'rect:4,4,7,7,1.5|rect:13,4,7,7,1.5|rect:4,13,7,7,1.5|rect:13,13,7,7,1.5',
  user:    'M5 20c1.5-4 4-6 7-6s5.5 2 7 6|circle:12,8,4',
  bolt:    'M13 2L4 14h7l-1 8 9-12h-7z',
  shield:  'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z|M8.5 12l2.5 2.5L16 9',
  doc:     'M6 3h8l4 4v14H6z|M14 3v4h4',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10|circle:16,7,2|circle:8,17,2',
  bookmark:'M6 3h12v18l-6-4-6 4z',
  msg:     'M4 5h16v11H9l-5 4z',
  pin:     'M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z|circle:12,10,2.5',
  cap:     'M2 8.5l10-4.5 10 4.5-10 4.5z|M6 10.5V16c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2v-5.5M20 9v5',
  card:    'rect:3,5,18,14,3|M3 9h18',
  arrow:   'M5 12h14M13 6l6 6-6 6',
  filter:  'M3 5h18l-7 8v6l-4-2v-4z',
  sort:    'M7 5v14M7 19l-3-3M7 5l3 3M17 19V5M17 5l-3 3M17 19l3-3',
  video:   'rect:3,7,12,10,2.5|M15 11l5-3v8l-5-3z',
  apple:   'M16 13c0-2 1.6-3 1.7-3.1-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.4 2.1 2.4 2 1-.04 1.3-.6 2.5-.6s1.5.6 2.5.6 1.7-1 2.3-2c.5-.7.8-1.5 1-1.7-1.9-.7-2.6-2.2-2.6-3.6zM13.8 6.5c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.9.07 1.7-.4 2.3-1.1z',
  google:  'circle:12,12,4|M16 12c0-.5 0-1-.1-1.4H12v2.6h2.3c-.1.7-.5 1.3-1 1.6',
  chat:    'M4 5h16v11H9l-5 4z|M8 9h8M8 12h5',
  shield2: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  alert:   'M12 4l9 16H3z|M12 10v4|M12 16.6v.4',
  wallet:  'rect:3,6,18,13,3|M16 12h3v3h-3a1.5 1.5 0 0 1 0-3z|M3 8h13',
  link:    'M9 12h6|M10 8H7a4 4 0 0 0 0 8h3|M14 8h3a4 4 0 0 1 0 8h-3',
  gear:    'M12 9a3 3 0 100 6 3 3 0 000-6z|M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2l-.4-2.6H8.9l-.4 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2l.4 2.6h4.2l.4-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0019 12z',
  bell:    'M18 9a6 6 0 10-12 0c0 7-2 8-2 8h16s-2-1-2-8z|M10.5 21a2 2 0 003 0',
  help:    'M9.2 9a3 3 0 015.6 1.5c0 2-3 2.2-3 4|M12 17.5v.4|circle:12,12,9',
  logout:  'M14 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2v-2|M9 12h11|M17 8l4 4-4 4',
  gift:    'rect:3,8,18,5,1|M3 13h18v8H3z|M12 8v13|M12 8S10.5 3 8 4.5 9 8 12 8zm0 0s1.5-5 4-3.5S15 8 12 8z',
  cardback:'rect:3,5,18,14,3|M3 9h18|M7 15h4',
  chevR:   'M9 6l6 6-6 6',
  flame:   'M12 3s5 4 5 9a5 5 0 01-10 0c0-2 1-3 1-3s.5 2 2 2c0-3 2-5 2-8z',
  handshake: 'm11 17 2 2a1 1 0 1 0 3-3|m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.8 5.8 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4|m21 3 1 11h-2|M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3|M3 4h8',
  clip:    'M21 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.3 3.3 0 014.7 4.7l-8 8a1.6 1.6 0 01-2.3-2.3l7.5-7.5',
  send:    'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  image:   'rect:3,4,18,16,2|circle:8.5,9.5,1.6|M21 15l-5-4L6 20',
  target:  'circle:12,12,8|circle:12,12,4.2|circle:12,12,0.6',
  trophy:  'M7 4h10v4a5 5 0 0 1-10 0z|M7 6H4v1a3 3 0 0 0 3 3|M17 6h3v1a3 3 0 0 1-3 3|M9 15h6l1 5H8z',
};

function Ic({ name, size = 20, stroke = 'currentColor', sw = 1.8, fill = 'none', style }) {
  const spec = ICONS[name] || '';
  const parts = spec.split('|');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, ...style }}>
      {parts.map((p, i) => {
        if (p.startsWith('circle:')) {
          const [cx, cy, r] = p.slice(7).split(',').map(Number);
          return <circle key={i} cx={cx} cy={cy} r={r} stroke={stroke} strokeWidth={sw} fill={fill}/>;
        }
        if (p.startsWith('rect:')) {
          const [x, y, w, h, r] = p.slice(5).split(',').map(Number);
          return <rect key={i} x={x} y={y} width={w} height={h} rx={r || 0} stroke={stroke} strokeWidth={sw} fill={fill}/>;
        }
        return <path key={i} d={p} stroke={stroke} strokeWidth={sw} fill={fill} strokeLinecap="round" strokeLinejoin="round"/>;
      })}
    </svg>
  );
}

// ── Typography ─────────────────────────────────────────────────────────────
function H1({ children, style }) {
  return <div style={{ fontFamily: 'var(--heading-font)', fontWeight: 'var(--heading-weight)',
    letterSpacing: 'var(--heading-tracking)', fontSize: 28, lineHeight: 1.12, color: 'var(--text)', ...style }}>{children}</div>;
}
function H2({ children, style }) {
  return <div style={{ fontFamily: 'var(--heading-font)', fontWeight: 'var(--heading-weight)',
    letterSpacing: 'var(--heading-tracking)', fontSize: 20, lineHeight: 1.2, color: 'var(--text)', ...style }}>{children}</div>;
}
function Eyebrow({ children, style }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--accent)', ...style }}>{children}</div>;
}
function Sub({ children, style }) {
  return <div style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--text-2)', ...style }}>{children}</div>;
}
function Muted({ children, style }) {
  return <span style={{ color: 'var(--text-3)', ...style }}>{children}</span>;
}
function Label({ children, style }) {
  return <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: 'var(--text-2)', marginBottom: 6, ...style }}>{children}</div>;
}

// ── Buttons ──────────────────────────────────────────────────────────────
function Btn({ children, onClick, kind = 'primary', full, size = 'lg', style, disabled, iconRight }) {
  const h = size === 'lg' ? 52 : size === 'md' ? 44 : 36;
  const fs = size === 'lg' ? 17 : size === 'md' ? 15 : 13;
  const base = {
    height: h, borderRadius: 'var(--btn-radius)', fontSize: fs, fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: full ? '100%' : undefined, padding: '0 20px', cursor: disabled ? 'default' : 'pointer',
    border: '1px solid transparent', fontFamily: 'var(--font)', boxSizing: 'border-box',
    transition: 'transform .12s ease, filter .12s ease, background .12s', userSelect: 'none',
    opacity: disabled ? 0.4 : 1, WebkitTapHighlightColor: 'transparent',
  };
  const kinds = {
    primary: { background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: 'var(--shadow-sm)' },
    secondary: { background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border-strong)' },
    tint: { background: 'var(--accent-weak)', color: 'var(--accent)' },
    ghost: { background: 'transparent', color: 'var(--accent)' },
    dark: { background: 'var(--text)', color: 'var(--surface)' },
  };
  return (
    <button onClick={disabled ? undefined : onClick} className="tc-btn"
      style={{ ...base, ...kinds[kind], ...style }}>
      {children}{iconRight && <Ic name={iconRight} size={fs + 2} sw={2.2}/>}
    </button>
  );
}

// ── Surfaces ───────────────────────────────────────────────────────────────
function Card({ children, style, onClick, flat, selected }) {
  return (
    <div onClick={onClick} className={onClick ? 'tc-tap' : ''}
      style={{ background: 'var(--surface)', borderRadius: 'var(--card-radius)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: flat ? 'none' : 'var(--shadow)', boxSizing: 'border-box',
        cursor: onClick ? 'pointer' : undefined, ...style }}>
      {children}
    </div>
  );
}

function Field({ label, value, placeholder, focus, suffix, prefix, onClick, style, hint, multiline, type = 'text', onChange, inputStyle }) {
  const [val, setVal] = React.useState(value || '');
  const [foc, setFoc] = React.useState(false);
  React.useEffect(() => { setVal(value || ''); }, [value]);
  const editable = !onClick;
  const showFocus = focus || foc;
  const common = { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
    fontFamily: 'inherit', fontSize: 16, color: 'var(--text)', padding: 0, width: '100%' };
  return (
    <div style={style} onClick={onClick}>
      {label && <Label>{label}</Label>}
      <div style={{ display: 'flex', alignItems: multiline ? 'flex-start' : 'center', gap: 8,
        minHeight: multiline ? 'auto' : 50, padding: multiline ? '12px 14px' : '0 14px',
        background: 'var(--surface)', borderRadius: 'var(--field-radius)',
        border: `1.5px solid ${showFocus ? 'var(--accent)' : 'var(--border-strong)'}`,
        boxShadow: showFocus ? '0 0 0 4px var(--accent-weak)' : 'none', boxSizing: 'border-box',
        cursor: onClick ? 'pointer' : 'text', transition: 'border-color .15s, box-shadow .15s' }}>
        {prefix}
        {editable ? (
          multiline ? (
            <textarea value={val} placeholder={placeholder} rows={4}
              onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
              onChange={e => { setVal(e.target.value); onChange && onChange(e.target.value); }}
              style={{ ...common, resize: 'none', lineHeight: 1.5, minHeight: 76, ...inputStyle }}/>
          ) : (
            <input type={type} value={val} placeholder={placeholder}
              onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
              onChange={e => { setVal(e.target.value); onChange && onChange(e.target.value); }}
              style={{ ...common, ...inputStyle }}/>
          )
        ) : (
          <span style={{ flex: 1, fontSize: 16, color: val ? 'var(--text)' : 'var(--text-3)' }}>{val || placeholder}</span>
        )}
        {suffix}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

// ── Select — tap to expand an inline option list (no clipping in scroll areas) ──
function Select({ label, value, options, onChange, placeholder = 'Select…', style }) {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState(value || '');
  React.useEffect(() => { setVal(value || ''); }, [value]);
  const opts = (options || []).map(o => typeof o === 'string' ? { value: o, label: o } : o);
  const pick = (o) => { setVal(o.value); setOpen(false); onChange && onChange(o.value); };
  const curLabel = (opts.find(o => o.value === val) || {}).label;
  return (
    <div style={style}>
      {label && <Label>{label}</Label>}
      <div onClick={() => setOpen(o => !o)} className="tc-tap"
        style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 50, padding: '0 14px',
          background: 'var(--surface)', borderRadius: 'var(--field-radius)', cursor: 'pointer',
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border-strong)'}`,
          boxShadow: open ? '0 0 0 4px var(--accent-weak)' : 'none', boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s' }}>
        <span style={{ flex: 1, fontSize: 16, color: curLabel ? 'var(--text)' : 'var(--text-3)' }}>{curLabel || placeholder}</span>
        <Ic name="chevdown" size={18} stroke="var(--text-3)" sw={1.8} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}/>
      </div>
      {open && (
        <div style={{ marginTop: 6, border: '1.5px solid var(--border-strong)', borderRadius: 'var(--field-radius)',
          background: 'var(--surface)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          {opts.map((o, i) => {
            const on = o.value === val;
            return (
              <div key={o.value} onClick={() => pick(o)} className="tc-tap"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '13px 14px', cursor: 'pointer',
                  fontSize: 15, fontWeight: on ? 600 : 500, color: on ? 'var(--accent)' : 'var(--text)',
                  background: on ? 'var(--accent-weak)' : 'transparent',
                  borderTop: i ? '1px solid var(--border)' : 'none' }}>
                {o.label}
                {on && <Ic name="check" size={16} stroke="var(--accent)" sw={2.4}/>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Toast — transient feedback for actions whose backend Claude Code will build ──
function showToast(msg) { window.dispatchEvent(new CustomEvent('noottoast', { detail: msg })); }

// Open the native file picker; toast the chosen file name (upload wired in Claude Code)
function pickFile(accept, onPick) {
  const input = document.createElement('input');
  input.type = 'file';
  if (accept) input.accept = accept;
  input.style.display = 'none';
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (f) { onPick ? onPick(f) : showToast(`Selected ${f.name}`); }
    input.remove();
  };
  document.body.appendChild(input);
  input.click();
}
function Toast() {
  const [msg, setMsg] = React.useState(null);
  React.useEffect(() => {
    let id;
    const h = (e) => { setMsg(e.detail); clearTimeout(id); id = setTimeout(() => setMsg(null), 2300); };
    window.addEventListener('noottoast', h);
    return () => { window.removeEventListener('noottoast', h); clearTimeout(id); };
  }, []);
  if (!msg) return null;
  return (
    <div className="bk-toast" style={{ position: 'absolute', left: '50%', bottom: 100, transform: 'translateX(-50%)', zIndex: 80,
      background: 'var(--text)', color: 'var(--surface)', padding: '11px 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 600,
      boxShadow: '0 8px 30px rgba(0,0,0,0.28)', maxWidth: '84%', textAlign: 'center', lineHeight: 1.35 }}>{msg}</div>
  );
}

function Chip({ children, on, tint, onClick, style }) {
  const styles = on
    ? { background: 'var(--text)', color: 'var(--surface)', borderColor: 'var(--text)' }
    : tint
    ? { background: 'var(--accent-weak)', color: 'var(--accent)', borderColor: 'transparent' }
    : { background: 'var(--surface)', color: 'var(--text-2)', borderColor: 'var(--border-strong)' };
  return (
    <span onClick={onClick} className={onClick ? 'tc-tap' : ''}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 34, padding: '0 14px',
        borderRadius: 'var(--chip-radius)', border: '1px solid', fontSize: 13, fontWeight: 600,
        whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : undefined, ...styles, ...style }}>{children}</span>
  );
}

function Badge({ children, tone = 'neutral', style }) {
  const tones = {
    neutral: { background: 'var(--surface-2)', color: 'var(--text-2)' },
    accent: { background: 'var(--accent)', color: 'var(--on-accent)' },
    accentSoft: { background: 'var(--accent-weak)', color: 'var(--accent)' },
    good: { background: 'var(--good-weak)', color: 'var(--good)' },
    ink: { background: 'var(--text)', color: 'var(--surface)' },
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px',
      fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', borderRadius: 7, ...tones[tone], ...style }}>{children}</span>
  );
}

function Avatar({ size = 44, label, accent, style }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: accent ? 'var(--accent)' : 'var(--surface-2)',
      border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: accent ? 'var(--on-accent)' : 'var(--text-3)', fontWeight: 700, fontSize: size * 0.36,
      overflow: 'hidden', ...style }}>
      {label || <Ic name="user" size={size * 0.55} stroke="currentColor" sw={1.6}/>}
    </div>
  );
}

// Image placeholder — subtle stripes + monospace caption (per design guidance)
function ImgSlot({ h = 120, label = 'image', style }) {
  return (
    <div style={{ height: h, borderRadius: 'var(--card-radius)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'repeating-linear-gradient(135deg, var(--surface-2) 0 10px, var(--surface-alt) 10px 20px)',
      border: '1px solid var(--border)', boxSizing: 'border-box', ...style }}>
      <span style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 11, color: 'var(--text-3)',
        letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <div onClick={onClick} className="tc-tap" style={{ width: 51, height: 31, borderRadius: 999, flexShrink: 0,
      background: on ? 'var(--accent)' : 'var(--surface-2)', border: on ? 'none' : '1px solid var(--border-strong)',
      position: 'relative', transition: 'background .2s', cursor: 'pointer' }}>
      <div style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 27, height: 27, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left .2s' }}/>
    </div>
  );
}

function Divider({ style }) {
  return <div style={{ height: 1, background: 'var(--border)', ...style }}/>;
}

// ── Progress ────────────────────────────────────────────────────────────────
function ProgressDots({ total, current, style }) {
  return (
    <div style={{ display: 'flex', gap: 4, ...style }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 4, borderRadius: 2,
          background: i < current ? 'var(--accent)' : 'var(--surface-2)',
          transition: 'background .3s' }}/>
      ))}
    </div>
  );
}

function Stepper({ n, active, done, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
      borderRadius: '50%', flexShrink: 0, fontWeight: 700, fontSize: 13,
      background: done ? 'var(--accent)' : active ? 'var(--accent-weak)' : 'transparent',
      color: done ? 'var(--on-accent)' : active ? 'var(--accent)' : 'var(--text-3)',
      border: `1.5px solid ${done || active ? 'transparent' : 'var(--border-strong)'}` }}>
      {done ? <Ic name="check" size={15} sw={2.6}/> : (label || n)}
    </div>
  );
}

// ── Layout primitives for the device screen ────────────────────────────────
// Top inset clears the status bar + dynamic island; bottom clears home indicator.
const TOP_INSET = 56;
const BOT_INSET = 28;

function Screen({ children, style }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)',
      color: 'var(--text)', position: 'relative', ...style }}>{children}</div>
  );
}

// In-screen nav header (back chevron + optional title + trailing action)
function NavTop({ onBack, title, trailing, transparent, large, style, children }) {
  return (
    <div style={{ paddingTop: TOP_INSET, flexShrink: 0,
      background: transparent ? 'transparent' : 'var(--bg)', position: 'relative', zIndex: 4, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 12px 0 8px', gap: 4 }}>
        <div style={{ width: 64, display: 'flex' }}>
          {onBack && (
            <button onClick={onBack} className="tc-tap" style={{ display: 'flex', alignItems: 'center', gap: 1,
              background: 'none', border: 'none', color: 'var(--accent)', padding: '6px 6px 6px 0', cursor: 'pointer',
              fontSize: 17, fontFamily: 'var(--font)' }}>
              <Ic name="back" size={22} stroke="var(--accent)" sw={2.4}/>
            </button>
          )}
        </div>
        <div style={{ flex: 1, textAlign: children ? 'left' : 'center', fontSize: 17, fontWeight: 600, color: 'var(--text)', minWidth: 0 }}>
          {children ? children : (!large && title)}
        </div>
        <div style={{ width: 64, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>{trailing}</div>
      </div>
      {large && title && (
        <div style={{ padding: '4px 20px 6px' }}>
          <H1 style={{ fontSize: 32 }}>{title}</H1>
        </div>
      )}
    </div>
  );
}

// Scrolling body
function Body({ children, style, pad = 20 }) {
  return (
    <div className="tc-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch',
      padding: `4px ${pad}px ${pad}px`, ...style }}>{children}</div>
  );
}

// Sticky bottom action bar (clears home indicator)
function ActionBar({ children, style }) {
  return (
    <div style={{ flexShrink: 0, padding: `12px 20px ${BOT_INSET}px`, background: 'var(--bg)',
      borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center',
      position: 'relative', zIndex: 4, ...style }}>{children}</div>
  );
}

// Bottom tab bar — role-aware app shell. `active` is a route key; `go(key)` navigates.
// The noot lizard shows as the Home mark and inside the Search magnifier.
function TabGlyph({ name, on }) {
  const op = on ? 1 : 0.42;
  if (name === 'home') {
    // brand foot / gecko mark
    return <Gecko size={23} tone="sage" style={{ opacity: op }}/>;
  }
  if (name === 'search') {
    // lizard-in-a-magnifying-glass
    return (
      <div style={{ position: 'relative', width: 24, height: 24, opacity: op }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', inset: 0 }}>
          <circle cx="10.5" cy="10.5" r="7.2" stroke="currentColor" strokeWidth={on ? 2.1 : 1.8}/>
          <path d="M16 16l5 5" stroke="currentColor" strokeWidth={on ? 2.4 : 2} strokeLinecap="round"/>
        </svg>
        <Gecko size={10} tone="sage" style={{ position: 'absolute', left: 5.5, top: 5.5 }}/>
      </div>
    );
  }
  return <Ic name={name} size={23} stroke="currentColor" sw={on ? 2.1 : 1.7}/>;
}

function TabBar({ active = 'home', go, onTab, role }) {
  const student = [['Home', 'home', 'home'], ['Search', 'search', 'student_home'], ['Sessions', 'cal', 'sessions'], ['Profile', 'user', 'profile']];
  const tutor = [['Home', 'home', 'tutor_home'], ['Calendar', 'cal', 'tutor_calendar'], ['Sessions', 'list', 'tutor_sessions'], ['Profile', 'user', 'tutor_profile']];
  const tabs = role === 'tutor' ? tutor : student;
  return (
    <div style={{ flexShrink: 0, display: 'flex', padding: `8px 8px ${BOT_INSET}px`, background: 'var(--surface)',
      borderTop: '1px solid var(--border)', position: 'relative', zIndex: 4 }}>
      {tabs.map(([t, ic, key], i) => {
        const on = active === key || active === i;
        return (
          <div key={t} onClick={() => { if (go) go(key); else if (onTab) onTab(i); }} className="tc-tap"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 0',
              color: on ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer' }}>
            <TabGlyph name={ic} on={on}/>
            <span style={{ fontSize: 10, fontWeight: on ? 700 : 500 }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
}

// Hero "T" logo mark
// ── noot brand marks (data URIs from brand-data.jsx) ─────────────────────────
const BRAND = window.BRAND || {};

// Gecko silhouette (primary mark). tone: 'sage' | 'cream' | 'deep'
function Gecko({ size = 28, tone = 'sage', style }) {
  const src = tone === 'deep' ? BRAND.geckoDeep : tone === 'cream' ? BRAND.geckoCream : BRAND.geckoSage;
  return <img src={src} alt="noot" width={size} height={size} style={{ display: 'block', objectFit: 'contain', flexShrink: 0, ...style }}/>;
}

// App-icon lockup: white gecko on sage rounded square
function LogoMark({ size = 36, radius }) {
  return (
    <img src={BRAND.appIcon} alt="noot" width={size} height={size}
      style={{ display: 'block', borderRadius: radius != null ? radius : size * 0.26, flexShrink: 0, objectFit: 'cover' }}/>
  );
}

// Wordmark lockup: gecko mark + lowercase "noot" set in the brand geometric sans
function Wordmark({ size = 19, mark = true, tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.45 }}>
      {mark && <Gecko size={size * 1.5} tone="sage"/>}
      <span style={{ fontFamily: '"Poppins", var(--heading-font)', fontWeight: 700, fontSize: size,
        letterSpacing: '-0.04em', color: tone === 'cream' ? '#F4F2EC' : tone === 'sage' ? 'var(--accent)' : 'var(--text)',
        lineHeight: 1 }}>noot</span>
    </div>
  );
}

// Circular hero icon badge (used on confirmation screens)
function HeroIcon({ name, size = 72, style }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow)', ...style }}>
      <Ic name={name} size={size * 0.42} stroke="var(--on-accent)" sw={2.4}/>
    </div>
  );
}

Object.assign(window, {
  Ic, H1, H2, Eyebrow, Sub, Muted, Label,
  Btn, Card, Field, Chip, Badge, Avatar, ImgSlot, Toggle, Divider,
  ProgressDots, Stepper, Screen, NavTop, Body, ActionBar, TabBar,
  LogoMark, Wordmark, Gecko, HeroIcon, BRAND, TOP_INSET, BOT_INSET,
  showToast, Toast, Select, pickFile,
});

// Shared option sets (used across student + tutor forms)
window.YEAR_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate Student'];
window.GRADE_OPTIONS = ['A', 'A-', 'B+', 'B'];
window.SEMESTER_OPTIONS = (() => {
  const out = [];
  for (let y = 2025; y >= 2023; y--) ['Fall', 'Summer', 'Spring'].forEach(t => out.push(`${t} ${y}`));
  return out;
})();
