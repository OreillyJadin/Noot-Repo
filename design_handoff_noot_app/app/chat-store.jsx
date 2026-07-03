// chat-store.jsx — persisted chat threads + live sessions list (prototype store).
// One thread per tutor id. Messages: { who:'student'|'tutor', text, attach?, time }
// Sessions: upcoming[] / past[]; "Book again" + a completed booking push to upcoming.

const NootStore = (() => {
  const KEY = 'noot_store_v1';

  // ── seed chat history (student ↔ tutor) ─────────────────────────────────────
  const SEED_THREADS = {
    sara: [
      { who: 'student', text: "Hey, I'm Lindsay! Looking forward to working through MGT 300 with you.", time: 'May 27' },
      { who: 'tutor', text: 'Hi Lindsay! Great — want to start with Porter\'s Five Forces? That\'s usually the trickiest on Reynolds\' exam.', time: 'May 27' },
      { who: 'student', text: 'Yes please. I\'ll bring my case packet.', time: 'May 27' },
      { who: 'tutor', text: 'Perfect. See you at Gorgas, 2nd floor 👍', time: 'May 28' },
      { who: 'student', text: 'That session was super helpful, thank you!', time: 'May 28' },
    ],
    nina: [
      { who: 'tutor', text: 'Hi Lindsay — confirmed for Thursday 9 AM on the integrated video call. I\'ll prep a few practice problems.', time: 'Jun 20' },
      { who: 'student', text: 'Amazing, thank you Nina!', time: 'Jun 20' },
    ],
    devon: [
      { who: 'student', text: "Hi Devon, I'm Lindsay — I'd love your help prepping for the MGT 300 midterm.", time: 'Jun 10' },
      { who: 'tutor', text: 'Happy to help! Send me the topics your prof emphasized and I\'ll build a session around them.', time: 'Jun 10' },
      { who: 'student', text: 'Mostly the strategy frameworks and the financial ratios section.', time: 'Jun 11' },
      { who: 'tutor', text: 'Got it. We\'ll drill both. 💪', time: 'Jun 11' },
    ],
    maya: [
      { who: 'student', text: 'Thanks for the session Maya — the framework drawings really clicked!', time: 'Jun 5' },
      { who: 'tutor', text: 'So glad! Reach out anytime you want to run through more. 🙂', time: 'Jun 5' },
    ],
  };

  const SEED_UPCOMING = [
    { id: 'sara', when: 'Tomorrow · 3:00 PM', course: 'MGT 300', where: 'Gorgas Library, Fl 2', soon: true },
    { id: 'nina', when: 'Thu Jun 25 · 9:00 AM', course: 'MGT 300', where: 'Online — Integrated Video', soon: false },
  ];
  const SEED_PAST = [
    { id: 'devon', when: 'Jun 12 · 2:00 PM', course: 'MGT 300', rated: false },
    { id: 'maya', when: 'Jun 5 · 4:30 PM', course: 'MGT 300', rated: true },
    { id: 'sara', when: 'May 28 · 1:00 PM', course: 'MGT 300', rated: true },
  ];

  function load() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
    return {
      threads: p.threads || JSON.parse(JSON.stringify(SEED_THREADS)),
      upcoming: p.upcoming || JSON.parse(JSON.stringify(SEED_UPCOMING)),
      past: p.past || JSON.parse(JSON.stringify(SEED_PAST)),
    };
  }

  let state = load();
  const subs = new Set();
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    subs.forEach(f => { try { f(); } catch (e) {} });
  }

  return {
    getThread(id) { return state.threads[id] ? state.threads[id].slice() : []; },
    send(id, msg) {
      const m = Object.assign({ who: 'student', time: 'Now' }, msg);
      state.threads[id] = [...(state.threads[id] || []), m];
      persist();
      return m;
    },
    getUpcoming() { return state.upcoming.slice(); },
    getPast() { return state.past.slice(); },
    // Add a confirmed booking to the top of Upcoming (used by B5 + Book again flow).
    addUpcoming(s) {
      // de-dupe an identical pending entry
      state.upcoming = [Object.assign({}, s), ...state.upcoming.filter(u => !(u.id === s.id && u.when === s.when))];
      persist();
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    reset() { try { localStorage.removeItem(KEY); } catch (e) {} state = load(); persist(); },
  };
})();

// Hook: re-render a component whenever the store changes.
function useNootStore() {
  const [, force] = React.useState(0);
  React.useEffect(() => NootStore.subscribe(() => force(n => n + 1)), []);
  return NootStore;
}

Object.assign(window, { NootStore, useNootStore });
