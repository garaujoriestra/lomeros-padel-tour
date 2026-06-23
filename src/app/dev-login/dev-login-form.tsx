'use client';
import { useState } from 'react';

type Row = { userId: string; email: string; role: string | null; groupName: string | null };

export function DevLoginForm({ users }: { users: Row[] }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function enter(targetEmail: string) {
    setBusy(true);
    const res = await fetch('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: targetEmail }),
    });
    if (res.ok) {
      window.location.href = '/';
    } else {
      setBusy(false);
      alert('Error en dev-login');
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: '2rem auto', fontFamily: 'sans-serif', padding: '0 1rem' }}>
      <h1>Dev login</h1>
      <p style={{ background: '#fde68a', color: '#000', padding: '0.5rem', borderRadius: 6 }}>
        ⚠️ SOLO ENTORNOS DE PRUEBA. No existe en producción.
      </p>

      <h2>Entrar como usuario existente</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {users.map((u) => (
          <li key={`${u.userId}-${u.groupName ?? ''}`} style={{ marginBottom: 8 }}>
            <button disabled={busy} onClick={() => enter(u.email)}>
              {u.email}
              {u.role ? ` · ${u.role}` : ' · (sin grupo)'}
              {u.groupName ? ` · ${u.groupName}` : ''}
            </button>
          </li>
        ))}
      </ul>

      <h2>Entrar como nuevo</h2>
      <input
        type="email"
        placeholder="nuevo@ejemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Email nuevo"
      />
      <button disabled={busy || !email} onClick={() => enter(email)} style={{ marginLeft: 8 }}>
        Entrar como nuevo
      </button>
    </main>
  );
}
