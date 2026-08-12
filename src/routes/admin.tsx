import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { categories } from "@/components/store/data";
import { defaultSettings, formatC, useStore } from "@/lib/store-state";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Panel de administración | Recargas" },
      {
        name: "description",
        content:
          "Panel interno de Recargas para editar precios en córdobas, nombre de la tienda, WhatsApp y avisos promocionales.",
      },
      { property: "og:title", content: "Panel de administración | Recargas" },
      {
        property: "og:description",
        content: "Gestiona precios en córdobas y la configuración de la tienda Recargas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

const PIN = "1234";

function AdminPage() {
  const { settings, setSettings, priceOf } = useStore();
  const [pin, setPin] = useState("");
  const [ok, setOk] = useState(false);
  const [cat, setCat] = useState(categories[0]!.id);
  const [saved, setSaved] = useState(false);

  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card/70 p-6 text-center">
          <h1 className="text-xl font-extrabold">Panel de administración</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ingresa el PIN de acceso para gestionar la tienda.
          </p>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="mt-4 w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => setOk(pin === PIN)}
            className="mt-3 w-full rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground"
          >
            Entrar
          </button>
          {pin && pin !== PIN ? (
            <p className="mt-3 text-xs text-destructive">PIN incorrecto.</p>
          ) : null}
          <Link
            to="/"
            className="mt-4 block text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            ← Volver a la tienda
          </Link>
        </div>
      </div>
    );
  }

  const category = categories.find((c) => c.id === cat)!;

  const update = (patch: Partial<typeof settings>) => {
    setSettings({ ...settings, ...patch });
    setSaved(true);
  };

  const setPrice = (productId: string, packId: string, value: number) => {
    update({ prices: { ...settings.prices, [`${productId}:${packId}`]: value } });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-extrabold">⚙️ Panel de administración</h1>
          <Link
            to="/"
            className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-semibold"
          >
            Ver tienda
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="rounded-3xl border border-border bg-card/60 p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide">Configuración general</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-muted-foreground">Nombre de la tienda</span>
              <input
                value={settings.storeName}
                onChange={(e) => update({ storeName: e.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-primary"
              />
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground">WhatsApp (con código de país)</span>
              <input
                value={settings.whatsapp}
                onChange={(e) => update({ whatsapp: e.target.value.replace(/\D/g, "") })}
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-primary"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-muted-foreground">Texto del aviso promocional</span>
              <input
                value={settings.promoText}
                onChange={(e) => update({ promoText: e.target.value })}
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-primary"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.showPromo}
                onChange={(e) => update({ showPromo: e.target.checked })}
                className="size-4 accent-[hsl(var(--primary))]"
              />
              Mostrar aviso promocional
            </label>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-border bg-card/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide">
              Precios en córdobas (C$)
            </h2>
            <button
              type="button"
              onClick={() => update({ prices: {} })}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Restablecer precios
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(c.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  c.id === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-5">
            {category.items.map((p) => (
              <div key={p.id} className="rounded-2xl border border-border/70 p-4">
                <h3 className="text-sm font-bold">{p.name}</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {p.packs.map((k) => (
                    <label key={k.id} className="text-xs">
                      <span className="text-muted-foreground">{k.label}</span>
                      <input
                        type="number"
                        min={0}
                        value={priceOf(p.id, k.id, k.price)}
                        onChange={(e) => setPrice(p.id, k.id, Number(e.target.value))}
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Desde{" "}
                  {formatC(Math.min(...p.packs.map((k) => priceOf(p.id, k.id, k.price))))}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSettings(defaultSettings);
              setSaved(true);
            }}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Restablecer todo
          </button>
          {saved ? (
            <span className="text-sm font-semibold text-primary">
              ✅ Cambios guardados automáticamente
            </span>
          ) : null}
        </div>
      </main>
    </div>
  );
}
