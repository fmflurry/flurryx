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
  // -----------------------------------------------------------------------
  // source → target (default bidirectional — also covered)
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // target → source (bidirectional — NEW direction)
  // -----------------------------------------------------------------------
  it('should mirror state from target to source by default (bidirectional)', () => {
    const source = createSource();
    const target = createTarget();

    mirrorKey(source, 'CUSTOMERS', target);

    target.update('CUSTOMERS', { data: ['Charlie'], status: 'Success' });

    const state = source.get('CUSTOMERS')();
    expect(state.data).toEqual(['Charlie']);
    expect(state.status).toBe('Success');
  });

  it('should support different key names in both directions', () => {
    const source = createSource();
    const target = createTarget();

    mirrorKey(source, 'ITEMS', target, 'ARTICLES');

    // source → target
    source.update('ITEMS', { data: [1, 2, 3], status: 'Success' });
    expect(target.get('ARTICLES')().data).toEqual([1, 2, 3]);

    // target → source
    target.update('ARTICLES', { data: [4, 5, 6], status: 'Success' });
    expect(source.get('ITEMS')().data).toEqual([4, 5, 6]);
  });

  // -----------------------------------------------------------------------
  // no infinite loop
  // -----------------------------------------------------------------------
  it('should NOT cause an infinite update loop', () => {
    const source = createSource();
    const target = createTarget();
    const sourceListener = vi.fn();
    const targetListener = vi.fn();

    mirrorKey(source, 'CUSTOMERS', target);

    source.onUpdate('CUSTOMERS', sourceListener);
    target.onUpdate('CUSTOMERS', targetListener);

    // trigger from source — source fires (original), target fires once (mirror)
    source.update('CUSTOMERS', { data: ['A'] });
    expect(sourceListener).toHaveBeenCalledTimes(1);
    expect(targetListener).toHaveBeenCalledTimes(1);

    // trigger from target — target fires (original), source fires once (mirror)
    target.update('CUSTOMERS', { data: ['B'] });
    expect(targetListener).toHaveBeenCalledTimes(2);
    expect(sourceListener).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // cleanup
  // -----------------------------------------------------------------------
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

  it('should stop mirroring in both directions when cleanup is called', () => {
    const source = createSource();
    const target = createTarget();

    const cleanup = mirrorKey(source, 'CUSTOMERS', target);

    // verify initial
    source.update('CUSTOMERS', { data: ['first'] });
    expect(target.get('CUSTOMERS')().data).toEqual(['first']);

    cleanup();

    // source → target stopped
    source.update('CUSTOMERS', { data: ['second'] });
    expect(source.get('CUSTOMERS')().data).toEqual(['second']);
    expect(target.get('CUSTOMERS')().data).toEqual(['first']);

    // target → source stopped
    target.update('CUSTOMERS', { data: ['third'] });
    expect(target.get('CUSTOMERS')().data).toEqual(['third']);
    expect(source.get('CUSTOMERS')().data).toEqual(['second']);
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

  it('should be safe to call cleanup multiple times', () => {
    const source = createSource();
    const target = createTarget();

    const cleanup = mirrorKey(source, 'CUSTOMERS', target);

    cleanup();
    cleanup(); // second call should not throw

    source.update('CUSTOMERS', { data: ['after'] });
    expect(target.get('CUSTOMERS')().data).toBeUndefined();
    expect(source.get('CUSTOMERS')().data).toEqual(['after']);
  });

  // -----------------------------------------------------------------------
  // loading state
  // -----------------------------------------------------------------------
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

  it('should mirror loading state from target to source (bidirectional)', () => {
    const source = createSource();
    const target = createTarget();

    mirrorKey(source, 'CUSTOMERS', target);

    // target → source
    target.update('CUSTOMERS', { isLoading: true });
    expect(source.get('CUSTOMERS')().isLoading).toBe(true);

    // target → source
    target.update('CUSTOMERS', { isLoading: false, data: ['done'], status: 'Success' });
    expect(source.get('CUSTOMERS')().isLoading).toBe(false);
    expect(source.get('CUSTOMERS')().data).toEqual(['done']);
  });

  // -----------------------------------------------------------------------
  // error state
  // -----------------------------------------------------------------------
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

  it('should mirror error state from target to source (bidirectional)', () => {
    const source = createSource();
    const target = createTarget();

    mirrorKey(source, 'CUSTOMERS', target);

    // target → source
    target.update('CUSTOMERS', {
      status: 'Error',
      errors: [{ code: '404', message: 'Not found' }],
    });
    expect(source.get('CUSTOMERS')().status).toBe('Error');
    expect(source.get('CUSTOMERS')().errors).toEqual([
      { code: '404', message: 'Not found' },
    ]);

    // source → target
    source.update('CUSTOMERS', {
      status: 'Error',
      errors: [{ code: '500', message: 'Server error' }],
    });
    expect(target.get('CUSTOMERS')().status).toBe('Error');
    expect(target.get('CUSTOMERS')().errors).toEqual([
      { code: '500', message: 'Server error' },
    ]);
  });

  // -----------------------------------------------------------------------
  // cache invalidation
  // -----------------------------------------------------------------------
  it('should propagate cache invalidation to target listeners', () => {
    const source = createSource();
    const target = createTarget();
    const listener = vi.fn();

    mirrorKey(source, 'CUSTOMERS', target);
    target.onCacheInvalidate('CUSTOMERS', listener);

    source.invalidateCacheFor('CUSTOMERS');

    expect(listener).toHaveBeenCalledWith({
      key: 'CUSTOMERS',
      resourceKey: undefined,
    });
  });

  it('should propagate cache invalidation from target to source (bidirectional)', () => {
    const source = createSource();
    const target = createTarget();
    const sourceListener = vi.fn();
    const targetListener = vi.fn();

    mirrorKey(source, 'CUSTOMERS', target);

    target.onCacheInvalidate('CUSTOMERS', targetListener);
    source.onCacheInvalidate('CUSTOMERS', sourceListener);

    // source → target
    source.invalidateCacheFor('CUSTOMERS');
    expect(targetListener).toHaveBeenCalledWith({
      key: 'CUSTOMERS',
      resourceKey: undefined,
    });

    vi.clearAllMocks();

    // target → source
    target.invalidateCacheFor('CUSTOMERS');
    expect(sourceListener).toHaveBeenCalledWith({
      key: 'CUSTOMERS',
      resourceKey: undefined,
    });
  });

  // -----------------------------------------------------------------------
  // unidirectional mode
  // -----------------------------------------------------------------------
  it('should only mirror source→target when direction is source-to-target', () => {
    const source = createSource();
    const target = createTarget();

    mirrorKey(source, 'CUSTOMERS', target, { direction: 'source-to-target' });

    // source → target works
    source.update('CUSTOMERS', { data: ['from_source'], status: 'Success' });
    expect(target.get('CUSTOMERS')().data).toEqual(['from_source']);

    // target → source does NOT propagate
    target.update('CUSTOMERS', { data: ['from_target'], status: 'Success' });
    expect(source.get('CUSTOMERS')().data).toEqual(['from_source']);
  });
});
