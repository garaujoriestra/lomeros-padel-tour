'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PlayerFormProps {
  initialData?: {
    id: string;
    name: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
}

export function PlayerForm({ initialData }: PlayerFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: initialData?.name ?? '',
    nickname: initialData?.nickname ?? '',
    avatarUrl: initialData?.avatarUrl ?? '',
  });
  const [preview, setPreview] = useState<string>(initialData?.avatarUrl ?? '');

  const isEditing = !!initialData;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview immediately
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

    const url = isEditing ? `/api/players/${initialData.id}` : '/api/players';
    const method = isEditing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      toast.success(isEditing ? 'Jugador actualizado' : 'Jugador creado');
      router.push('/admin/players');
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Error al guardar');
      setLoading(false);
    }
  }

  const initials = form.name
    ? form.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{isEditing ? 'Editar jugador' : 'Nuevo jugador'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Avatar picker */}
          <div className="space-y-2">
            <Label>Foto del jugador (opcional)</Label>
            <div className="flex items-center gap-4">
              {/* Preview circle */}
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
                  {uploading ? '⏳' : '📷 Cambiar'}
                </div>
              </button>

              <div className="flex-1 space-y-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? 'Subiendo...' : '📁 Seleccionar imagen'}
                </Button>
                <p className="text-xs text-gray-400">JPG, PNG, WEBP · Máx. 2MB</p>
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
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nombre completo"
              required
            />
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

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading || uploading} className="min-h-[40px] px-4 text-sm">
              {loading ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear jugador'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-[40px] px-4 text-sm"
              onClick={() => router.push('/admin/players')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
