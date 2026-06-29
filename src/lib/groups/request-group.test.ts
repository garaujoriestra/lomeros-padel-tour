import { describe, it, expect, vi, beforeEach } from 'vitest';

const getGroupBySlug = vi.fn();
vi.mock('./resolve-slug', () => ({ getGroupBySlug: (s: string) => getGroupBySlug(s) }));

import { groupIdFromQuery, groupIdFromValue } from './request-group';

beforeEach(() => getGroupBySlug.mockReset());

function req(qs: string) {
  return { nextUrl: { searchParams: new URLSearchParams(qs) } } as unknown as import('next/server').NextRequest;
}

describe('groupIdFromQuery', () => {
  it('null si no hay ?g=', async () => {
    expect(await groupIdFromQuery(req(''))).toBeNull();
    expect(getGroupBySlug).not.toHaveBeenCalled();
  });
  it('resuelve ?g=<slug> a su id', async () => {
    getGroupBySlug.mockResolvedValue({ id: 'gt-id', slug: 'grupo-test', name: 'Grupo Test' });
    expect(await groupIdFromQuery(req('g=grupo-test'))).toBe('gt-id');
  });
  it('null si el slug no existe', async () => {
    getGroupBySlug.mockResolvedValue(null);
    expect(await groupIdFromQuery(req('g=nope'))).toBeNull();
  });
});

describe('groupIdFromValue', () => {
  it('null para no-string o vacío', async () => {
    expect(await groupIdFromValue(undefined)).toBeNull();
    expect(await groupIdFromValue('')).toBeNull();
    expect(await groupIdFromValue(123)).toBeNull();
  });
  it('resuelve un slug a su id', async () => {
    getGroupBySlug.mockResolvedValue({ id: 'gt-id', slug: 'grupo-test', name: 'Grupo Test' });
    expect(await groupIdFromValue('grupo-test')).toBe('gt-id');
  });
});
