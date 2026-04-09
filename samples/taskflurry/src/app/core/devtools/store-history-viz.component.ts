import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  input,
  signal,
  computed,
  Signal,
} from '@angular/core';

interface HistoryEntry {
  readonly id: number | null;
  readonly index: number;
  readonly message: {
    readonly type: string;
    readonly key?: string;
    readonly resourceKey?: string;
  } | null;
  readonly acknowledgedAt: number | null;
}

export interface HistoryVizStore {
  readonly history: Signal<readonly HistoryEntry[]>;
  readonly currentIndex: Signal<number>;
  travelTo(index: number): void;
  travelToKey(key: string, index?: number): void;
}

const TYPE_LABELS: Record<string, string> = {
  update: 'Updated',
  clear: 'Cleared',
  clearAll: 'Reset all',
  startLoading: 'Loading',
  stopLoading: 'Loaded',
  updateKeyedOne: 'Set item',
  clearKeyedOne: 'Removed item',
  startKeyedLoading: 'Loading item',
};

@Component({
  selector: 'app-store-history-viz',
  standalone: true,
  templateUrl: './store-history-viz.component.html',
  styleUrl: './store-history-viz.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class StoreHistoryVizComponent {
  readonly store = input.required<HistoryVizStore>();
  readonly filterKey = input<string>();

  protected readonly showHistory = signal(false);

  protected readonly history = computed(() => {
    const key = this.filterKey();
    return this.store()
      .history()
      .filter((entry) => {
        if (!entry.message) {
          return false;
        }
        if (entry.message.type !== 'update' && entry.message.type !== 'updateKeyedOne') {
          return false;
        }
        return !key || entry.message.key === key;
      });
  });

  protected readonly currentIndex = computed(() => this.store().currentIndex());

  protected toggleHistory(): void {
    this.showHistory.update((v) => !v);
  }

  protected travelTo(index: number): void {
    const store = this.store();
    const key = this.filterKey();
    if (key) {
      store.travelToKey(key, index);
    } else {
      store.travelTo(index);
    }
  }

  protected entryLabel(entry: HistoryEntry): string {
    if (!entry.message) {
      return 'Initial state';
    }
    return TYPE_LABELS[entry.message.type] ?? entry.message.type;
  }

  protected entryDetail(entry: HistoryEntry): string {
    if (!entry.message) {
      return '';
    }
    const msg = entry.message;
    if (msg.key) {
      return msg.resourceKey ? `${msg.key} [${msg.resourceKey}]` : msg.key;
    }
    return '';
  }

  protected entryTime(entry: HistoryEntry): string {
    if (entry.acknowledgedAt === null) {
      return '';
    }
    return new Date(entry.acknowledgedAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
}
