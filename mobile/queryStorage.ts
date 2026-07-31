import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

const STORAGE_PREFIX = "upsc_query_history_";
const MAX_AGE_DAYS = 50;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export type QueryRecord = {
  id: string;
  subjectId: string;
  subjectName: string;
  question: string;
  answer: string;
  tokenCount: number;
  chunkCount: number;
  timestamp: number;
};

function getKey(subjectId: string): string {
  return `${STORAGE_PREFIX}${subjectId}`;
}

function now(): number {
  return Date.now();
}

export function saveQuery(record: QueryRecord): void {
  if (!isWeb) return;
  try {
    const key = getKey(record.subjectId);
    const raw = localStorage.getItem(key);
    const list: QueryRecord[] = raw ? JSON.parse(raw) : [];
    list.push(record);
    localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

export function getQueries(subjectId: string): QueryRecord[] {
  if (!isWeb) return [];
  try {
    const raw = localStorage.getItem(getKey(subjectId));
    if (!raw) return [];
    const list: QueryRecord[] = JSON.parse(raw);
    const cutoff = now() - MAX_AGE_MS;
    const filtered = list.filter((r) => r.timestamp >= cutoff);
    if (filtered.length !== list.length) {
      localStorage.setItem(getKey(subjectId), JSON.stringify(filtered));
    }
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export function clearQueries(subjectId?: string): void {
  if (!isWeb) return;
  try {
    if (subjectId) {
      localStorage.removeItem(getKey(subjectId));
    } else {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          toRemove.push(key);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    }
  } catch {}
}
