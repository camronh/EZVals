import { useCallback, useEffect, useState } from 'react'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type DefaultValue<T> = T | (() => T)
type Updater<T> = T | ((prev: T) => T)

function isLazy<T>(value: DefaultValue<T>): value is () => T {
  return typeof value === 'function'
}

function resolveDefault<T>(value: DefaultValue<T>): T {
  return isLazy(value) ? value() : value
}

function readStorage<T>(storage: StorageLike | null, key: string, defaultValue: DefaultValue<T>): T {
  if (!storage) return resolveDefault(defaultValue)
  const raw = storage.getItem(key)
  if (raw == null) return resolveDefault(defaultValue)
  try {
    return JSON.parse(raw) as T
  } catch {
    return raw as T
  }
}

function writeStorage<T>(storage: StorageLike | null, key: string, value: T) {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore storage write failures
  }
}

export function useStorageState<T>(key: string, defaultValue: DefaultValue<T>, storage: StorageLike | null) {
  const [value, setValue] = useState<T>(() => readStorage(storage, key, defaultValue))

  useEffect(() => {
    writeStorage(storage, key, value)
  }, [key, storage, value])

  const setAndPersist = useCallback((updater: Updater<T>) => {
    setValue((prev: T) => {
      const next = typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater
      writeStorage(storage, key, next)
      return next
    })
  }, [key, storage])

  return [value, setAndPersist] as const
}

export function useLocalStorageState<T>(key: string, defaultValue: DefaultValue<T>) {
  const storage = typeof window !== 'undefined' ? window.localStorage : null
  return useStorageState(key, defaultValue, storage)
}

export function useSessionStorageState<T>(key: string, defaultValue: DefaultValue<T>) {
  const storage = typeof window !== 'undefined' ? window.sessionStorage : null
  return useStorageState(key, defaultValue, storage)
}

export function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])

  return debounced
}
