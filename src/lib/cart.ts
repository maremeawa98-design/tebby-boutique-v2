import { useSyncExternalStore } from 'react';

export type CartItem = {
  variantId: number;
  slug: string;
  name: string;
  size: string;
  price: number;
  image: string;
  quantity: number;
};

type State = { items: CartItem[]; open: boolean };

const KEY = 'tebby-panier';
const listeners = new Set<() => void>();
let state: State = { items: [], open: false };
let loaded = false;

function hydrate() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(saved)) state = { ...state, items: saved };
  } catch {
    // Stockage indisponible : le panier reste en mémoire pour cette page.
  }
}

function commit(next: Partial<State>) {
  state = { ...state, ...next };
  if (next.items) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.items));
    } catch {
      // Stockage indisponible : le panier reste en mémoire pour cette page.
    }
  }
  listeners.forEach((listener) => listener());
}

export const cart = {
  add(item: Omit<CartItem, 'quantity'>) {
    hydrate();
    const found = state.items.find((i) => i.variantId === item.variantId);
    const items = found
      ? state.items.map((i) => (i === found ? { ...i, quantity: Math.min(i.quantity + 1, 20) } : i))
      : [...state.items, { ...item, quantity: 1 }];
    commit({ items, open: true });
  },
  setQuantity(variantId: number, quantity: number) {
    const items = state.items
      .map((i) => (i.variantId === variantId ? { ...i, quantity: Math.min(quantity, 20) } : i))
      .filter((i) => i.quantity > 0);
    commit({ items });
  },
  replace: (items: CartItem[]) => commit({ items }),
  clear: () => commit({ items: [] }),
  show: () => commit({ open: true }),
  hide: () => commit({ open: false }),
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const empty: State = { items: [], open: false };

export function useCart() {
  return useSyncExternalStore(
    subscribe,
    () => {
      hydrate();
      return state;
    },
    () => empty,
  );
}
