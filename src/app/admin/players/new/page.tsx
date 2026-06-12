import { PlayerForm } from '@/components/admin/player-form';

export default function NewPlayerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Nuevo jugador</h1>
        <p className="muted text-sm mt-1.5">Añade un nuevo jugador al grupo</p>
      </div>
      <PlayerForm />
    </div>
  );
}
