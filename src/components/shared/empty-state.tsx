import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Estado vacío on-brand y quieto. Unifica los empties ad-hoc del proyecto.
 * Usa `emoji` (compatibilidad con el look actual) O `icon` (lucide, tinta-3).
 * `action` es un CTA opcional (p. ej. en listas de admin).
 */
export function EmptyState({
  emoji,
  icon: Icon,
  title,
  hint,
  action,
}: {
  emoji?: string;
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="muted" style={{ textAlign: 'center', padding: '56px 16px' }}>
      {emoji ? (
        <p style={{ fontSize: 40, margin: '0 0 10px' }}>{emoji}</p>
      ) : Icon ? (
        <Icon size={40} strokeWidth={1.6} aria-hidden style={{ margin: '0 auto 12px', display: 'block', color: 'var(--ink-3)' }} />
      ) : null}
      <p style={{ fontWeight: 700, margin: 0 }}>{title}</p>
      {hint && <p className="small" style={{ marginTop: 6 }}>{hint}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
