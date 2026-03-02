import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@angular/core', async () => {
  return import('../__mocks__/@angular/core');
});

import { BaseStore } from '@flurryx/store';
import type { ResourceState } from '@flurryx/core';
import { Loading } from '../decorators/loading';

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

describe('Loading', () => {
  let store: TestStore;

  beforeEach(() => {
    store = new TestStore();
  });

  it('should call startLoading before the original method', () => {
    class TestFacade {
      store = store;

      @Loading(TestEnum.DATA, (i: TestFacade) => i.store)
      loadData() {
        return 'result';
      }
    }

    const facade = new TestFacade();
    const result = facade.loadData();

    expect(store.get(TestEnum.DATA)().isLoading).toBe(true);
    expect(result).toBe('result');
  });

  it('should call startKeyedLoading when first arg is string/number', () => {
    const spy = vi.spyOn(store, 'startKeyedLoading');

    class TestFacade {
      store = store;

      @Loading(TestEnum.DATA, (i: TestFacade) => i.store)
      loadItem(id: string) {
        return id;
      }
    }

    const facade = new TestFacade();
    facade.loadItem('abc');

    expect(spy).toHaveBeenCalledWith(TestEnum.DATA, 'abc');
  });

  it('should fall back to startLoading when first arg is not key-like', () => {
    const loadingSpy = vi.spyOn(store, 'startLoading');

    class TestFacade {
      store = store;

      @Loading(TestEnum.DATA, (i: TestFacade) => i.store)
      loadAll(options: { page: number }) {
        return options;
      }
    }

    const facade = new TestFacade();
    facade.loadAll({ page: 1 });

    expect(loadingSpy).toHaveBeenCalledWith(TestEnum.DATA);
  });
});
