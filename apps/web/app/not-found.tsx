// App Router 404. Also load-bearing for the build: without an App Router not-found, Next
// falls back to prerendering its built-in pages-router `_error`, which in this pnpm workspace
// resolves a second copy of react-dom (next/node_modules/react-dom) and crashes the export
// with "Cannot read properties of null (reading 'useContext')".
export default function NotFound() {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: '0 auto',
        padding: '96px 24px',
        fontFamily: '-apple-system, system-ui, sans-serif',
        color: '#283028',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 30, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Page not found</h1>
      <p style={{ color: '#6B7266', margin: '0 0 24px' }}>That link doesn&apos;t go anywhere.</p>
      <a href="/" style={{ color: '#78A070', fontWeight: 600, textDecoration: 'none' }}>
        ← Back to noot
      </a>
    </main>
  );
}
