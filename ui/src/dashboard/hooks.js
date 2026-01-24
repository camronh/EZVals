import { useCallback, useEffect, useState } from 'react'

function readStorage(storage, key, defaultValue) {
  if (!storage) return typeof defaultValue === 'function' ? defaultValue() : defaultValue
  const raw = storage.getItem(key)
  if (raw == null) return typeof defaultValue === 'function' ? defaultValue() : defaultValue
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function writeStorage(storage, key, value) {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage write failures
  }
}

export function useStorageState(key, defaultValue, storage) {
  const [value, setValue] = useState(() => readStorage(storage, key, defaultValue))

  useEffect(() => {
    writeStorage(storage, key, value)
  }, [key, storage, value])

  const setAndPersist = useCallback((updater) => {
    setValue((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      writeStorage(storage, key, next)
      return next
    })
  }, [key, storage])

  return [value, setAndPersist]
}

export function useLocalStorageState(key, defaultValue) {
  const storage = typeof window !== 'undefined' ? window.localStorage : null
  return useStorageState(key, defaultValue, storage)
}

export function useSessionStorageState(key, defaultValue) {
  const storage = typeof window !== 'undefined' ? window.sessionStorage : null
  return useStorageState(key, defaultValue, storage)
}

export function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])

  return debounced
}
