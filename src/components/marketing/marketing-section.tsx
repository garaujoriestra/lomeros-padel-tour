/**
 * Primitiva de sección de la landing "Broadcast elevado".
 * Cabecera apilada (kicker opcional + título display + lead opcional) sobre el
 * escenario oscuro-verde, seguida del cuerpo (children). Las secciones con
 * maqueta a medida (hero, marcador, planificador) se construyen aparte.
 */
export function MarketingSection({
  kicker,
  title,
  lead,
  children,
  align = 'left',
}: {
  kicker?: string;
  title: string;
  lead?: React.ReactNode;
  children?: React.ReactNode;
  align?: 'left' | 'center';
}) {
  return (
    <section className="mkt-section">
      <div className="lpt-container">
        <div className={align === 'center' ? 'mkt-head--center' : 'mkt-head'}>
          {kicker && (
            <p className="kicker mkt-kicker">
              <span className="mkt-tick" aria-hidden /> {kicker}
            </p>
          )}
          <h2 className="display mkt-h2">{title}</h2>
          {lead && <p className="mkt-lead">{lead}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
