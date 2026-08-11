// Shared shell + typography for the legal pages.
//
// These exist because the App Store requires a publicly reachable privacy policy URL before
// a submission is accepted, and Guideline 5.1.1(v) requires the account-deletion route to be
// documented. They are deliberately plain HTML with inline styles — the marketing site has no
// design system, and a legal page that renders identically everywhere is worth more than one
// that matches the brand.
import type { ReactNode } from 'react';

const WRAP: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '56px 24px 96px',
  color: '#283028',
  lineHeight: 1.65,
  fontSize: 16,
};

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main style={WRAP}>
      <a href="/" style={{ color: '#78A070', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>
        ← noot
      </a>
      <h1 style={{ fontSize: 32, margin: '20px 0 6px', letterSpacing: '-0.02em' }}>{title}</h1>
      <p style={{ color: '#6B7266', fontSize: 14, margin: '0 0 32px' }}>Last updated {updated}</p>
      {children}
      <hr style={{ border: 0, borderTop: '1px solid rgba(40,48,40,0.12)', margin: '40px 0 20px' }} />
      <p style={{ fontSize: 14, color: '#6B7266' }}>
        Questions? Email <a href="mailto:support@noot.app" style={{ color: '#78A070' }}>support@noot.app</a>.
      </p>
    </main>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: 20, margin: '32px 0 8px', letterSpacing: '-0.01em' }}>{children}</h2>;
}

export function P({ children }: { children: ReactNode }) {
  return <p style={{ margin: '0 0 14px' }}>{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return <ul style={{ margin: '0 0 14px', paddingLeft: 22 }}>{children}</ul>;
}
