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
    expect(isKeyedResourceData({ entities: {} })).toBe(false);
    expect(
      isKeyedResourceData({ entities: {}, isLoading: {} })
    ).toBe(false);
  });

  it('should return false if any field is null', () => {
    expect(
      isKeyedResourceData({
        entities: null,
        isLoading: {},
        status: {},
        errors: {},
      })
    ).toBe(false);
  });

  it('should return true for a fully populated keyed resource', () => {
    const data = {
      entities: { '1': 'hello' },
      isLoading: { '1': false },
      status: { '1': 'Success' as const },
      errors: {},
    };
    expect(isKeyedResourceData(data)).toBe(true);
  });
});

describe('createKeyedResourceData', () => {
  it('should create an empty keyed resource data structure', () => {
    const data = createKeyedResourceData<string, number>();
    expect(data).toEqual({
      entities: {},
      isLoading: {},
      status: {},
      errors: {},
    });
  });

  it('should create independent instances', () => {
    const a = createKeyedResourceData();
    const b = createKeyedResourceData();
    expect(a).not.toBe(b);
    expect(a.entities).not.toBe(b.entities);
  });
});

describe('isAnyKeyLoading', () => {
  it('should return false for empty loading map', () => {
    expect(isAnyKeyLoading({})).toBe(false);
  });

  it('should return false when all keys are false', () => {
    expect(isAnyKeyLoading({ a: false, b: false })).toBe(false);
  });

  it('should return true when at least one key is loading', () => {
    expect(isAnyKeyLoading({ a: false, b: true })).toBe(true);
  });

  it('should return true when all keys are loading', () => {
    expect(isAnyKeyLoading({ a: true, b: true })).toBe(true);
  });
});
