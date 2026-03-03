import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', async () => {
  return import('../__mocks__/@angular/core');
});

import { LazyStore } from '../lazy-store';
import { collectKeyed } from '../collect-keyed';
import type { IStore } from '../types';
import type { ResourceState, KeyedResourceData, KeyedResourceKey } from '@flurryx/core';

interface Customer {
  id: string;
  name: string;
}

type SourceData = {
  CUSTOMER_DETAILS: ResourceState<Customer>;
};

type TargetData = {
  CUSTOMER_DETAILS: ResourceState<KeyedResourceData<string, Customer>>;
  CUSTOMER_CACHE: ResourceState<KeyedResourceData<string, Customer>>;
};

function createSource(): IStore<SourceData> {
  return new LazyStore<SourceData>();
}

function createTarget(): IStore<TargetData> {
  return new LazyStore<TargetData>();
}

describe('collectKeyed', () => {
  const extractId = (data: Customer | undefined): KeyedResourceKey | undefined => data?.id;

  it('should initialize target key with empty keyed resource data', () => {
    const source = createSource();
    const target = createTarget();

    collectKeyed<SourceData, TargetData, Customer>(source, 'CUSTOMER_DETAILS', target, {
      extractId,
    });

    const state = target.get('CUSTOMER_DETAILS')();
    expect(state.data).toBeDefined();
    expect(state.data!.entities).toEqual({});
    expect(state.data!.isLoading).toEqual({});
    expect(state.data!.status).toEqual({});
    expect(state.data!.errors).toEqual({});
  });

  it('should accumulate entities on success', () => {
    const source = createSource();
    const target = createTarget();

    collectKeyed<SourceData, TargetData, Customer>(source, 'CUSTOMER_DETAILS', target, {
      extractId,
    });

    // First entity
    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c1', name: 'Alice' },
      status: 'Success',
      isLoading: false,
    });

    let state = target.get('CUSTOMER_DETAILS')();
    expect(state.data!.entities['c1']).toEqual({ id: 'c1', name: 'Alice' });
    expect(state.data!.status['c1']).toBe('Success');
    expect(state.data!.isLoading['c1']).toBe(false);

    // Second entity
    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c2', name: 'Bob' },
      status: 'Success',
      isLoading: false,
    });

    state = target.get('CUSTOMER_DETAILS')();
    expect(state.data!.entities['c1']).toEqual({ id: 'c1', name: 'Alice' });
    expect(state.data!.entities['c2']).toEqual({ id: 'c2', name: 'Bob' });
  });

  it('should use a different target key when specified', () => {
    const source = createSource();
    const target = createTarget();

    collectKeyed<SourceData, TargetData, Customer>(
      source,
      'CUSTOMER_DETAILS',
      target,
      'CUSTOMER_CACHE',
      { extractId },
    );

    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c1', name: 'Alice' },
      status: 'Success',
    });

    const state = target.get('CUSTOMER_CACHE')();
    expect(state.data!.entities['c1']).toEqual({ id: 'c1', name: 'Alice' });
  });

  it('should remove entity when source is cleared', () => {
    const source = createSource();
    const target = createTarget();

    collectKeyed<SourceData, TargetData, Customer>(source, 'CUSTOMER_DETAILS', target, {
      extractId,
    });

    // Add entity
    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c1', name: 'Alice' },
      status: 'Success',
    });

    expect(target.get('CUSTOMER_DETAILS')().data!.entities['c1']).toBeDefined();

    // Clear source
    source.clear('CUSTOMER_DETAILS');

    const state = target.get('CUSTOMER_DETAILS')();
    expect(state.data!.entities['c1']).toBeUndefined();
  });

  it('should handle error state for an entity', () => {
    const source = createSource();
    const target = createTarget();

    collectKeyed<SourceData, TargetData, Customer>(source, 'CUSTOMER_DETAILS', target, {
      extractId,
    });

    // First, load successfully so we have a previousId
    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c1', name: 'Alice' },
      status: 'Success',
    });

    // Now simulate an error for a different entity
    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c2', name: '' },
      status: 'Error',
      errors: [{ code: '404', message: 'Not found' }],
    });

    const state = target.get('CUSTOMER_DETAILS')();
    expect(state.data!.status['c2']).toBe('Error');
    expect(state.data!.errors['c2']).toEqual([{ code: '404', message: 'Not found' }]);
    // Previous entity should still exist
    expect(state.data!.entities['c1']).toEqual({ id: 'c1', name: 'Alice' });
  });

  it('should stop collecting when cleanup function is called', () => {
    const source = createSource();
    const target = createTarget();

    const cleanup = collectKeyed<SourceData, TargetData, Customer>(
      source,
      'CUSTOMER_DETAILS',
      target,
      { extractId },
    );

    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c1', name: 'Alice' },
      status: 'Success',
    });

    cleanup();

    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c2', name: 'Bob' },
      status: 'Success',
    });

    const state = target.get('CUSTOMER_DETAILS')();
    expect(state.data!.entities['c1']).toBeDefined();
    expect(state.data!.entities['c2']).toBeUndefined();
  });

  it('should register cleanup via destroyRef', () => {
    const source = createSource();
    const target = createTarget();
    const destroyFn = vi.fn();
    const destroyRef = {
      onDestroy: (fn: () => void) => {
        destroyFn.mockImplementation(fn);
      },
    };

    collectKeyed<SourceData, TargetData, Customer>(source, 'CUSTOMER_DETAILS', target, {
      extractId,
      destroyRef,
    });

    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c1', name: 'Alice' },
      status: 'Success',
    });

    destroyFn();

    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c2', name: 'Bob' },
      status: 'Success',
    });

    expect(target.get('CUSTOMER_DETAILS')().data!.entities['c1']).toBeDefined();
    expect(target.get('CUSTOMER_DETAILS')().data!.entities['c2']).toBeUndefined();
  });

  it('should track loading state per entity', () => {
    const source = createSource();
    const target = createTarget();

    collectKeyed<SourceData, TargetData, Customer>(source, 'CUSTOMER_DETAILS', target, {
      extractId,
    });

    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c1', name: '' },
      isLoading: true,
    });

    let state = target.get('CUSTOMER_DETAILS')();
    expect(state.data!.isLoading['c1']).toBe(true);
    expect(state.isLoading).toBe(true);

    source.update('CUSTOMER_DETAILS', {
      data: { id: 'c1', name: 'Alice' },
      status: 'Success',
      isLoading: false,
    });

    state = target.get('CUSTOMER_DETAILS')();
    expect(state.data!.isLoading['c1']).toBe(false);
    expect(state.data!.entities['c1']).toEqual({ id: 'c1', name: 'Alice' });
  });
});
