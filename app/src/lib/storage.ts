// Тонкая обёртка над localStorage с типизацией и safe-fallback'ом
// (Safari в private mode может бросать). Все ключи приложения должны
// идти через `appKey()` чтобы не конфликтовать с другими инстансами
// на том же origin (когда лендинг и /app1 живут на одном домене).

const PREFIX = "ranepa-app/";

export function appKey(key: string): string {
  return PREFIX + key;
}

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(appKey(key));
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(appKey(key), JSON.stringify(value));
  } catch {
    /* quota / private-mode — silently ignore */
  }
}
