// screens-chat.jsx — full conversation thread between student and tutor.
// Persisted per tutor via NootStore. Supports text + image/file attachments.
const { useState: useChat, useEffect: useChatEff, useRef: useChatRef } = React;

function Chat({ go, back, booking, perspective = 'student' }) {
  const store = useNootStore();
  const t = tutorById(booking.chatWith || booking.tutor) || TUTORS[0];
  const other = perspective === 'student' ? t.name : 'Lindsay Thomas';
  const otherSub = perspective === 'student' ? `${t.year} · ${t.major}` : 'Sophomore · Pre-Business';
  const thread = store.getThread(t.id);

  const [draft, setDraft] = useChat('');
  const [pending, setPending] = useChat([]); // staged attachments before send
  const scrollRef = useChatRef(null);
  const fileRef = useChatRef(null);

  // keep pinned to the newest message
  useChatEff(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [thread.length, pending.length]);

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    const next = files.map(f => ({
      name: f.name,
      kind: f.type.startsWith('image/') ? 'image' : 'file',
      size: f.size,
      url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    }));
    setPending(p => [...p, ...next]);
    e.target.value = '';
  };

  const send = () => {
    const text = draft.trim();
    if (!text && pending.length === 0) return;
    store.send(t.id, { who: perspective, text, attach: pending.length ? pending : undefined });
    setDraft('');
    setPending([]);
  };

  return (
    <Screen>
      <NavTop onBack={back} title="" trailing={
        <button className="tc-tap" onClick={() => showToast('Notifications \u2014 built with backend')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
          <Ic name="bell" size={20} stroke="var(--text-2)" sw={1.8}/>
        </button>
      }>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar size={34} label={other[0]}/>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>{other}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{otherSub}</div>
          </div>
        </div>
      </NavTop>

      {/* message list */}
      <div ref={scrollRef} className="tc-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '14px 16px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 10px' }}>
          This is your full conversation with {other.split(' ')[0]}.
        </div>
        {thread.map((m, i) => {
          const mine = m.who === perspective;
          const prev = thread[i - 1];
          const showTime = !prev || prev.time !== m.time;
          return (
            <React.Fragment key={i}>
              {showTime && <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)', margin: '8px 0 2px' }}>{m.time}</div>}
              <Bubble mine={mine} m={m}/>
            </React.Fragment>
          );
        })}
        {pending.length > 0 && (
          <div style={{ alignSelf: 'flex-end', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: '80%' }}>
            {pending.map((a, i) => (
              <AttachChip key={i} a={a} onRemove={() => setPending(p => p.filter((_, j) => j !== i))}/>
            ))}
          </div>
        )}
      </div>

      {/* composer */}
      <div style={{ flexShrink: 0, padding: `8px 12px ${BOT_INSET}px`, background: 'var(--surface)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'flex-end', gap: 8, position: 'relative', zIndex: 4 }}>
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt" multiple onChange={onPick} style={{ display: 'none' }}/>
        <button className="tc-tap" onClick={() => fileRef.current && fileRef.current.click()} aria-label="Attach"
          style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'var(--surface-2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ic name="clip" size={20} stroke="var(--text-2)" sw={1.8}/>
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--bg)', border: '1.5px solid var(--border-strong)',
          borderRadius: 22, padding: '2px 6px 2px 14px', minHeight: 40 }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder={`Message ${other.split(' ')[0]}…`} rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', background: 'transparent', fontFamily: 'inherit',
              fontSize: 15, lineHeight: 1.4, color: 'var(--text)', padding: '9px 0', maxHeight: 90 }}/>
        </div>
        <button className="tc-tap" onClick={send} aria-label="Send" disabled={!draft.trim() && pending.length === 0}
          style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: (draft.trim() || pending.length) ? 'var(--accent)' : 'var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s' }}>
          <Ic name="send" size={19} stroke={(draft.trim() || pending.length) ? 'var(--on-accent)' : 'var(--text-3)'} sw={1.9}/>
        </button>
      </div>
    </Screen>
  );
}

function Bubble({ mine, m }) {
  return (
    <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: 5, alignItems: mine ? 'flex-end' : 'flex-start' }}>
      {m.attach && m.attach.map((a, i) => <AttachView key={i} a={a} mine={mine}/>)}
      {m.text && (
        <div style={{ padding: '9px 13px', borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: mine ? 'var(--accent)' : 'var(--surface-2)', color: mine ? 'var(--on-accent)' : 'var(--text)',
          fontSize: 15, lineHeight: 1.42, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
      )}
    </div>
  );
}

// Attachment rendered inside a sent message
function AttachView({ a, mine }) {
  if (a.kind === 'image' && a.url) {
    return <img src={a.url} alt={a.name} style={{ maxWidth: 200, maxHeight: 220, borderRadius: 14, objectFit: 'cover', display: 'block' }}/>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderRadius: 14,
      background: mine ? 'var(--accent)' : 'var(--surface-2)', color: mine ? 'var(--on-accent)' : 'var(--text)' }}>
      <Ic name={a.kind === 'image' ? 'image' : 'doc'} size={20} stroke={mine ? 'var(--on-accent)' : 'var(--accent)'} sw={1.7}/>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
        {a.size != null && <div style={{ fontSize: 11, opacity: 0.75 }}>{fmtSize(a.size)}</div>}
      </div>
    </div>
  );
}

// Staged attachment chip (before send) with remove
function AttachChip({ a, onRemove }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, padding: a.kind === 'image' && a.url ? 0 : '8px 10px',
      borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      {a.kind === 'image' && a.url
        ? <img src={a.url} alt={a.name} style={{ width: 60, height: 60, objectFit: 'cover', display: 'block' }}/>
        : <><Ic name="doc" size={17} stroke="var(--accent)" sw={1.7}/><span style={{ fontSize: 12.5, color: 'var(--text)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span></>}
      <button onClick={onRemove} aria-label="Remove" style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%',
        border: 'none', background: 'rgba(0,0,0,.55)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
        <Ic name="x" size={11} stroke="#fff" sw={2.6}/>
      </button>
    </div>
  );
}

function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

Object.assign(window, { Chat, ChatTutor });

function ChatTutor(props) { return <Chat {...props} perspective="tutor"/>; }
