// ══════════════════════════════════════════════════════════════════════════════
// createPersistedWeddingStore — P1-CQ-15
// ══════════════════════════════════════════════════════════════════════════════
//
// Eliminates the ~120 lines of boilerplate duplicated between:
//   - src/lib/visual-effects-store.ts (170 lines, 12 booleans + 3 numbers)
//   - src/lib/luxury-engine-store.ts  (303 lines, 9 booleans + 4 numbers + 2 strings + 1 transient)
//
// Both stores follow the SAME pattern:
//   1. Tenant-scoped localStorage key: `${prefix}_${slug}` (slug from URL or 'default')
//   2. One-time legacy-key migration for the default wedding (Phase 3 ÉTAPE 4)
//   3. `loadFromStorage()` returns Partial<T> (defaults merged by caller)
//   4. `saveToStorage(state)` writes JSON (skipping transient keys like currentFps)
//   5. Five generic actions: toggle(key) / setValue(key, value) /
//      resetToDefaults() / enableAll() / disableAll()
//
// This factory extracts the shared machinery. Stores just declare their
// defaultState, booleanKeys, optional transientKeys, and any CUSTOM actions
// (e.g. luxury-engine's setTheme / setPerformanceTier).
//
// ── Backwards compatibility ──────────────────────────────────────────────────
//   - The returned hook has the SAME type as before (UseBoundStore<...>).
//   - All existing exports (useVisualEffects, useLuxuryEngine, etc.) keep
//     their exact signatures.
//   - Custom actions (setTheme, setPerformanceTier) are added via the
//     `extend` callback — they get `(set, get, saveToStorage)` and return
//     a partial state object that's merged into the store + persisted.
//
// ── Usage ────────────────────────────────────────────────────────────────────
//   export const useMyStore = createPersistedWeddingStore({
//     keyPrefix: 'wedding_my_store',
//     defaultState: { foo: true, bar: 50 },
//     booleanKeys: ['foo'],
//     // optional: keys to strip before persisting (e.g. currentFps)
//     transientKeys: ['runtimeField'],
//     // optional: custom actions
//     extend: (set, get, saveToStorage) => ({
//       setBar: (n: number) => {
//         set({ bar: n })
//         saveToStorage({ ...get(), bar: n })
//       },
//     }),
//   })

import { create, type StoreApi, type UseBoundStore } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The minimal state shape every persisted store must have:
 * the 5 generic actions. The concrete T can add any number of fields
 * (booleans, numbers, strings) plus any custom actions via `extend`.
 */
export interface PersistedStoreActions {
  toggle: (key: string) => void;
  setValue: (key: string, value: boolean | number | string) => void;
  resetToDefaults: () => void;
  enableAll: () => void;
  disableAll: () => void;
}

export interface CreatePersistedWeddingStoreConfig<
  T extends Record<string, unknown>,
  A extends Record<string, unknown> = Record<string, never>,
> {
  /** localStorage key prefix; the actual key is `${keyPrefix}_${slug}`. */
  keyPrefix: string;
  /** Default state — used by `resetToDefaults` and as the merge base. */
  defaultState: T;
  /**
   * Keys whose values are booleans — `toggle()` flips them, and
   * `enableAll()` / `disableAll()` set them all to true / false.
   */
  booleanKeys: readonly (keyof T)[];
  /**
   * Keys to strip before persisting to localStorage. Useful for runtime-only
   * fields like `currentFps` that shouldn't survive a page reload.
   */
  transientKeys?: readonly (keyof T)[];
  /**
   * Optional legacy (un-namespaced) localStorage key. If set, on first load
   * of the default wedding, the legacy key is migrated to the new
   * slug-namespaced key (one-time, then the legacy key is deleted).
   */
  legacyKey?: string;
  /**
   * Add custom actions to the store. Receives `(set, get, saveToStorage)`
   * and should return an object of action functions. The actions are
   * responsible for calling `set()` and `saveToStorage()` themselves —
   * the factory does NOT auto-persist custom actions.
   *
   * The returned object's type is inferred as the second generic parameter
   * `A`, so consumers see the exact function signatures (no `never[]` erasure).
   */
  extend?: (
    set: (partial: Partial<T>) => void,
    get: () => T & PersistedStoreActions & A,
    saveToStorage: (state: Partial<T>) => void
  ) => A;
}

// ─── Tenant-slug + localStorage helpers ───────────────────────────────────────
// Extracted verbatim from the two stores — same logic, same backward-compat.

function getWeddingSlug(): string {
  if (typeof window === 'undefined') return 'default';
  const match = window.location.pathname.match(/^\/w\/([a-z0-9-]+)/i);
  return match?.[1] || 'default';
}

function buildLsKey(prefix: string): string {
  return `${prefix}_${getWeddingSlug()}`;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a tenant-scoped Zustand store with localStorage persistence.
 *
 * The returned hook behaves identically to a hand-rolled `create<T>(...)`
 * store — same hook signature, same `useStore(selector)` pattern.
 */
export function createPersistedWeddingStore<
  T extends Record<string, unknown>,
  A extends Record<string, unknown> = Record<string, never>,
>(
  config: CreatePersistedWeddingStoreConfig<T, A>
): UseBoundStore<StoreApi<T & PersistedStoreActions & A>> {
  const {
    keyPrefix,
    defaultState,
    booleanKeys,
    transientKeys = [],
    legacyKey,
    extend,
  } = config;

  // ── load / save (closure-captured) ───────────────────────────────────────
  function loadFromStorage(): Partial<T> {
    if (typeof window === 'undefined') return {};
    try {
      const key = buildLsKey(keyPrefix);
      // One-time backward-compat migration for the default wedding: if the
      // new slug-namespaced key does not exist yet but the legacy
      // (un-namespaced) key does, copy the data over and remove the legacy key.
      if (
        legacyKey &&
        getWeddingSlug() === 'default' &&
        localStorage.getItem(key) === null
      ) {
        const legacy = localStorage.getItem(legacyKey);
        if (legacy) {
          localStorage.setItem(key, legacy);
          localStorage.removeItem(legacyKey);
        }
      }
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved) as Partial<T>;
    } catch {
      // localStorage may be disabled (private mode) or JSON may be corrupted.
      // Silently fall back to defaults — better than crashing the UI.
    }
    return {};
  }

  function saveToStorage(state: Partial<T>): void {
    if (typeof window === 'undefined') return;
    try {
      const toSave: Record<string, unknown> = { ...state };
      // Strip transient keys (e.g. currentFps) — never persist them.
      for (const k of transientKeys) {
        delete toSave[k as string];
      }
      localStorage.setItem(buildLsKey(keyPrefix), JSON.stringify(toSave));
    } catch {
      // Quota exceeded or storage disabled — silently drop. UI still works
      // in-memory for the rest of the session.
    }
  }

  // ── Build the store ──────────────────────────────────────────────────────
  type FullState = T & PersistedStoreActions & A;

  const useStore = create<FullState>((set, get) => {
    const saved = loadFromStorage();
    const initial = { ...defaultState, ...saved } as T;

    // Helper: persist the current state plus an update — used by every
    // generic action so we don't repeat `saveToStorage({ ...get(), ...update })`.
    function persistUpdate(update: Partial<T>) {
      saveToStorage({ ...(get() as T), ...update });
    }

    const genericActions: PersistedStoreActions = {
      toggle: (key: string) => {
        const current = (get() as T)[key as keyof T];
        if (typeof current === 'boolean') {
          const update = { [key]: !current } as unknown as Partial<T>;
          set(update as unknown as Partial<FullState>);
          persistUpdate(update);
        }
      },
      setValue: (key: string, value: boolean | number | string) => {
        const update = { [key]: value } as unknown as Partial<T>;
        set(update as unknown as Partial<FullState>);
        persistUpdate(update);
      },
      resetToDefaults: () => {
        set(defaultState as unknown as Partial<FullState>);
        saveToStorage(defaultState);
      },
      enableAll: () => {
        const update: Record<string, boolean> = {};
        booleanKeys.forEach((k) => {
          update[k as string] = true;
        });
        const typed = update as unknown as Partial<T>;
        set(typed as unknown as Partial<FullState>);
        persistUpdate(typed);
      },
      disableAll: () => {
        const update: Record<string, boolean> = {};
        booleanKeys.forEach((k) => {
          update[k as string] = false;
        });
        const typed = update as unknown as Partial<T>;
        set(typed as unknown as Partial<FullState>);
        persistUpdate(typed);
      },
    };

    // Cast `extend`'s set/get/saveToStorage to the signatures the helper
    // expects. The casts are safe because `set`/`get` here come from zustand
    // and operate on `FullState` (= T & PersistedStoreActions & A) — they're
    // relaxed to `Partial<T>` / `T & PersistedStoreActions & A` for ergonomics.
    const extendedActions = extend
      ? extend(
          (partial: Partial<T>) => set(partial as unknown as Partial<FullState>),
          () => get() as T & PersistedStoreActions & A,
          (state: Partial<T>) => saveToStorage(state)
        )
      : ({} as A);

    return {
      ...initial,
      ...genericActions,
      ...extendedActions,
    } as FullState;
  });

  return useStore;
}
