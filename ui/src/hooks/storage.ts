import { useEffect, useState } from 'react'

function read<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

/** State persisted to web storage. `initial`, when given, wins over the stored value (e.g. from the URL). */
function useStoredState<T>(storage: Storage, key: string, fallback: T | (() => T), initial?: T | null) {
  const [value, setValue] = useState<T>(() => initial ?? read(storage, key, fallback instanceof Function ? fallback() : fallback))
  useEffect(() => {
    try {
      storage.setItem(key, JSON.stringify(value))
    } catch {
      // storage full or unavailable: keep the in-memory value
    }
  }, [storage, key, value])
  return [value, setValue] as const
}

export const useLocalState = <T,>(key: string, fallback: T | (() => T), initial?: T | null) => useStoredState(localStorage, key, fallback, initial)
export const useSessionState = <T,>(key: string, fallback: T | (() => T), initial?: T | null) => useStoredState(sessionStorage, key, fallback, initial)

export function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
