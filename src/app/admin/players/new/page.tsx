import { PlayerForm } from '@/components/admin/player-form';

export default function NewPlayerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nuevo jugador</h1>
        <p className="text-gray-500 text-sm">Añade un nuevo jugador al grupo</p>
      </div>
      <PlayerForm />
    </div>
  );
}
