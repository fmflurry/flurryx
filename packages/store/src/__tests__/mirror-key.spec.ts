import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', async () => {
  return import('../__mocks__/@angular/core');
});

import { LazyStore } from '../lazy-store';
import { mirrorKey } from '../mirror-key';
import type { IStore } from '../types';
import type { ResourceState } from '@flurryx/core';

type SourceData = {
  CUSTOMERS: ResourceState<string[]>;
  ITEMS: ResourceState<number[]>;
};

type TargetData = {
  CUSTOMERS: ResourceState<string[]>;
  ARTICLES: ResourceState<number[]>;
};

function createSource(): IStore<SourceData> {
  return new LazyStore<SourceData>();
}

function createTarget(): IStore<TargetData> {
  return new LazyStore<TargetData>();
}

describe('mirrorKey', () => {
  it('should mirror state from source to target using the same key', () => {
    const source = createSource();
    const target = createTarget();

    mirrorKey(source, 'CUSTOMERS', target);

    source.update('CUSTOMERS', { data: ['Alice', 'Bob'], status: 'Success' });

    const state = target.get('CUSTOMERS')();
    expect(state.data).toEqual(['Alice', 'Bob']);
    expect(state.status).toBe('Success');
  });

  it('should use sourceKey as targetKey by default', () => {
    const source = createSource();
    const target = createTarget();

    mirrorKey(source, 'CUSTOMERS', target);

    source.update('CUSTOMERS', { data: ['test'], status: 'Success' });

    expect(target.get('CUSTOMERS')().data).toEqual(['test']);
  });

  it('should allow specifying a different target key', () => {
    const source = createSource();
    const target = createTarget();

    mirrorKey(source, 'ITEMS', target, 'ARTICLES');

    source.update('ITEMS', { data: [1, 2, 3], status: 'Success' });

    const state = target.get('ARTICLES')();
    expect(state.data).toEqual([1, 2, 3]);
    expect(state.status).toBe('Success');
  });

  it('should stop mirroring when cleanup function is called', () => {
    const source = createSource();
    const target = createTarget();

    const cleanup = mirrorKey(source, 'CUSTOMERS', target);

    source.update('CUSTOMERS', { data: ['first'] });
    expect(target.get('CUSTOMERS')().data).toEqual(['first']);

    cleanup();

    source.update('CUSTOMERS', { data: ['second'] });
    expect(target.get('CUSTOMERS')().data).toEqual(['first']);
  });

  it('should register cleanup via destroyRef when provided as options', () => {
    const source = createSource();
    const target = createTarget();
    const destroyFn = vi.fn();
    const destroyRef = {
      onDestroy: (fn: () => void) => {
        destroyFn.mockImplementation(fn);
      },
    };

    mirrorKey(source, 'CUSTOMERS', target, { destroyRef });

    source.update('CUSTOMERS', { data: ['alive'] });
    expect(target.get('CUSTOMERS')().data).toEqual(['alive']);

    // Simulate Angular destroy
    destroyFn();

    source.update('CUSTOMERS', { data: ['dead'] });
    expect(target.get('CUSTOMERS')().data).toEqual(['alive']);
  });

  it('should register cleanup via destroyRef with different target key', () => {
    const source = createSource();
    const target = createTarget();
    const destroyFn = vi.fn();
    const destroyRef = {
      onDestroy: (fn: () => void) => {
        destroyFn.mockImplementation(fn);
      },
    };

    mirrorKey(source, 'ITEMS', target, 'ARTICLES', { destroyRef });

    source.update('ITEMS', { data: [42] });
    expect(target.get('ARTICLES')().data).toEqual([42]);

    destroyFn();

    source.update('ITEMS', { data: [99] });
    expect(target.get('ARTICLES')().data).toEqual([42]);
  });

  it('should mirror loading state changes', () => {
    const source = createSource();
    const target = createTarget();

    mirrorKey(source, 'CUSTOMERS', target);

    source.update('CUSTOMERS', { isLoading: true });
    expect(target.get('CUSTOMERS')().isLoading).toBe(true);

    source.update('CUSTOMERS', { isLoading: false, data: ['done'], status: 'Success' });
    expect(target.get('CUSTOMERS')().isLoading).toBe(false);
    expect(target.get('CUSTOMERS')().data).toEqual(['done']);
  });

  it('should mirror error state', () => {
    const source = createSource();
    const target = createTarget();

    mirrorKey(source, 'CUSTOMERS', target);

    source.update('CUSTOMERS', {
      status: 'Error',
      errors: [{ code: '500', message: 'Server error' }],
    });

    const state = target.get('CUSTOMERS')();
    expect(state.status).toBe('Error');
    expect(state.errors).toEqual([{ code: '500', message: 'Server error' }]);
  });
});
