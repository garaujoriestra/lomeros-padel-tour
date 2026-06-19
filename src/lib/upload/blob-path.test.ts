import { describe, it, expect } from 'vitest';
import { buildAvatarKey } from './blob-path';

describe('buildAvatarKey', () => {
  it('namespacea la ruta del avatar por grupo', () => {
    expect(buildAvatarKey('lomeros', 'abc-123', 'png')).toBe('avatars/lomeros/abc-123.png');
  });

  it('normaliza la extensión a minúsculas y sin punto', () => {
    expect(buildAvatarKey('grupo-test', 'uuid', '.JPG')).toBe('avatars/grupo-test/uuid.jpg');
  });

  it('cae a jpg si la extensión viene vacía', () => {
    expect(buildAvatarKey('lomeros', 'uuid', '')).toBe('avatars/lomeros/uuid.jpg');
  });
});
