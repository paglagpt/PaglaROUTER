export interface MockKV {
  store: Map<string, string>;
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
}

/** Minimal in-memory KVNamespace stand-in for scheduler tests. */
export function makeKv(): MockKV {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  };
}
