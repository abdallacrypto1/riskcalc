import { useEffect, useState } from "react";

/** Estado persistido no navegador — banca e risco ficam salvos entre sessões. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage indisponível — segue sem persistir */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
