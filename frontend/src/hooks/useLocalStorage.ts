import { useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T | ((prev: T) => T)) => {
    const toStore = value instanceof Function ? value(storedValue) : value;
    setStoredValue(toStore);
    try {
      window.localStorage.setItem(key, JSON.stringify(toStore));
    } catch {
      // Ignore storage errors
    }
  };

  return [storedValue, setValue] as const;
}
