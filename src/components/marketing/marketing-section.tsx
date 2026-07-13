export function MarketingSection({
  kicker, title, children, stage = false,
}: { kicker: string; title: string; children: React.ReactNode; stage?: boolean }) {
  return (
    <section
      style={{
        padding: 'calc(64px * var(--sp)) 0',
        ...(stage ? { background: 'var(--hero-bg)', color: 'oklch(0.97 0.008 120)' } : {}),
      }}
    >
      <div className="lpt-container">
        <p className="kicker" style={{ color: stage ? 'var(--acc)' : 'var(--ink-3)' }}>{kicker}</p>
        <h2 className="display" style={{ fontSize: 'clamp(28px, 5vw, 44px)', marginTop: 10, maxWidth: 720 }}>{title}</h2>
        <div style={{ marginTop: 20 }}>{children}</div>
      </div>
    </section>
  );
}
