import { describe, it, expect } from 'vitest';
import { CACHE_NO_TIMEOUT, DEFAULT_CACHE_TTL_MS } from '../constants';

describe('constants', () => {
  it('CACHE_NO_TIMEOUT should be Infinity', () => {
    expect(CACHE_NO_TIMEOUT).toBe(Infinity);
  });

  it('DEFAULT_CACHE_TTL_MS should be 5 minutes', () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(300_000);
  });
});
