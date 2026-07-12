'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const DEFAULT_ACCENT = '#c8f03c'; // --acc por defecto (globals.css)

// Extrae el mensaje de error específico de la API si lo hay (respuesta no-JSON → null).
async function apiError(res: Response): Promise<string | null> {
  const data = await res.json().catch(() => null);
  return data?.error ?? null;
}

export function BrandingForm({
  slug,
  initial,
  pass,
}: {
  slug: string;
  initial: { logoUrl: string | null; accentColor: string | null };
  pass: { billingEnabled: boolean; active: boolean; paidUntil: string | null };
}) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [accentColor, setAccentColor] = useState(initial.accentColor);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('g', slug);
      fd.set('file', file);
      const res = await fetch('/api/upload/logo', { method: 'POST', body: fd });
      if (!res.ok) {
        toast.error((await apiError(res)) ?? 'No se pudo subir el logo');
        return;
      }
      const data = await res.json();
      setLogoUrl(data.url);
    } catch {
      toast.error('Error de red al subir el logo');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/groups/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ g: slug, logoUrl, accentColor }),
      });
      if (!res.ok) {
        toast.error((await apiError(res)) ?? 'No se pudo guardar la marca');
        return;
      }
      toast.success('Guardado');
      router.refresh();
    } catch {
      toast.error('Error de red al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function buyPass() {
    setCheckingOut(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ g: slug }),
      });
      if (!res.ok) {
        toast.error((await apiError(res)) ?? 'No se pudo iniciar el pago');
        return;
      }
      const data = await res.json();
      if (data?.url) window.location.assign(data.url);
      else toast.error('No se pudo iniciar el pago');
    } catch {
      toast.error('Error de red al iniciar el pago');
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Marca</h1>

      <section className="lpt-card p-4 flex flex-col gap-3">
        <h2 className="font-medium">Logo</h2>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview del blob subido
            <img src={logoUrl} alt="Logo del grupo" width={48} height={48} style={{ borderRadius: 10, objectFit: 'cover' }} />
          ) : (
            <span className="muted text-sm">Sin logo (se usa el escudo por defecto)</span>
          )}
          <label className="lpt-btn" style={{ cursor: 'pointer' }}>
            {uploading ? 'Subiendo…' : 'Subir logo'}
            {/* sr-only (no hidden) para que el input siga siendo enfocable con teclado */}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                // Resetea el input para que re-seleccionar el mismo fichero dispare onChange.
                e.currentTarget.value = '';
                if (file) uploadLogo(file);
              }}
            />
          </label>
          {logoUrl && (
            <button className="lpt-btn" onClick={() => setLogoUrl(null)}>
              Quitar
            </button>
          )}
        </div>
      </section>

      <section className="lpt-card p-4 flex flex-col gap-3">
        <h2 className="font-medium">Color de acento</h2>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Color de acento"
            value={accentColor ?? DEFAULT_ACCENT}
            onChange={(e) => setAccentColor(e.target.value)}
            style={{ width: 48, height: 32, cursor: 'pointer' }}
          />
          {accentColor && (
            <button className="lpt-btn" onClick={() => setAccentColor(null)}>
              Volver al de serie
            </button>
          )}
        </div>
      </section>

      <section className="lpt-card p-4 flex flex-col gap-2">
        <h2 className="font-medium">Pase de Temporada</h2>
        {pass.active ? (
          <p className="text-sm">
            ⭐ Tour Oficial — activo hasta {new Date(pass.paidUntil!).toLocaleDateString('es-ES')}
          </p>
        ) : pass.billingEnabled ? (
          <>
            <p className="muted text-sm">
              Tu marca (logo, color y sin atribución) se aplica con el Pase de Temporada.
            </p>
            <button className="lpt-btn primary" onClick={buyPass} disabled={checkingOut}>
              {checkingOut ? 'Abriendo…' : 'Conseguir el Pase de Temporada'}
            </button>
          </>
        ) : (
          <p className="muted text-sm">Incluido durante la beta — tu marca se aplica sin pagar.</p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button className="lpt-btn primary" onClick={save} disabled={saving || uploading}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
