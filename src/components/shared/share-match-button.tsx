'use client';

import { Button } from '@/components/ui/button';

interface ShareMatchButtonProps {
  url: string; // absolute URL of the match detail page
}

export function ShareMatchButton({ url }: ShareMatchButtonProps) {
  function handleShare() {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(url)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <Button
      type="button"
      onClick={handleShare}
      className="min-h-11 px-4 text-sm bg-[#25D366] hover:bg-[#1ebe57] text-white font-bold inline-flex items-center gap-2"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M19.05 4.91A10 10 0 0 0 12 2a10 10 0 0 0-8.5 15.18L2 22l4.95-1.46A10 10 0 0 0 12 22a10 10 0 0 0 7.05-17.09zM12 20.27a8.27 8.27 0 0 1-4.21-1.16l-.3-.18-2.94.87.88-2.86-.2-.31A8.27 8.27 0 1 1 12 20.27zm4.55-6.2c-.25-.13-1.47-.73-1.69-.81s-.39-.13-.55.13-.63.81-.78.97-.29.18-.54.06a6.78 6.78 0 0 1-2-1.23 7.5 7.5 0 0 1-1.38-1.72c-.14-.25 0-.38.11-.5s.25-.29.37-.43a1.65 1.65 0 0 0 .25-.41.45.45 0 0 0 0-.43c-.06-.13-.55-1.32-.75-1.81s-.4-.41-.55-.42h-.47a.92.92 0 0 0-.66.31 2.78 2.78 0 0 0-.86 2.06 4.84 4.84 0 0 0 1 2.55 11.05 11.05 0 0 0 4.21 3.7 14.18 14.18 0 0 0 1.4.52 3.36 3.36 0 0 0 1.55.1 2.55 2.55 0 0 0 1.66-1.17 2.06 2.06 0 0 0 .14-1.17c-.06-.11-.22-.17-.46-.3z" />
      </svg>
      Compartir por WhatsApp
    </Button>
  );
}
