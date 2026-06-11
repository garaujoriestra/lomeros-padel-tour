'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MeProfileFormProps {
  initial: { name: string; nickname: string | null; avatarUrl: string | null; isLeftHanded: boolean | null };
}

export function MeProfileForm({ initial }: MeProfileFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    nickname: initial.nickname ?? '',
    avatarUrl: initial.avatarUrl ?? '',
    isLeftHanded: initial.isLeftHanded ?? false,
  });
  const [preview, setPreview] = useState<string>(initial.avatarUrl ?? '');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) {
      setForm((f) => ({ ...f, avatarUrl: data.url }));
      toast.success('Imagen subida');
    } else {
      toast.error(data.error || 'Error al subir la imagen');
      setPreview(form.avatarUrl);
    }
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success('Perfil actualizado');
      router.push('/me');
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Error al guardar');
      setLoading(false);
    }
  }

  const initials = initial.name
    ? initial.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle>Editar mi perfil</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Foto (opcional)</Label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-20 h-20 rounded-full overflow-hidden shrink-0 border-2 border-dashed border-gray-300 hover:border-green-500 transition-colors group"
              >
                {preview ? (
                  <Image src={preview} alt="Avatar" fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-2xl font-black">
                    {initials}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                  {uploading ? '⏳' : '📷'}
                </div>
              </button>
              {preview && (
                <button
                  type="button"
                  className="text-xs text-red-400 hover:text-red-600"
                  onClick={() => { setPreview(''); setForm((f) => ({ ...f, avatarUrl: '' })); }}
                >
                  ✕ Quitar foto
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">Apodo</Label>
            <Input
              id="nickname"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              placeholder="Ej: El Cañón"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isLeftHanded"
              type="checkbox"
              checked={form.isLeftHanded}
              onChange={(e) => setForm({ ...form, isLeftHanded: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="isLeftHanded" className="cursor-pointer">🤚 Zurdo</Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading || uploading} className="min-h-[40px] px-4 text-sm">
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
            <Button type="button" variant="outline" className="min-h-[40px] px-4 text-sm" onClick={() => router.push('/me')}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
