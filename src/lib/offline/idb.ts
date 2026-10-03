/**
 * Tiny promise wrapper over one IndexedDB object store. No dependency; falls
 * back to an in-memory map when IndexedDB is unavailable (private mode, SSR).
 */

const DB_NAME = "olympus";
const STORE = "outbox";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function idbAll<T extends { id: string }>(): Promise<T[]> {
  const db = await open();
  if (!db) return Array.from(memory.values()) as T[];
  return (await tx(db, "readonly", (s) => s.getAll())) as T[];
}

export async function idbPut<T extends { id: string }>(value: T): Promise<void> {
  const db = await open();
  if (!db) {
    memory.set(value.id, value);
    return;
  }
  await tx(db, "readwrite", (s) => s.put(value));
}

export async function idbDelete(id: string): Promise<void> {
  const db = await open();
  if (!db) {
    memory.delete(id);
    return;
  }
  await tx(db, "readwrite", (s) => s.delete(id));
}
