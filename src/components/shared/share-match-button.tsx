'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface ShareMatchButtonProps {
  url: string;     // absolute URL of the match detail page
  title: string;   // page title for the share sheet
  text: string;    // text body (without the URL — APIs append it separately)
}

export function ShareMatchButton({ url, title, text }: ShareMatchButtonProps) {
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    setSharing(true);
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({ title, text, url });
      } else {
        // Fallback: open WhatsApp click-to-chat with prefilled text + url
        const fullText = `${text}\n${url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank');
      }
    } catch (e) {
      // User canceled the share sheet — ignore silently.
      // Other errors — show toast.
      if (e instanceof Error && e.name !== 'AbortError') {
        toast.error('No se pudo compartir');
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={handleShare}
      disabled={sharing}
      className="min-h-[40px] px-4 text-sm bg-green-600 hover:bg-green-700 text-white font-bold"
    >
      📤 {sharing ? 'Compartiendo...' : 'Compartir resultado'}
    </Button>
  );
}
