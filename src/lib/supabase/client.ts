"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Remplace inconditionnellement sessionStorage par une version mémoire.
// Certains navigateurs (Brave Shields, Firefox strict, etc.) bloquent
// sessionStorage ET l'API Web Crypto utilisée par le flow PKCE.
if (typeof window !== "undefined") {
  const sessMem: Record<string, string> = {};
  const safeSess: Storage = {
    getItem: (k) => sessMem[k] ?? null,
    setItem: (k, v) => {
      sessMem[k] = v;
    },
    removeItem: (k) => {
      delete sessMem[k];
    },
    clear: () => {
      Object.keys(sessMem).forEach((k) => delete sessMem[k]);
    },
    key: (i) => Object.keys(sessMem)[i] ?? null,
    get length() {
      return Object.keys(sessMem).length;
    },
  };
  try {
    Object.defineProperty(window, "sessionStorage", {
      value: safeSess,
      writable: true,
      configurable: true,
    });
  } catch {
    // Silencieux si le navigateur refuse même Object.defineProperty
  }
}

// Fallback mémoire pour localStorage aussi
const lsMem: Record<string, string> = {};
const safeStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem(k) {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return lsMem[k] ?? null;
    }
  },
  setItem(k, v) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      lsMem[k] = v;
    }
  },
  removeItem(k) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      delete lsMem[k];
    }
  },
};

// Singleton : un SEUL client Supabase pour toute l'app browser.
// Sans ça, chaque appel à createClient() instancie un nouveau client
// (avec sa propre WebSocket Realtime), ce qui fait planter les `.on()`
// des canaux partagés et explose la conso mémoire/sockets.
let clientInstance: SupabaseClient<Database> | null = null;

export function createClient() {
  if (clientInstance) return clientInstance;
  clientInstance = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage: safeStorage,
        detectSessionInUrl: true,
        persistSession: true,
        // "implicit" évite le flow PKCE qui requiert Web Crypto API
        // (bloqué par Brave Shields / Firefox strict mode)
        flowType: "implicit",
      },
    }
  );
  return clientInstance;
}
