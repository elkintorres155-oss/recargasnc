import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { categories as baseCategories, type Category, type Product } from "@/components/store/data";

export type Bank = {
  id: string;
  name: string;
  account: string;
  holder: string;
  note: string;
  enabled: boolean;
};

export type StoreSettings = {
  storeName: string;
  whatsapp: string;
  promoText: string;
  showPromo: boolean;
  banks: Bank[];
  /** full editable catalog (seeded from base data) */
  catalog: Category[];
};

const KEY = "recargas-store-settings-v2";

export const defaultBanks: Bank[] = [
  {
    id: "lafise",
    name: "LAFISE",
    account: "",
    holder: "",
    note: "Cuenta córdobas",
    enabled: true,
  },
  { id: "bac", name: "BAC", account: "", holder: "", note: "Cuenta córdobas", enabled: true },
  { id: "banpro", name: "BANPRO", account: "", holder: "", note: "Cuenta córdobas", enabled: true },
  {
    id: "billetera-movil",
    name: "BILLETERA MÓVIL",
    account: "",
    holder: "",
    note: "Número de billetera",
    enabled: true,
  },
  {
    id: "binance-play",
    name: "BINANCE PLAY",
    account: "",
    holder: "",
    note: "Pay ID / correo USDT",
    enabled: true,
  },
];

export const defaultSettings: StoreSettings = {
  storeName: "RECARGAS",
  whatsapp: "50588888888",
  promoText: "Recarga y podrías ganar diamantes totalmente GRATIS.",
  showPromo: true,
  banks: defaultBanks,
  catalog: baseCategories,
};

type Ctx = {
  settings: StoreSettings;
  setSettings: (s: StoreSettings) => void;
  categories: Category[];
  banks: Bank[];
  findItem: (id: string) => Product | undefined;
};

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<StoreSettings>(defaultSettings);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoreSettings>;
        setSettingsState({
          ...defaultSettings,
          ...parsed,
          banks: parsed.banks?.length ? parsed.banks : defaultBanks,
          catalog: parsed.catalog?.length ? parsed.catalog : baseCategories,
        });
      }
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
    const categories = settings.catalog;
    const findItem = (id: string) =>
      categories.flatMap((c) => c.items).find((p) => p.id === id);
    return { settings, setSettings, categories, banks: settings.banks, findItem };
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

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || `id-${Math.random().toString(36).slice(2, 7)}`;
