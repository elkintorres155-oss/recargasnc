import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { categories as baseCategories, type Category } from "@/components/store/data";

export type StoreSettings = {
  storeName: string;
  whatsapp: string;
  promoText: string;
  showPromo: boolean;
  /** price overrides: `${productId}:${packId}` -> price in córdobas */
  prices: Record<string, number>;
};

const KEY = "recargas-store-settings";

export const defaultSettings: StoreSettings = {
  storeName: "RECARGAS",
  whatsapp: "50588888888",
  promoText: "Recarga y podrías ganar diamantes totalmente GRATIS.",
  showPromo: true,
  prices: {},
};

type Ctx = {
  settings: StoreSettings;
  setSettings: (s: StoreSettings) => void;
  categories: Category[];
  priceOf: (productId: string, packId: string, base: number) => number;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<StoreSettings>(defaultSettings);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSettingsState({ ...defaultSettings, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const setSettings = (s: StoreSettings) => {
    setSettingsState(s);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<Ctx>(() => {
    const priceOf = (productId: string, packId: string, base: number) =>
      settings.prices[`${productId}:${packId}`] ?? base;

    const categories = baseCategories.map((c) => ({
      ...c,
      items: c.items.map((p) => ({
        ...p,
        packs: p.packs.map((k) => ({ ...k, price: priceOf(p.id, k.id, k.price) })),
      })),
    }));

    return { settings, setSettings, categories, priceOf };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export const formatC = (n: number) =>
  `C$ ${n.toLocaleString("es-NI", { minimumFractionDigits: 0 })}`;
