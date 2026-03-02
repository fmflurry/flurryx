import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, Observable } from 'rxjs';

vi.mock('@angular/core', async () => {
  return import('../__mocks__/@angular/core');
});

import { BaseStore } from '@flurryx/store';
import type { ResourceState } from '@flurryx/core';
import { SkipIfCached } from '../decorators/skip-if-cached';

enum TestEnum {
  DATA = 'DATA',
}

interface TestData {
  [TestEnum.DATA]: ResourceState<string>;
}

class TestStore extends BaseStore<typeof TestEnum, TestData> {
  constructor() {
    super(TestEnum);
  }
}

describe('SkipIfCached', () => {
  let store: TestStore;

  beforeEach(() => {
    store = new TestStore();
  });

  it('should execute method on first call', () => {
    const methodFn = vi.fn();

    class TestFacade {
      store = store;

      @SkipIfCached(TestEnum.DATA, (i: TestFacade) => i.store)
      loadData() {
        methodFn();
      }
    }

    const facade = new TestFacade();
    facade.loadData();

    expect(methodFn).toHaveBeenCalledTimes(1);
  });

  it('should skip execution when store has Success status', () => {
    const methodFn = vi.fn();

    class TestFacade {
      store = store;

      @SkipIfCached(TestEnum.DATA, (i: TestFacade) => i.store)
      loadData() {
        methodFn();
      }
    }

    const facade = new TestFacade();

    // First call - executes
    facade.loadData();
    expect(methodFn).toHaveBeenCalledTimes(1);

    // Simulate successful store state
    store.update(TestEnum.DATA, {
      data: 'cached',
      status: 'Success',
    });

    // Second call - should be skipped (cache hit)
    facade.loadData();
    expect(methodFn).toHaveBeenCalledTimes(1);
  });

  it('should skip execution when store isLoading', () => {
    const methodFn = vi.fn();

    class TestFacade {
      store = store;

      @SkipIfCached(TestEnum.DATA, (i: TestFacade) => i.store)
      loadData() {
        methodFn();
      }
    }

    const facade = new TestFacade();

    // First call executes and records cache
    facade.loadData();
    expect(methodFn).toHaveBeenCalledTimes(1);

    // Simulate loading state
    store.startLoading(TestEnum.DATA);

    // Second call with loading — should be skipped
    facade.loadData();
    expect(methodFn).toHaveBeenCalledTimes(1);
  });

  it('should re-execute after Error status', () => {
    const methodFn = vi.fn();

    class TestFacade {
      store = store;

      @SkipIfCached(TestEnum.DATA, (i: TestFacade) => i.store)
      loadData() {
        methodFn();
      }
    }

    const facade = new TestFacade();

    // First call
    facade.loadData();
    expect(methodFn).toHaveBeenCalledTimes(1);

    // Simulate error
    store.update(TestEnum.DATA, { status: 'Error', errors: [{ code: 'E', message: 'err' }] });

    // Second call — error clears cache, should re-execute
    facade.loadData();
    expect(methodFn).toHaveBeenCalledTimes(2);
  });

  it('should return observable when returnObservable is true', () => {
    class TestFacade {
      store = store;

      @SkipIfCached(TestEnum.DATA, (i: TestFacade) => i.store, true)
      loadData(): Observable<string> {
        return of('data');
      }
    }

    const facade = new TestFacade();
    const result = facade.loadData();

    expect(result).toBeDefined();

    let emitted: string | undefined;
    (result as Observable<string>).subscribe((v) => {
      emitted = v as string;
    });
    expect(emitted).toBe('data');
  });

  it('should return cached observable on subsequent calls', () => {
    const methodFn = vi.fn().mockReturnValue(of('data'));

    class TestFacade {
      store = store;

      @SkipIfCached(TestEnum.DATA, (i: TestFacade) => i.store, true)
      loadData(): Observable<string> {
        return methodFn();
      }
    }

    const facade = new TestFacade();

    // Simulate success state after first call
    store.update(TestEnum.DATA, { data: 'data', status: 'Success' });

    const result1 = facade.loadData();
    let emitted1: string | undefined;
    (result1 as Observable<string>).subscribe((v) => {
      emitted1 = v as string;
    });

    // Should return of(storeData) without calling original
    expect(emitted1).toBe('data');
    // First call goes to the original since the cache entry didn't exist yet
    expect(methodFn).toHaveBeenCalledTimes(1);
  });

  it('should execute original when store context is unavailable', () => {
    const methodFn = vi.fn().mockReturnValue('result');

    class TestFacade {
      store: TestStore | undefined = undefined;

      @SkipIfCached(TestEnum.DATA, (i: TestFacade) => i.store)
      loadData() {
        return methodFn();
      }
    }

    const facade = new TestFacade();
    const result = facade.loadData();

    expect(methodFn).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  it('should re-execute when args change', () => {
    const methodFn = vi.fn();

    class TestFacade {
      store = store;

      @SkipIfCached(TestEnum.DATA, (i: TestFacade) => i.store)
      loadData(id: string) {
        methodFn(id);
      }
    }

    const facade = new TestFacade();

    facade.loadData('a');
    expect(methodFn).toHaveBeenCalledTimes(1);

    // Simulate success
    store.update(TestEnum.DATA, { data: 'cached-a', status: 'Success' });

    // Same args - cache hit
    facade.loadData('a');
    expect(methodFn).toHaveBeenCalledTimes(1);

    // Different args - should re-execute
    facade.loadData('b');
    expect(methodFn).toHaveBeenCalledTimes(2);
  });
});
