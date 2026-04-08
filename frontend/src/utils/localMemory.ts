/**
 * 浏览器端本地记忆（参考 OpenClaw：数据落在本机、可长期保留IndexedDB + 可选与后端同步）。
 *
 * - 每条诊断完整存一份，不受条数上限。
 * - 同步前使用 `pending-*` 作为 id；服务端返回后合并为服务端 id。
 */
import type { DiagnoseResult } from "./api";

const DB_NAME = "noterx_local_memory";
const DB_VERSION = 1;
const STORE = "diagnoses";

export interface LocalDiagnosisRecord {
  /** 主键：服务端 id 或 pending-${uuid} */
  id: string;
  /** 同步成功后的服务端 id（与 id 相同）；未同步为 null */
  serverId: string | null;
  title: string;
  category: string;
  overall_score: number;
  grade: string;
  createdAt: number;
  report: DiagnoseResult;
  params: Record<string, unknown>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
  });
}

/**
 * 从旧版 localStorage 迁移至多 ~10 条简略记录（一次性）。
 */
export async function migrateLegacyLocalStorage(): Promise<void> {
  try {
    const raw = localStorage.getItem("noterx_history");
    if (!raw) return;
    const arr = JSON.parse(raw) as Array<{
      title: string;
      score: number;
      grade: string;
      category: string;
      date: number;
      report: DiagnoseResult;
      params?: Record<string, unknown>;
    }>;
    if (!Array.isArray(arr) || arr.length === 0) {
      localStorage.removeItem("noterx_history");
      return;
    }
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    for (const h of arr) {
      const id = `legacy-${h.date}-${Math.random().toString(36).slice(2, 10)}`;
      os.put({
        id,
        serverId: null,
        title: h.title,
        category: h.category,
        overall_score: h.score,
        grade: h.grade,
        createdAt: h.date,
        report: h.report,
        params: h.params ?? {},
      } satisfies LocalDiagnosisRecord);
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error ?? new Error("tx failed"));
    });
    localStorage.removeItem("noterx_history");
  } catch {
    /* 迁移失败不阻塞主流程 */
  }
}

export async function putLocalDiagnosis(rec: LocalDiagnosisRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("put failed"));
    tx.objectStore(STORE).put(rec);
  });
}

export async function getLocalDiagnosis(id: string): Promise<LocalDiagnosisRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as LocalDiagnosisRecord | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("get failed"));
  });
}

export async function listLocalDiagnoses(): Promise<LocalDiagnosisRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as LocalDiagnosisRecord[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("getAll failed"));
  });
}

export async function deleteLocalDiagnosis(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("delete failed"));
    tx.objectStore(STORE).delete(id);
  });
}

/**
 * 将 pending 记录替换为服务端 id（删除旧键、写入新键）。
 */
export async function replacePendingWithServerId(pendingId: string, serverId: string): Promise<void> {
  const prev = await getLocalDiagnosis(pendingId);
  if (!prev) return;
  await deleteLocalDiagnosis(pendingId);
  await putLocalDiagnosis({
    ...prev,
    id: serverId,
    serverId,
  });
}

/** @returns 新的 pending id */
export function createPendingId(): string {
  return `pending-${crypto.randomUUID()}`;
}

export function localRecordToListItem(r: LocalDiagnosisRecord): import("./api").HistoryListItem {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    overall_score: r.overall_score,
    grade: r.grade,
    created_at: new Date(r.createdAt).toISOString(),
  };
}
