import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import type { KeyedResourceData, ResourceState } from "@flurryx/core";
import {
  BaseStore,
  Store,
  createCompositeStoreMessageChannel,
  createInMemoryStoreMessageChannel,
  createStorageStoreMessageChannel,
  type StoreHistoryEntry,
  type StoreMessageChannel,
} from "../index";
import { createFromToken } from "./test-helpers";

enum ReplayStoreEnum {
  COUNTER = "COUNTER",
  MESSAGE = "MESSAGE",
  KEYED_MESSAGES = "KEYED_MESSAGES",
  META = "META",
}

interface ReplayStoreData {
  [ReplayStoreEnum.COUNTER]: ResourceState<number> & { revision?: number };
  [ReplayStoreEnum.MESSAGE]: ResourceState<{ text: string; version: number }>;
  [ReplayStoreEnum.KEYED_MESSAGES]: ResourceState<
    KeyedResourceData<string, { id: string; text: string }>
  >;
  [ReplayStoreEnum.META]: ResourceState<{
    createdAt: Date;
    lookup: Map<string, number>;
    tags: Set<string>;
  }>;
}

class ReplayStore extends BaseStore<typeof ReplayStoreEnum, ReplayStoreData> {
  constructor(channel?: StoreMessageChannel<ReplayStoreData>) {
    super(ReplayStoreEnum, channel ? { channel } : undefined);
  }
}

class MemoryStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

describe("built-in store broker history", () => {
  let store: ReplayStore;

  beforeEach(() => {
    store = new ReplayStore();
  });

  it("records direct mutations as acknowledged history", () => {
    expect(store.getHistory()).toHaveLength(1);
    expect(store.getHistory()[0]?.id).toBeNull();
    expect(store.getCurrentIndex()).toBe(0);

    store.update(ReplayStoreEnum.COUNTER, {
      data: 1,
      status: "Success",
    });
    store.startLoading(ReplayStoreEnum.MESSAGE);

    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(1);
    expect(store.get(ReplayStoreEnum.MESSAGE)().isLoading).toBe(true);
    expect(store.getHistory()).toHaveLength(3);
    expect(store.getHistory()[1]?.id).not.toBeNull();
    expect(store.getHistory()[2]?.acknowledgedAt).not.toBeNull();
    expect(store.getDeadLetters()).toHaveLength(0);
    expect(store.getCurrentIndex()).toBe(2);

    expect(store.undo()).toBe(true);
    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(1);
    expect(store.get(ReplayStoreEnum.MESSAGE)().isLoading).toBe(false);
    expect(store.redo()).toBe(true);
    expect(store.get(ReplayStoreEnum.MESSAGE)().isLoading).toBe(true);
  });

  it("replays previously acknowledged messages by id", () => {
    store.update(ReplayStoreEnum.COUNTER, {
      data: 1,
      status: "Success",
    });
    store.startLoading(ReplayStoreEnum.MESSAGE);

    const replayIds = store
      .getHistory()
      .slice(1)
      .map((entry) => entry.id)
      .filter((id): id is number => id !== null);

    store.travelTo(0);

    const acknowledged = store.replay(replayIds);

    expect(acknowledged).toBe(2);
    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(1);
    expect(store.get(ReplayStoreEnum.COUNTER)().status).toBe("Success");
    expect(store.get(ReplayStoreEnum.MESSAGE)().isLoading).toBe(true);
    expect(store.getHistory()).toHaveLength(3);
    expect(store.getDeadLetters()).toHaveLength(0);
    expect(store.getCurrentIndex()).toBe(2);
  });

  it("can replay a pending channel message that has never been acknowledged", () => {
    const channel = createInMemoryStoreMessageChannel<ReplayStoreData>();
    const pendingRecord = channel.publish({
      type: "update",
      key: ReplayStoreEnum.COUNTER,
      state: { data: 7, status: "Success" },
    });

    store = new ReplayStore(channel);

    expect(store.getMessages()).toHaveLength(1);
    expect(store.getMessages()[0]?.status).toBe("pending");

    expect(store.replay(pendingRecord.id)).toBe(1);

    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(7);
    expect(store.getMessages()[0]?.status).toBe("acknowledged");
    expect(store.getHistory()).toHaveLength(2);
    expect(store.getHistory()[1]?.id).toBe(pendingRecord.id);
  });

  it("replays a single acknowledged message by id", () => {
    store.update(ReplayStoreEnum.COUNTER, { data: 1, status: "Success" });
    store.update(ReplayStoreEnum.MESSAGE, {
      data: { text: "hello", version: 1 },
      status: "Success",
    });

    const messageId = store.getHistory()[1]!.id;

    store.travelTo(0);
    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBeUndefined();
    expect(store.get(ReplayStoreEnum.MESSAGE)().data).toBeUndefined();

    expect(store.replay(messageId!)).toBe(1);

    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(1);
    expect(store.get(ReplayStoreEnum.MESSAGE)().data).toBeUndefined();
    expect(store.getHistory()).toHaveLength(2);
    expect(store.getCurrentIndex()).toBe(1);
  });

  it("returns history filtered by store key", () => {
    store.update(ReplayStoreEnum.COUNTER, { data: 1, status: "Success" });
    store.startLoading(ReplayStoreEnum.MESSAGE);
    store.update(ReplayStoreEnum.COUNTER, { data: 2, status: "Success" });
    store.clearAll();

    const counterHistory = store.getHistory(ReplayStoreEnum.COUNTER);
    const messageHistory = store.getHistory(ReplayStoreEnum.MESSAGE);

    expect(counterHistory.map((entry) => entry.index)).toEqual([0, 1, 3, 4]);
    expect(messageHistory.map((entry) => entry.index)).toEqual([0, 2, 4]);
    expect(counterHistory[1]?.message?.type).toBe("update");
    expect(counterHistory[2]?.message?.type).toBe("update");
    expect(counterHistory[3]?.message?.type).toBe("clearAll");
    expect(messageHistory[1]?.message?.type).toBe("startLoading");
    expect(messageHistory[2]?.message?.type).toBe("clearAll");
  });

  it("can replay the last acknowledged message for a specific key", () => {
    store.update(ReplayStoreEnum.COUNTER, { data: 1, status: "Success" });
    store.startLoading(ReplayStoreEnum.MESSAGE);
    store.update(ReplayStoreEnum.COUNTER, { data: 2, status: "Success" });

    const counterHistory = store.getHistory(ReplayStoreEnum.COUNTER);
    const lastCounterMessageId = counterHistory.at(-1)?.id;

    store.travelTo(0);
    expect(store.replay(lastCounterMessageId!)).toBe(1);

    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(2);
    expect(store.get(ReplayStoreEnum.MESSAGE)().isLoading).toBe(false);
  });

  it("replays committed history by acknowledged message ids", () => {
    store.update(ReplayStoreEnum.COUNTER, { data: 1, status: "Success" });
    store.update(ReplayStoreEnum.MESSAGE, {
      data: { text: "hello", version: 1 },
      status: "Success",
    });

    const replayIds = store
      .getHistory()
      .slice(1)
      .map((entry) => entry.id)
      .filter((id): id is number => id !== null);

    store.travelTo(0);

    expect(store.replay(replayIds)).toBe(2);

    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(1);
    expect(store.get(ReplayStoreEnum.MESSAGE)().data).toEqual({
      text: "hello",
      version: 1,
    });
    expect(store.getHistory()).toHaveLength(3);
    expect(store.getCurrentIndex()).toBe(2);
  });

  it("supports undo, redo, and time travel across recorded snapshots", () => {
    store.update(ReplayStoreEnum.COUNTER, { data: 1, status: "Success" });
    store.update(ReplayStoreEnum.COUNTER, { data: 2, status: "Success" });

    expect(store.undo()).toBe(true);
    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(1);
    expect(store.getCurrentIndex()).toBe(1);

    expect(store.redo()).toBe(true);
    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(2);
    expect(store.getCurrentIndex()).toBe(2);

    store.travelTo(0);
    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBeUndefined();
    expect(store.undo()).toBe(false);
  });

  it("drops future history when replaying an acknowledged message after time travel", () => {
    store.update(ReplayStoreEnum.COUNTER, { data: 1, status: "Success" });
    store.update(ReplayStoreEnum.COUNTER, { data: 2, status: "Success" });

    const firstMessageId = store.getHistory()[1]!.id;

    store.travelTo(1);
    expect(store.replay(firstMessageId!)).toBe(1);

    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(1);
    expect(store.getHistory()).toHaveLength(3);
    expect(store.redo()).toBe(false);
  });

  it("supports clear, stopLoading, clearAll, and keyed store messages", () => {
    store.startLoading(ReplayStoreEnum.MESSAGE);
    store.stopLoading(ReplayStoreEnum.MESSAGE);
    store.updateKeyedOne(ReplayStoreEnum.KEYED_MESSAGES, "m-1", {
      id: "m-1",
      text: "hello",
    });
    store.startKeyedLoading(ReplayStoreEnum.KEYED_MESSAGES, "m-2");
    store.clearKeyedOne(ReplayStoreEnum.KEYED_MESSAGES, "m-1");
    store.update(ReplayStoreEnum.COUNTER, { data: 5, status: "Success" });
    store.clear(ReplayStoreEnum.COUNTER);

    const keyedData = store.get(ReplayStoreEnum.KEYED_MESSAGES)()
      .data as KeyedResourceData<string, { id: string; text: string }>;

    expect(store.get(ReplayStoreEnum.MESSAGE)().isLoading).toBe(false);
    expect(keyedData.entities["m-1"]).toBeUndefined();
    expect(keyedData.isLoading["m-2"]).toBe(true);
    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBeUndefined();

    store.clearAll();
    expect(store.get(ReplayStoreEnum.KEYED_MESSAGES)().data).toBeUndefined();
  });

  it("moves failed messages to a dead-letter store and replays them after recovery", () => {
    store.clearKeyedOne(ReplayStoreEnum.KEYED_MESSAGES, "m-1");

    expect(store.getHistory()).toHaveLength(1);
    expect(store.getDeadLetters()).toHaveLength(1);
    expect(store.getDeadLetters()[0]?.error).toBe("Message was not acknowledged");

    store.updateKeyedOne(ReplayStoreEnum.KEYED_MESSAGES, "m-1", {
      id: "m-1",
      text: "hello",
    });

    const deadLetterId = store.getDeadLetters()[0]!.id;
    expect(store.replayDeadLetter(deadLetterId)).toBe(true);
    expect(store.getDeadLetters()).toHaveLength(0);

    const keyedData = store.get(ReplayStoreEnum.KEYED_MESSAGES)()
      .data as KeyedResourceData<string, { id: string; text: string }>;
    expect(keyedData.entities["m-1"]).toBeUndefined();
  });

  it("replays all dead letters that can be acknowledged", () => {
    store.clearKeyedOne(ReplayStoreEnum.KEYED_MESSAGES, "m-1");
    store.clearKeyedOne(ReplayStoreEnum.KEYED_MESSAGES, "m-2");

    store.updateKeyedOne(ReplayStoreEnum.KEYED_MESSAGES, "m-1", {
      id: "m-1",
      text: "hello",
    });
    store.updateKeyedOne(ReplayStoreEnum.KEYED_MESSAGES, "m-2", {
      id: "m-2",
      text: "world",
    });

    expect(store.replayDeadLetters()).toBe(2);
    expect(store.getDeadLetters()).toHaveLength(0);
  });

  it("persists messages in a storage-backed channel across store instances", () => {
    const storage = new MemoryStorage();
    const firstChannel = createStorageStoreMessageChannel<ReplayStoreData>({
      storage,
      storageKey: "replay-store",
    });

    const firstStore = new ReplayStore(firstChannel);
    firstStore.update(ReplayStoreEnum.COUNTER, {
      data: 3,
      status: "Success",
    });

    const persistedRecordId = firstStore.getMessages()[0]?.id;
    expect(firstStore.getMessages()[0]?.status).toBe("acknowledged");

    const secondChannel = createStorageStoreMessageChannel<ReplayStoreData>({
      storage,
      storageKey: "replay-store",
    });
    const secondStore = new ReplayStore(secondChannel);

    expect(secondStore.getMessages()).toHaveLength(1);
    expect(secondStore.getMessages()[0]?.id).toBe(persistedRecordId);
    expect(secondStore.getMessages()[0]?.status).toBe("acknowledged");

    secondStore.travelTo(0);
    expect(secondStore.replay(persistedRecordId!)).toBe(1);
    expect(secondStore.get(ReplayStoreEnum.COUNTER)().data).toBe(3);
  });

  it("can fan out to multiple channels through a composite channel", () => {
    const primaryStorage = new MemoryStorage();
    const secondaryStorage = new MemoryStorage();
    const primaryChannel = createStorageStoreMessageChannel<ReplayStoreData>({
      storage: primaryStorage,
      storageKey: "primary-replay-store",
    });
    const secondaryChannel = createStorageStoreMessageChannel<ReplayStoreData>({
      storage: secondaryStorage,
      storageKey: "secondary-replay-store",
    });
    const compositeChannel = createCompositeStoreMessageChannel<ReplayStoreData>({
      channels: [primaryChannel, secondaryChannel],
    });

    store = new ReplayStore(compositeChannel);
    store.update(ReplayStoreEnum.COUNTER, {
      data: 11,
      status: "Success",
    });

    expect(primaryChannel.getMessages()).toHaveLength(1);
    expect(primaryChannel.getMessages()[0]?.status).toBe("acknowledged");
    expect(secondaryChannel.getMessages()).toHaveLength(1);
    expect(secondaryChannel.getMessages()[0]?.status).toBe("acknowledged");
    expect(secondaryChannel.getMessages()[0]?.message.type).toBe("update");
  });

  it("preserves replayed non-plain objects without sharing references", () => {
    const payload = {
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      lookup: new Map([["version", 1]]),
      tags: new Set(["queued"]),
    };

    store.update(ReplayStoreEnum.META, {
      data: payload,
      status: "Success",
    });

    const messageId = store.getHistory()[1]!.id;

    payload.createdAt.setUTCFullYear(2030);
    payload.lookup.set("version", 2);
    payload.tags.add("mutated-after-ack");

    const storedData = store.get(ReplayStoreEnum.META)().data;

    expect(storedData?.createdAt).toBeInstanceOf(Date);
    expect(storedData?.createdAt.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(storedData?.lookup).toBeInstanceOf(Map);
    expect(Array.from(storedData?.lookup.entries() ?? [])).toEqual([
      ["version", 1],
    ]);
    expect(storedData?.tags).toBeInstanceOf(Set);
    expect(Array.from(storedData?.tags ?? [])).toEqual(["queued"]);

    storedData?.lookup.set("version", 99);
    storedData?.tags.add("mutated-after-replay");

    store.travelTo(0);
    expect(store.replay(messageId!)).toBe(1);

    const replayedData = store.get(ReplayStoreEnum.META)().data;

    expect(replayedData?.createdAt.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(Array.from(replayedData?.lookup.entries() ?? [])).toEqual([
      ["version", 1],
    ]);
    expect(Array.from(replayedData?.tags ?? [])).toEqual(["queued"]);
  });

  it("supports keyed time travel, undo, redo, and replay", () => {
    store.updateKeyedOne(ReplayStoreEnum.KEYED_MESSAGES, "m-1", {
      id: "m-1",
      text: "hello",
    });
    store.startKeyedLoading(ReplayStoreEnum.KEYED_MESSAGES, "m-2");

    const replayIds = store
      .getHistory()
      .slice(1, 3)
      .map((entry) => entry.id)
      .filter((id): id is number => id !== null);

    store.travelTo(1);

    let keyedData = store.get(ReplayStoreEnum.KEYED_MESSAGES)().data;
    expect(keyedData?.entities["m-1"]).toEqual({ id: "m-1", text: "hello" });
    expect(keyedData?.isLoading["m-2"]).toBeUndefined();

    expect(store.redo()).toBe(true);
    keyedData = store.get(ReplayStoreEnum.KEYED_MESSAGES)().data;
    expect(keyedData?.isLoading["m-2"]).toBe(true);

    expect(store.undo()).toBe(true);
    keyedData = store.get(ReplayStoreEnum.KEYED_MESSAGES)().data;
    expect(keyedData?.isLoading["m-2"]).toBeUndefined();

    store.travelTo(0);
    expect(store.get(ReplayStoreEnum.KEYED_MESSAGES)().data).toBeUndefined();

    expect(store.replay(replayIds)).toBe(2);
    keyedData = store.get(ReplayStoreEnum.KEYED_MESSAGES)().data;
    expect(keyedData?.entities["m-1"]).toEqual({ id: "m-1", text: "hello" });
    expect(keyedData?.isLoading["m-2"]).toBe(true);
  });

  it("restores snapshots with a single update notification per key", () => {
    const updates: Array<{
      nextData: number | undefined;
      previousData: number | undefined;
    }> = [];

    store.onUpdate(ReplayStoreEnum.COUNTER, (nextState, previousState) => {
      updates.push({
        nextData: nextState.data,
        previousData: previousState.data,
      });
    });

    store.update(ReplayStoreEnum.COUNTER, { data: 1, status: "Success" });
    store.update(ReplayStoreEnum.COUNTER, { data: 2, status: "Success" });

    updates.length = 0;
    store.travelTo(0);

    expect(updates).toEqual([
      {
        nextData: undefined,
        previousData: 2,
      },
    ]);
  });

  it("preserves custom resource-state fields during snapshot restore", () => {
    store.update(ReplayStoreEnum.COUNTER, {
      data: 1,
      isLoading: undefined,
      status: "Success",
      revision: 1,
    });

    store.update(ReplayStoreEnum.COUNTER, {
      data: 2,
      isLoading: true,
      status: "Success",
      revision: 2,
    });
    store.travelTo(1);

    const restoredState = store.get(ReplayStoreEnum.COUNTER)();

    expect(restoredState.data).toBe(1);
    expect(restoredState.revision).toBe(1);
    expect(restoredState.isLoading).toBeUndefined();
  });

  it("allows detached undo and redo calls", () => {
    store.update(ReplayStoreEnum.COUNTER, { data: 1, status: "Success" });
    store.update(ReplayStoreEnum.COUNTER, { data: 2, status: "Success" });

    const { undo, redo } = store;

    expect(undo()).toBe(true);
    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(1);
    expect(redo()).toBe(true);
    expect(store.get(ReplayStoreEnum.COUNTER)().data).toBe(2);
  });

  it("throws when traveling outside history or replaying invalid ids", () => {
    expect(() => store.travelTo(-1)).toThrow();
    expect(() => store.travelTo(1)).toThrow();
    expect(() => store.travelTo(Number.NaN)).toThrow(
      "History index is out of range"
    );
    expect(() => store.travelTo(0.5)).toThrow(
      "History index is out of range"
    );

    store.update(ReplayStoreEnum.COUNTER, { data: 1, status: "Success" });
    const validId = store.getHistory()[1]!.id;

    expect(() => store.replay(0)).toThrow("History message id is out of range");
    expect(() => store.replay(Number.NaN)).toThrow(
      "History message id is out of range"
    );
    expect(() => store.replay(999)).toThrow(
      "History message id is out of range"
    );
    expect(() => store.replay([validId!, -1])).toThrow(
      "History message id is out of range"
    );
  });

  it("preserves correlated typing on broker replay methods", () => {
    const history: readonly StoreHistoryEntry<ReplayStoreData>[] = store.getHistory();
    const keyedHistory = store.getHistory(ReplayStoreEnum.KEYED_MESSAGES);
    const keyedMessages = store.getMessages(ReplayStoreEnum.KEYED_MESSAGES);

    expect(history).toHaveLength(1);
    expect(keyedHistory).toHaveLength(1);
    expect(keyedMessages).toHaveLength(0);

    if (false) {
      const snapshot = history[0]!.snapshot;
      const counterSnapshot:
        | ReplayStoreData[ReplayStoreEnum.COUNTER]
        | undefined = snapshot[ReplayStoreEnum.COUNTER];
      const keyedSnapshot:
        | ReplayStoreData[ReplayStoreEnum.KEYED_MESSAGES]
        | undefined = keyedHistory[0]!.snapshot[ReplayStoreEnum.KEYED_MESSAGES];
      const keyedMessage = keyedMessages[0]?.message;

      store.replay(1);
      store.replay([1, 2]);
      void counterSnapshot;
      void keyedSnapshot;
      void keyedMessage;

      // @ts-expect-error Replay only accepts message ids, not message objects.
      store.replay({
        type: "update",
        key: ReplayStoreEnum.COUNTER,
        state: {
          data: 1,
          status: "Success",
        },
      });
    }
  });
});

describe("built-in store broker integration", () => {
  interface IntegrationStoreConfig {
    MESSAGES: string[];
    ACTIVE_MESSAGE: string;
  }

  it("works with stores built through Store.for<Config>().build()", () => {
    const token = Store.for<IntegrationStoreConfig>().build();
    const store = createFromToken(token);

    store.update("MESSAGES", {
      data: ["hello", "world"],
      status: "Success",
    });
    store.update("ACTIVE_MESSAGE", {
      data: "world",
      status: "Success",
    });

    expect(store.get("MESSAGES")().data).toEqual(["hello", "world"]);
    expect(store.get("ACTIVE_MESSAGE")().data).toBe("world");

    const replayIds = store
      .getHistory()
      .slice(1)
      .map((entry) => entry.id)
      .filter((id): id is number => id !== null);

    store.travelTo(0);
    expect(store.replay(replayIds)).toBe(2);

    store.travelTo(1);
    expect(store.get("MESSAGES")().data).toEqual(["hello", "world"]);
    expect(store.get("ACTIVE_MESSAGE")().data).toBeUndefined();
  });

  it("accepts store options when building an interface-based store", () => {
    const storage = new MemoryStorage();
    const token = Store.for<IntegrationStoreConfig>().build({
      channel: createStorageStoreMessageChannel({
        storage,
        storageKey: "integration-store",
      }),
    });
    const store = createFromToken(token);

    store.update("MESSAGES", {
      data: ["hello"],
      status: "Success",
    });

    expect(store.getMessages()).toHaveLength(1);
    expect(store.getMessages()[0]?.status).toBe("acknowledged");
  });
});
