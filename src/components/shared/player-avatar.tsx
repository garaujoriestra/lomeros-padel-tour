import Image from 'next/image';
import { cn } from '@/lib/utils';

interface PlayerAvatarProps {
  name: string;
  avatarUrl?: string | null;
  /** sizing + shape, e.g. "w-12 h-12 rounded-xl" */
  className?: string;
  /** bg/gradient + text styling for the initial fallback box */
  fallbackClassName?: string;
  /** next/image sizes hint; default fine for small avatars */
  sizes?: string;
}

export function PlayerAvatar({ name, avatarUrl, className, fallbackClassName, sizes }: PlayerAvatarProps) {
  const initial = name?.charAt(0)?.toUpperCase() ?? '?';
  if (avatarUrl) {
    // next/image no puede optimizar data: URIs (avatares antiguos en base64);
    // para esos usamos un <img> normal. Los https (Vercel Blob) van por next/image.
    const isDataUri = avatarUrl.startsWith('data:');
    return (
      <div className={cn('relative overflow-hidden shrink-0', className)}>
        {isDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <Image src={avatarUrl} alt={name} fill className="object-cover" sizes={sizes ?? '96px'} />
        )}
      </div>
    );
  }
  return (
    <div className={cn('flex items-center justify-center shrink-0', className, fallbackClassName)}>
      {initial}
    </div>
  );
}
