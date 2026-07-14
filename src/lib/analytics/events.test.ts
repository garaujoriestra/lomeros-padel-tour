import { describe, it, expect, vi } from 'vitest';

const trackMock = vi.hoisted(() => vi.fn());
vi.mock('@vercel/analytics/server', () => ({ track: trackMock }));

import { trackFunnel } from './events';

describe('trackFunnel', () => {
  it('delega en track con nombre y props', async () => {
    trackMock.mockResolvedValueOnce(undefined);
    await trackFunnel('grupo_creado', { slug: 'mi-grupo' });
    expect(trackMock).toHaveBeenCalledWith('grupo_creado', { slug: 'mi-grupo' });
  });

  it('NUNCA propaga errores (best-effort: local/e2e/plan sin eventos)', async () => {
    trackMock.mockRejectedValueOnce(new Error('analytics no disponible'));
    await expect(trackFunnel('partido_creado')).resolves.toBeUndefined();

    trackMock.mockImplementationOnce(() => {
      throw new Error('throw síncrono');
    });
    await expect(trackFunnel('jugador_anadido')).resolves.toBeUndefined();
  });
});
