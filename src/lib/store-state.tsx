import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getStoreSettings, saveStoreSettings } from "@/lib/settings.functions";
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
  /** modo pruebas del proveedor (X-FT-Sandbox) */
  sandbox?: boolean;
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
  whatsapp: "50585300929",
  promoText: "Recarga y podrías ganar diamantes totalmente GRATIS.",
  showPromo: true,
  sandbox: false,
  banks: defaultBanks,
  catalog: baseCategories,
};

type Ctx = {
  settings: StoreSettings;
  setSettings: (s: StoreSettings) => void;
  categories: Category[];
  banks: Bank[];
  findItem: (id: string) => Product | undefined;
  saving: boolean;
  saveError: string;
};

const StoreContext = createContext<Ctx | null>(null);

const baseImages = new Map(
  baseCategories.flatMap((c) => c.items).map((p) => [p.id, p.image] as const),
);
const fallbackImage = baseCategories[0]!.items[0]!.image;

/** Las URLs `/assets/archivo-HASH.jpg` dejan de existir en cada build: se reemplazan. */
function fixImages(catalog: Category[]): Category[] {
  return catalog.map((c) => ({
    ...c,
    items: c.items.map((item) =>
      item.image?.startsWith("/assets/")
        ? { ...item, image: baseImages.get(item.id) ?? fallbackImage }
        : item,
    ),
  }));
}

function merge(parsed: Partial<StoreSettings>): StoreSettings {
  return {
    ...defaultSettings,
    ...parsed,
    banks: parsed.banks?.length ? parsed.banks : defaultBanks,
    catalog: parsed.catalog?.length ? fixImages(parsed.catalog) : baseCategories,
  };
}

function parseJson(json: string | null | undefined): StoreSettings | null {
  if (!json) return null;
  try {
    return merge(JSON.parse(json) as Partial<StoreSettings>);
  } catch {
    return null;
  }
}

export function StoreProvider({
  children,
  initialJson,
}: {
  children: ReactNode;
  /** Configuración oficial cargada en el servidor (evita el parpadeo con datos por defecto). */
  initialJson?: string | null;
}) {
  const [settings, setSettingsState] = useState<StoreSettings>(
    () => parseJson(initialJson) ?? defaultSettings,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const loadSettings = useServerFn(getStoreSettings);
  const persist = useServerFn(saveStoreSettings);

  // 1) caché local inmediata, 2) versión oficial desde la base de datos (misma para todos)
  useEffect(() => {
    if (!initialJson) {
      try {
        const raw = localStorage.getItem(KEY);
        const cached = parseJson(raw);
        if (cached) setSettingsState(cached);
      } catch {
        /* ignore */
      }
    }
    loadSettings()
      .then((res) => {
        if (!res?.json) return;
        const remote = merge(JSON.parse(res.json) as Partial<StoreSettings>);
        setSettingsState(remote);
        try {
          localStorage.setItem(KEY, JSON.stringify(remote));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* sin conexión: se usa la caché local */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSettings = (s: StoreSettings) => {
    setSettingsState(s);
    setSaveError("");
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
    setSaving(true);
    persist({ data: { json: JSON.stringify(s) } })
      .then((res) => {
        if (res && !res.ok) setSaveError(res.message);
      })
      .catch((e: unknown) => {
        setSaveError(
          e instanceof Error && e.message.includes("Forbidden")
            ? "Solo el administrador puede guardar cambios en la tienda."
            : "No se pudieron guardar los cambios en el servidor.",
        );
      })
      .finally(() => setSaving(false));
  };

  const value = useMemo<Ctx>(() => {
    const categories = settings.catalog;
    const findItem = (id: string) =>
      categories.flatMap((c) => c.items).find((p) => p.id === id);
    return { settings, setSettings, categories, banks: settings.banks, findItem, saving, saveError };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, saving, saveError]);

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
