// Marketing landing (placeholder). Public front door → waitlist, how-it-works,
// app-store + web-app links. Uses shared brand tokens from @noot/theme.
import { resolveTheme } from '@noot/theme';

export default function Home() {
  const t = resolveTheme('sage', false);
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        background: t.bg,
        color: t.text,
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 56, margin: 0, letterSpacing: -1, fontWeight: 700 }}>noot</h1>
      <p style={{ fontSize: 18, color: t.text2, margin: 0 }}>
        peer tutoring for campus life
      </p>
      <a
        href="#waitlist"
        style={{
          marginTop: 24,
          background: t.accent,
          color: t.onAccent,
          padding: '14px 24px',
          borderRadius: 14,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Join the waitlist
      </a>
      {/* App Store Connect requires a publicly reachable privacy policy URL, and Apple's
          reviewers open it directly — so it has to be linked, not just deployed. */}
      <footer style={{ marginTop: 48, display: 'flex', gap: 20, fontSize: 14 }}>
        <a href="/privacy" style={{ color: t.text2 }}>Privacy Policy</a>
        <a href="/terms" style={{ color: t.text2 }}>Terms of Service</a>
      </footer>
    </main>
  );
}
