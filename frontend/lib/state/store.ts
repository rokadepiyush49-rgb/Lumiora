import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  /** The state the server rendered with; used as the hydration snapshot. */
  initial: T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(listener: () => void): () => void;
}

/** Minimal external store; selectors must return stable references. */
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    initial,
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : patch;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useStore<T extends object, U>(store: Store<T>, selector: (s: T) => U): U {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    // Hydration must match the server render, which always sees the initial
    // state — even if effects elsewhere already mutated the client store.
    () => selector(store.initial),
  );
}
