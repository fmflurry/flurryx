import { describe, expect, it } from "vitest";
import {
  createInMemoryStoreMessageChannel,
  createStorageStoreMessageChannel,
  createCompositeStoreMessageChannel,
} from "../index";
import type { ResourceState } from "@flurryx/core";

interface TestStoreData {
  ITEMS: ResourceState<string[]>;
  ACTIVE: ResourceState<{ id: string; name: string }>;
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

function createUpdateMessage(
  data: string[],
  status: "Success" | "Error" = "Success"
) {
  return {
    type: "update" as const,
    key: "ITEMS" as const,
    state: { data, status },
  };
}

function createActiveMessage(
  data: { id: string; name: string },
  status: "Success" | "Error" = "Success"
) {
  return {
    type: "update" as const,
    key: "ACTIVE" as const,
    state: { data, status },
  };
}

describe("corrupted storage data", () => {
  it("returns empty state when storage contains invalid JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem("test-key", "not valid json");

    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "test-key",
    });

    expect(channel.getMessages()).toEqual([]);
  });

  it("returns empty state when storage contains truncated JSON", () => {
    const storage = new MemoryStorage();
    storage.setItem("test-key", "{");

    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "test-key",
    });

    expect(channel.getMessages()).toEqual([]);
  });

  it("allows publish after reading from empty storage", () => {
    const storage = new MemoryStorage();

    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "test-key",
    });

    expect(channel.getMessages()).toEqual([]);

    const record = channel.publish(createUpdateMessage(["hello"]));
    expect(record.id).toBe(1);
    expect(channel.getMessages()).toHaveLength(1);
  });
});

describe("serialization round-trip", () => {
  it("round-trips messages with primitive values", () => {
    const storage = new MemoryStorage();
    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "rt-test",
    });

    const record = channel.publish(createUpdateMessage(["hello", "world"]));
    const messages = channel.getMessages();

    expect(messages).toHaveLength(1);
    expect(messages[0]!.message).toEqual({
      type: "update",
      key: "ITEMS",
      state: { data: ["hello", "world"], status: "Success" },
    });
    expect(messages[0]!.id).toBe(record.id);
  });

  it("round-trips messages with undefined values", () => {
    const storage = new MemoryStorage();
    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "rt-test",
    });

    channel.publish({
      type: "update" as const,
      key: "ITEMS" as const,
      state: {
        data: undefined,
        isLoading: false,
        status: undefined,
        errors: undefined,
      },
    });

    const messages = channel.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.message.type).toBe("update");

    const state = (
      messages[0]!.message as {
        type: "update";
        key: "ITEMS";
        state: Partial<ResourceState<string[]>>;
      }
    ).state;
    expect(state.data).toBeUndefined();
    expect(state.isLoading).toBe(false);
    expect(state.status).toBeUndefined();
    expect(state.errors).toBeUndefined();
  });

  it("round-trips messages with nested objects", () => {
    const storage = new MemoryStorage();
    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "rt-test",
    });

    channel.publish(
      createActiveMessage({ id: "abc-123", name: "nested item" })
    );

    const messages = channel.getMessages();
    expect(messages).toHaveLength(1);

    const state = (
      messages[0]!.message as {
        type: "update";
        key: "ACTIVE";
        state: Partial<ResourceState<{ id: string; name: string }>>;
      }
    ).state;
    expect(state.data).toEqual({ id: "abc-123", name: "nested item" });
    expect(state.status).toBe("Success");
  });

  it("preserves message metadata across reads", () => {
    const storage = new MemoryStorage();
    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "rt-test",
    });

    const record = channel.publish(createUpdateMessage(["meta-test"]));

    // Read from a fresh channel pointing to the same storage
    const freshChannel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "rt-test",
    });

    const messages = freshChannel.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.id).toBe(record.id);
    expect(messages[0]!.status).toBe(record.status);
    expect(messages[0]!.createdAt).toBe(record.createdAt);
    expect(messages[0]!.attempts).toBe(record.attempts);
  });
});

describe("stale nextId correction", () => {
  it("corrects stale nextId when messages have higher ids", () => {
    const storage = new MemoryStorage();

    // Publish messages through a channel to get properly serialized data
    const setupChannel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "stale-test",
    });

    setupChannel.publish(createUpdateMessage(["first"]));
    setupChannel.publish(createUpdateMessage(["second"]));

    // Read raw storage, tamper with nextId to make it stale
    const raw = storage.getItem("stale-test")!;
    const parsed = JSON.parse(raw) as {
      __flurryxType: string;
      entries: [string, unknown][];
    };

    // Find the nextId entry and set it to 1 (stale)
    const nextIdEntry = parsed.entries.find(
      ([key]: [string, unknown]) => key === "nextId"
    );
    if (nextIdEntry) {
      nextIdEntry[1] = 1;
    }
    storage.setItem("stale-test", JSON.stringify(parsed));

    // Create a new channel — normalizeStoreMessageChannelState should correct nextId
    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "stale-test",
    });

    const newRecord = channel.publish(createUpdateMessage(["third"]));
    // The new message id should be higher than existing message ids
    expect(newRecord.id).toBeGreaterThanOrEqual(3);
  });

  it("handles empty messages array gracefully", () => {
    const storage = new MemoryStorage();

    // Create a channel to establish the storage format, then remove all messages
    const setupChannel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "empty-test",
    });

    // No messages published — storage is empty, so fresh channel reads empty
    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "empty-test",
    });

    expect(channel.getMessages()).toEqual([]);

    // Verify we can still publish after reading empty state
    const record = setupChannel.publish(createUpdateMessage(["first"]));
    expect(record.id).toBe(1);
  });
});

describe("composite channel validation", () => {
  it("throws descriptive error for empty channels array", () => {
    expect(() =>
      createCompositeStoreMessageChannel<TestStoreData>({ channels: [] })
    ).toThrow("at least one channel");
  });

  it("replicates published messages to all channels", () => {
    const channel1 = createInMemoryStoreMessageChannel<TestStoreData>();
    const channel2 = createInMemoryStoreMessageChannel<TestStoreData>();

    const composite = createCompositeStoreMessageChannel<TestStoreData>({
      channels: [channel1, channel2],
    });

    composite.publish(createUpdateMessage(["replicated"]));

    expect(channel1.getMessages()).toHaveLength(1);
    expect(channel2.getMessages()).toHaveLength(1);

    expect(channel1.getMessages()[0]!.message).toEqual(
      channel2.getMessages()[0]!.message
    );
  });

  it("replicates saveMessage to all channels", () => {
    const channel1 = createInMemoryStoreMessageChannel<TestStoreData>();
    const channel2 = createInMemoryStoreMessageChannel<TestStoreData>();

    const composite = createCompositeStoreMessageChannel<TestStoreData>({
      channels: [channel1, channel2],
    });

    const record = composite.publish(createUpdateMessage(["initial"]));

    const updatedRecord = {
      ...record,
      status: "acknowledged" as const,
      attempts: 1,
      acknowledgedAt: Date.now(),
    };
    composite.saveMessage(updatedRecord);

    expect(channel1.getMessage(record.id)!.status).toBe("acknowledged");
    expect(channel2.getMessage(record.id)!.status).toBe("acknowledged");
  });
});

describe("in-memory channel", () => {
  it("allocates sequential ids", () => {
    const channel = createInMemoryStoreMessageChannel<TestStoreData>();

    const r1 = channel.publish(createUpdateMessage(["a"]));
    const r2 = channel.publish(createUpdateMessage(["b"]));
    const r3 = channel.publish(createUpdateMessage(["c"]));

    expect(r1.id).toBe(1);
    expect(r2.id).toBe(2);
    expect(r3.id).toBe(3);
  });

  it("returns undefined for non-existent message id", () => {
    const channel = createInMemoryStoreMessageChannel<TestStoreData>();

    expect(channel.getMessage(999)).toBeUndefined();
  });

  it("saveMessage updates existing record by id", () => {
    const channel = createInMemoryStoreMessageChannel<TestStoreData>();

    const record = channel.publish(createUpdateMessage(["original"]));
    expect(record.status).toBe("pending");

    const updatedRecord = {
      ...record,
      status: "acknowledged" as const,
      attempts: 1,
      acknowledgedAt: Date.now(),
    };
    channel.saveMessage(updatedRecord);

    const fetched = channel.getMessage(record.id);
    expect(fetched!.status).toBe("acknowledged");
    expect(fetched!.attempts).toBe(1);
  });

  it("saveMessage adds new record when id not found", () => {
    const channel = createInMemoryStoreMessageChannel<TestStoreData>();

    const newRecord = {
      id: 999,
      message: createUpdateMessage(["injected"]),
      status: "pending" as const,
      attempts: 0,
      createdAt: Date.now(),
      lastAttemptedAt: null,
      acknowledgedAt: null,
      error: null,
    };

    channel.saveMessage(newRecord);
    const fetched = channel.getMessage(999);

    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(999);
  });

  it("returns defensive copies from getMessages", () => {
    const channel = createInMemoryStoreMessageChannel<TestStoreData>();

    channel.publish(createUpdateMessage(["original"]));

    const firstRead = channel.getMessages();
    const secondRead = channel.getMessages();

    // Arrays should be different references
    expect(firstRead).not.toBe(secondRead);

    // Individual records should be different references
    expect(firstRead[0]).not.toBe(secondRead[0]);

    // But values should be equal
    expect(firstRead).toEqual(secondRead);
  });
});

describe("storage quota exhaustion", () => {
  class QuotaLimitedStorage {
    private readonly entries = new Map<string, string>();
    private maxSize: number;

    constructor(maxSize: number) {
      this.maxSize = maxSize;
    }

    getItem(key: string): string | null {
      return this.entries.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
      if (value.length > this.maxSize) {
        const error = new DOMException(
          "The quota has been exceeded.",
          "QuotaExceededError"
        );
        throw error;
      }
      this.entries.set(key, value);
    }

    removeItem(key: string): void {
      this.entries.delete(key);
    }

    setMaxSize(size: number): void {
      this.maxSize = size;
    }
  }

  it("should evict oldest messages when storage is full on publish", () => {
    const storage = new QuotaLimitedStorage(Infinity);
    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "test-quota",
    });

    // Publish several messages with plenty of room
    channel.publish(createUpdateMessage(["a"]));
    channel.publish(createUpdateMessage(["b"]));
    channel.publish(createUpdateMessage(["c"]));
    channel.publish(createUpdateMessage(["d"]));
    channel.publish(createUpdateMessage(["e"]));

    expect(channel.getMessages()).toHaveLength(5);

    // Tighten limit: allow roughly the same size as current (5 messages).
    // Adding a 6th message will exceed the limit, triggering eviction.
    const currentData = storage.getItem("test-quota")!;
    storage.setMaxSize(currentData.length);

    // This should trigger eviction of the oldest message(s)
    channel.publish(createUpdateMessage(["f"]));

    const remaining = channel.getMessages();
    // Old messages were evicted, new one is present
    expect(remaining.length).toBeLessThan(6);
    expect(remaining.length).toBeGreaterThan(0);
    // The newest message survived
    const lastMessage = remaining[remaining.length - 1]!;
    expect(lastMessage.message.type).toBe("update");
    expect(
      (lastMessage.message as { state: { data: string[] } }).state.data
    ).toEqual(["f"]);
    // The oldest message was evicted
    const ids = remaining.map((r) => r.id);
    expect(ids).not.toContain(1);
  });

  it("should evict oldest messages when storage is full on saveMessage", () => {
    const storage = new QuotaLimitedStorage(Infinity);
    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "test-quota-save",
    });

    const record = channel.publish(createUpdateMessage(["a"]));
    channel.publish(createUpdateMessage(["b"]));

    const currentData = storage.getItem("test-quota-save")!;
    storage.setMaxSize(currentData.length + 10);

    // saveMessage triggers writeState — should evict if needed
    channel.saveMessage({
      ...record,
      status: "acknowledged",
      acknowledgedAt: Date.now(),
    });

    // Should not throw — eviction handled it
    const messages = channel.getMessages();
    expect(messages.length).toBeGreaterThan(0);
  });

  it("should throw non-quota errors", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("disk failure");
      },
      removeItem: () => {},
    };

    const channel = createStorageStoreMessageChannel<TestStoreData>({
      storage,
      storageKey: "test-error",
    });

    expect(() => channel.publish(createUpdateMessage(["a"]))).toThrow(
      "disk failure"
    );
  });
});
