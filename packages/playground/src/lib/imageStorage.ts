/**
 * Client-side persistence of the currently loaded image, so it survives a
 * page reload or a trip to another route. Uses IndexedDB (not localStorage)
 * since images are binary and can easily exceed localStorage's quota.
 */

const DB_NAME = "oimp-image-store";
const STORE_NAME = "images";
const IMAGE_KEY = "currentImage";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveStoredImage(file: File): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(file, IMAGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB may be unavailable (private mode, SSR) — non-fatal.
  }
}

export async function loadStoredImage(): Promise<File | null> {
  try {
    const db = await openDb();
    const file = await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(IMAGE_KEY);
      req.onsuccess = () => resolve((req.result as File) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return file;
  } catch {
    return null;
  }
}
