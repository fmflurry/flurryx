import {
  ChangeDetectionStrategy,
  Component,
  signal,
  computed,
  ViewEncapsulation,
  input,
} from '@angular/core';

interface StoreMsg {
  readonly type: string;
  readonly key?: string;
  readonly resourceKey?: string;
}

interface HistoryEntry {
  readonly id: number | null;
  readonly index: number;
  readonly message: StoreMsg | null;
  readonly acknowledgedAt: number | null;
}

interface MessageRecord {
  readonly id: number;
  readonly message: StoreMsg;
  readonly status: string;
  readonly attempts: number;
  readonly createdAt: number;
  readonly acknowledgedAt: number | null;
}

interface StoreSignals {
  readonly history: import('@angular/core').Signal<readonly HistoryEntry[]>;
  readonly messages: import('@angular/core').Signal<readonly MessageRecord[]>;
  readonly currentIndex: import('@angular/core').Signal<number>;
  undo(): boolean;
  redo(): boolean;
  travelTo(index: number): void;
  replay(id: number): number;
}

export interface StoreActivitySource {
  readonly name: string;
  readonly store: StoreSignals;
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
  selector: 'app-store-activity-panel',
  standalone: true,
  templateUrl: './store-activity-panel.component.html',
  styleUrl: './store-activity-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class StoreActivityPanelComponent {
  readonly stores = input.required<readonly StoreActivitySource[]>();

  protected readonly open = signal(false);
  protected readonly activeTab = signal<'history' | 'messages'>('history');
  protected readonly selectedStoreIndex = signal(0);

  protected readonly activeStore = computed(() => {
    const list = this.stores();
    const idx = this.selectedStoreIndex();
    return (list[idx] ?? list[0]).store;
  });

  protected readonly history = computed(() => this.activeStore().history());
  protected readonly messages = computed(() => this.activeStore().messages());
  protected readonly currentIndex = computed(() => this.activeStore().currentIndex());

  protected readonly canUndo = computed(() => this.currentIndex() > 0);
  protected readonly canRedo = computed(() => this.currentIndex() < this.history().length - 1);
  protected readonly opCount = computed(() => Math.max(0, this.history().length - 1));

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected selectStore(index: number): void {
    this.selectedStoreIndex.set(index);
  }

  protected setTab(tab: 'history' | 'messages'): void {
    this.activeTab.set(tab);
  }

  protected undo(): void {
    this.activeStore().undo();
  }

  protected redo(): void {
    this.activeStore().redo();
  }

  protected travelTo(index: number): void {
    this.activeStore().travelTo(index);
  }

  protected replay(messageId: number): void {
    this.activeStore().replay(messageId);
  }

  protected typeLabel(type: string): string {
    return TYPE_LABELS[type] ?? type;
  }

  protected formatKey(msg: StoreMsg): string {
    if (msg.key) {
      return msg.resourceKey ? `${msg.key} [${msg.resourceKey}]` : msg.key;
    }
    return '';
  }

  protected formatHistoryLabel(entry: HistoryEntry): string {
    if (!entry.message) {
      return 'Initial snapshot';
    }
    return this.typeLabel(entry.message.type);
  }

  protected formatHistoryDetail(entry: HistoryEntry): string {
    if (!entry.message) {
      return 'Store created';
    }
    return this.formatKey(entry.message);
  }

  protected formatTime(timestamp: number | null): string {
    if (timestamp === null) {
      return '';
    }
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
