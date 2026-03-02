import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', async () => {
  return import('../__mocks__/@angular/core');
});

import { Store } from '../store-builder';
import type { ResourceState } from '@flurryx/core';

interface Product {
  id: string;
  price: number;
}

describe('Store fluent builder', () => {
  it('should build a store with a single resource', () => {
    const token = Store
      .resource('products').as<Product[]>()
      .build();

    expect(token).toBeDefined();
    expect(token.description).toBe('FlurryxStore');

    const store = token.options!.factory();
    const sig = store.get('products');
    expect(sig).toBeDefined();
    expect(sig().isLoading).toBe(false);
    expect(sig().data).toBeUndefined();
  });

  it('should build a store with multiple resources', () => {
    const token = Store
      .resource('products').as<Product[]>()
      .resource('selectedProduct').as<Product>()
      .build();

    const store = token.options!.factory();

    expect(store.get('products')).toBeDefined();
    expect(store.get('selectedProduct')).toBeDefined();
  });

  it('should support update operations on built store', () => {
    const token = Store
      .resource('items').as<string[]>()
      .build();

    const store = token.options!.factory();

    store.update('items', {
      data: ['a', 'b'],
      status: 'Success',
    });

    const state = store.get('items')();
    expect(state.data).toEqual(['a', 'b']);
    expect(state.status).toBe('Success');
  });

  it('should support startLoading/stopLoading on built store', () => {
    const token = Store
      .resource('data').as<number>()
      .build();

    const store = token.options!.factory();

    store.startLoading('data');
    expect(store.get('data')().isLoading).toBe(true);

    store.stopLoading('data');
    expect(store.get('data')().isLoading).toBe(false);
  });

  it('should support clear and clearAll on built store', () => {
    const token = Store
      .resource('a').as<string>()
      .resource('b').as<number>()
      .build();

    const store = token.options!.factory();

    store.update('a', { data: 'hello' });
    store.update('b', { data: 99 });

    store.clear('a');
    expect(store.get('a')().data).toBeUndefined();
    expect(store.get('b')().data).toBe(99);

    store.clearAll();
    expect(store.get('b')().data).toBeUndefined();
  });

  it('should support onUpdate callbacks on built store', () => {
    const token = Store
      .resource('items').as<string>()
      .build();

    const store = token.options!.factory();
    const callback = vi.fn();
    const cleanup = store.onUpdate('items', callback);

    store.update('items', { data: 'test' });
    expect(callback).toHaveBeenCalledTimes(1);

    cleanup();
    store.update('items', { data: 'after' });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should produce independent store instances per factory call', () => {
    const token = Store
      .resource('count').as<number>()
      .build();

    const store1 = token.options!.factory();
    const store2 = token.options!.factory();

    store1.update('count', { data: 42 });
    expect(store1.get('count')().data).toBe(42);
    expect(store2.get('count')().data).toBeUndefined();
  });
});
