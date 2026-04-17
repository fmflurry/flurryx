import { describe, it, expect } from 'vitest';
import {
  isKeyedResourceData,
  createKeyedResourceData,
  isAnyKeyLoading,
} from '../keyed-resource';

describe('isKeyedResourceData', () => {
  it('should return true for valid keyed resource data', () => {
    const data = createKeyedResourceData();
    expect(isKeyedResourceData(data)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isKeyedResourceData(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isKeyedResourceData(undefined)).toBe(false);
  });

  it('should return false for a primitive', () => {
    expect(isKeyedResourceData('string')).toBe(false);
    expect(isKeyedResourceData(42)).toBe(false);
  });

  it('should return false for an object missing required fields', () => {
    expect(isKeyedResourceData({ foo: 'bar' })).toBe(false);
    expect(isKeyedResourceData({ '1': 'value' })).toBe(false);
  });

  it('should return false if any field is null', () => {
    expect(isKeyedResourceData({ '1': null })).toBe(false);
  });

  it('should return true for a fully populated keyed resource', () => {
    const data = {
      '1': {
        data: 'hello',
        isLoading: false,
        status: 'Success' as const,
      },
    };
    expect(isKeyedResourceData(data)).toBe(true);
  });
});

describe('createKeyedResourceData', () => {
  it('should create an empty keyed resource data structure', () => {
    const data = createKeyedResourceData<string, number>();
    expect(data).toEqual({});
  });

  it('should create independent instances', () => {
    const a = createKeyedResourceData();
    const b = createKeyedResourceData();
    expect(a).not.toBe(b);
    a['1'] = { data: 'hello' };
    expect(b['1']).toBeUndefined();
  });
});

describe('isAnyKeyLoading', () => {
  it('should return false for empty keyed data', () => {
    expect(isAnyKeyLoading({})).toBe(false);
  });

  it('should return false when all entries are not loading', () => {
    expect(
      isAnyKeyLoading({
        a: { isLoading: false },
        b: { status: 'Success' },
      })
    ).toBe(false);
  });

  it('should return true when at least one key is loading', () => {
    expect(
      isAnyKeyLoading({
        a: { isLoading: false },
        b: { isLoading: true },
      })
    ).toBe(true);
  });

  it('should return true when all keys are loading', () => {
    expect(
      isAnyKeyLoading({
        a: { isLoading: true },
        b: { isLoading: true },
      })
    ).toBe(true);
  });
});
