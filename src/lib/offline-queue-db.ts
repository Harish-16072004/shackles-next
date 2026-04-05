/**
 * IndexedDB-based offline queue for the scanner PWA.
 * Replaces localStorage for better performance and unlimited storage.
 */

export type OfflineAction = {
  id: string;
  type:
    | 'MARK_ATTENDANCE'
    | 'ISSUE_KIT'
    | 'QUICK_REGISTER'
    | 'TEAM_BULK_REGISTER'
    | 'TEAM_REGISTER_MEMBER'
    | 'TEAM_LOCK';
  payload: Record<string, unknown>;
  createdAt: string;
};

const DB_NAME = 'scanner-offline-queue';
const STORE_NAME = 'actions';
const DB_VERSION = 1;
const OLD_LS_KEY = 'scanner-v2-offline-actions';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      // One-time migration from localStorage
      migrateFromLocalStorage(db).then(() => resolve(db)).catch(() => resolve(db));
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Migrate any existing actions from localStorage to IndexedDB (one-time).
 */
async function migrateFromLocalStorage(db: IDBDatabase): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.localStorage.getItem(OLD_LS_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      window.localStorage.removeItem(OLD_LS_KEY);
      return;
    }

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const action of parsed) {
      if (action && typeof action === 'object' && typeof action.id === 'string') {
        store.put(action);
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Clean up localStorage after successful migration
    window.localStorage.removeItem(OLD_LS_KEY);
  } catch {
    // Silently ignore migration errors — localStorage data is preserved as fallback
  }
}

/**
 * Read all queued offline actions.
 */
export async function readOfflineQueue(): Promise<OfflineAction[]> {
  if (typeof indexedDB === 'undefined') return [];

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => {
        resolve((request.result || []) as OfflineAction[]);
      };
      request.onerror = () => {
        resolve([]);
      };
    });
  } catch {
    return [];
  }
}

/**
 * Replace the entire queue with a new set of actions.
 */
export async function writeOfflineQueue(actions: OfflineAction[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Clear existing
    store.clear();

    // Write new
    for (const action of actions) {
      store.put(action);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail — queue will be rebuilt on next sync
  }
}

/**
 * Append a single action to the queue.
 */
export async function appendOfflineAction(action: OfflineAction): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(action);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail
  }
}

/**
 * Remove a single action from the queue by ID.
 */
export async function removeOfflineAction(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail
  }
}
