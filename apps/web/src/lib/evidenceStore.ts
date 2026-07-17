import type { ProcessedDemonstration } from "./validation";

const DB_NAME = "flowwright-evidence";
const STORE = "demonstrations";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable in this environment"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "demonstration_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

export async function storeEvidenceCollection(
  evidence: ProcessedDemonstration,
): Promise<void> {
  const demonstrationId =
    evidence.demonstration_id || `local-${crypto.randomUUID()}`;
  const payload = { ...evidence, demonstration_id: demonstrationId };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    });
    db.close();
  } catch {
    // Fall back to a compact session reference when IndexedDB is blocked.
    sessionStorage.setItem(
      "flowwright.demonstration_id",
      demonstrationId,
    );
  }
}

export async function loadEvidenceCollection(
  demonstrationId: string,
): Promise<ProcessedDemonstration | null> {
  try {
    const db = await openDb();
    const result = await new Promise<ProcessedDemonstration | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(demonstrationId);
        request.onsuccess = () =>
          resolve((request.result as ProcessedDemonstration | undefined) ?? null);
        request.onerror = () =>
          reject(request.error ?? new Error("IndexedDB read failed"));
      },
    );
    db.close();
    return result;
  } catch {
    return null;
  }
}

export function resolveFrameImage(
  evidence: ProcessedDemonstration,
  frameId: string | null | undefined,
): string | null {
  if (!frameId) return null;
  const frame = evidence.frames.find((item) => item.id === frameId);
  return frame ? `data:${frame.mime_type};base64,${frame.image_base64}` : null;
}
