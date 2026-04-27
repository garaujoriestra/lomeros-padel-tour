import { Navbar } from '@/components/shared/navbar';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#f0fdf4 0%,#dcfce7 45%,#f0fdf4 80%,#ecfdf5 100%)' }}>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
        {children}
      </main>
    </div>
  );
}
