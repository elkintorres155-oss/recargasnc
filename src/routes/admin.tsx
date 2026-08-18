import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { uploadCatalogImage } from "@/lib/settings.functions";
import type { Category, Pack, Product } from "@/components/store/data";
import { AdminWallets } from "@/components/store/AdminWallets";
import { ProviderCatalog } from "@/components/store/ProviderCatalog";
import { defaultSettings, formatC, slugify, useStore, type Bank } from "@/lib/store-state";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Panel de administración | Recargas" },
      {
        name: "description",
        content:
          "Panel interno de Recargas para editar precios en córdobas, cuentas bancarias, categorías, productos e imágenes de la tienda.",
      },
      { property: "og:title", content: "Panel de administración | Recargas" },
      {
        property: "og:description",
        content: "Gestiona precios, bancos, categorías e imágenes de la tienda Recargas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

const PIN = "1234";

const TABS = [
  { id: "general", label: "⚙️ General" },
  { id: "pagos", label: "🏦 Métodos de pago" },
  { id: "catalogo", label: "🎮 Catálogo y precios" },
  { id: "saldos", label: "💰 Recargas de saldo" },
  { id: "proveedor", label: "🔌 Proveedor" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function ImagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const upload = useServerFn(uploadCatalogImage);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="flex items-center gap-3">
      <img
        src={value}
        alt="Vista previa"
        width={64}
        height={64}
        className="size-16 shrink-0 rounded-xl border border-border object-cover"
      />
      <div className="flex-1">
        <input
          value={value.startsWith("data:") ? "" : value}
          placeholder="URL de la imagen"
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
        <input
          ref={ref}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setErr("");
            setBusy(true);
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                const res = await upload({
                  data: { fileName: file.name, dataUrl: String(reader.result) },
                });
                if (res.ok) onChange(res.url);
                else setErr(res.message);
              } catch {
                setErr("No se pudo subir la imagen (inicia sesión como admin).");
              } finally {
                setBusy(false);
              }
            };
            reader.readAsDataURL(file);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => ref.current?.click()}
          className="mt-2 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {busy ? "Subiendo..." : "📷 Subir imagen"}
        </button>
        {err ? <p className="mt-1 text-xs font-semibold text-destructive">{err}</p> : null}
      </div>
    </div>
  );
}


function AdminPage() {
  const { settings, setSettings, categories, saving, saveError } = useStore();
  const [pin, setPin] = useState("");
  const [ok, setOk] = useState(false);
  const [cat, setCat] = useState(0);
  const [tab, setTab] = useState<TabId>("general");

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

  const update = (patch: Partial<typeof settings>) => setSettings({ ...settings, ...patch });


  const setBanks = (banks: Bank[]) => update({ banks });
  const setCatalog = (catalog: Category[]) => update({ catalog });

  const patchCategory = (ci: number, patch: Partial<Category>) =>
    setCatalog(categories.map((c, i) => (i === ci ? { ...c, ...patch } : c)));

  const patchProduct = (ci: number, pi: number, patch: Partial<Product>) =>
    patchCategory(ci, {
      items: categories[ci]!.items.map((p, i) => (i === pi ? { ...p, ...patch } : p)),
    });

  const patchPack = (ci: number, pi: number, ki: number, patch: Partial<Pack>) =>
    patchProduct(ci, pi, {
      packs: categories[ci]!.items[pi]!.packs.map((k, i) => (i === ki ? { ...k, ...patch } : k)),
    });

  const current = categories[cat] ?? categories[0];

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
        <nav className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full border px-4 py-2 text-xs font-extrabold transition ${
                tab === t.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <p className="mb-4 text-xs font-semibold">
          {saving ? (
            <span className="text-muted-foreground">Guardando en el servidor...</span>
          ) : saveError ? (
            <span className="text-destructive">{saveError}</span>
          ) : (
            <span className="text-muted-foreground">
              Los cambios se guardan en línea y los ven todos los visitantes.
            </span>
          )}
        </p>



        <section className="rounded-3xl border border-border bg-card/60 p-5" hidden={tab !== "general"}>
          <h2 className="text-sm font-extrabold uppercase tracking-wide">Configuración general</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-muted-foreground">Nombre de la tienda</span>
              <input
                value={settings.storeName}
                onChange={(e) => update({ storeName: e.target.value })}
                className={inputCls}
              />
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground">WhatsApp (con código de país)</span>
              <input
                value={settings.whatsapp}
                onChange={(e) => update({ whatsapp: e.target.value.replace(/\D/g, "") })}
                className={inputCls}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-muted-foreground">Texto del aviso promocional</span>
              <input
                value={settings.promoText}
                onChange={(e) => update({ promoText: e.target.value })}
                className={inputCls}
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

        <section
          className="mt-6 rounded-3xl border border-border bg-card/60 p-5"
          hidden={tab !== "pagos"}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide">
              Métodos de pago y cuentas
            </h2>
            <button
              type="button"
              onClick={() =>
                setBanks([
                  ...settings.banks,
                  {
                    id: slugify(`banco-${settings.banks.length + 1}`),
                    name: "Nuevo método",
                    account: "",
                    holder: "",
                    note: "",
                    enabled: true,
                  },
                ])
              }
              className="rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground"
            >
              + Agregar método
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {settings.banks.map((b, i) => (
              <div key={b.id} className="rounded-2xl border border-border/70 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs">
                    <span className="text-muted-foreground">Banco / método</span>
                    <input
                      value={b.name}
                      onChange={(e) =>
                        setBanks(
                          settings.banks.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">Número de cuenta</span>
                    <input
                      value={b.account}
                      onChange={(e) =>
                        setBanks(
                          settings.banks.map((x, j) =>
                            j === i ? { ...x, account: e.target.value } : x,
                          ),
                        )
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">Titular</span>
                    <input
                      value={b.holder}
                      onChange={(e) =>
                        setBanks(
                          settings.banks.map((x, j) =>
                            j === i ? { ...x, holder: e.target.value } : x,
                          ),
                        )
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="text-xs">
                    <span className="text-muted-foreground">Nota / código extra</span>
                    <input
                      value={b.note}
                      onChange={(e) =>
                        setBanks(
                          settings.banks.map((x, j) =>
                            j === i ? { ...x, note: e.target.value } : x,
                          ),
                        )
                      }
                      className={inputCls}
                    />
                  </label>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={b.enabled}
                      onChange={(e) =>
                        setBanks(
                          settings.banks.map((x, j) =>
                            j === i ? { ...x, enabled: e.target.checked } : x,
                          ),
                        )
                      }
                      className="size-4 accent-[hsl(var(--primary))]"
                    />
                    Visible en la tienda
                  </label>
                  <button
                    type="button"
                    onClick={() => setBanks(settings.banks.filter((_, j) => j !== i))}
                    className="text-xs font-semibold text-destructive"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          className="mt-6 rounded-3xl border border-border bg-card/60 p-5"
          hidden={tab !== "catalogo"}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wide">
              Secciones, productos y precios (C$)
            </h2>
            <button
              type="button"
              onClick={() => {
                const name = window.prompt("Nombre de la nueva sección");
                if (!name) return;
                setCatalog([
                  ...categories,
                  { id: slugify(name), icon: "🎮", label: name, items: [] },
                ]);
                setCat(categories.length);
              }}
              className="rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground"
            >
              + Nueva sección
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCat(i)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  i === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          {current ? (
            <>
              <div className="mt-5 grid gap-3 rounded-2xl border border-border/70 p-4 sm:grid-cols-[90px_1fr_auto]">
                <label className="text-xs">
                  <span className="text-muted-foreground">Icono</span>
                  <input
                    value={current.icon}
                    onChange={(e) => patchCategory(cat, { icon: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <label className="text-xs">
                  <span className="text-muted-foreground">Nombre de la sección</span>
                  <input
                    value={current.label}
                    onChange={(e) => patchCategory(cat, { label: e.target.value })}
                    className={inputCls}
                  />
                </label>
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const name = window.prompt("Nombre del nuevo producto");
                      if (!name) return;
                      patchCategory(cat, {
                        items: [
                          ...current.items,
                          {
                            id: slugify(name),
                            name,
                            tag: "Recarga",
                            image: current.items[0]?.image ?? "",
                            needsId: true,
                            providerProductId: "",
                            packs: [{ id: "paquete-1", label: "Paquete 1", price: 100, sku: "" }],
                          },
                        ],
                      });
                    }}
                    className="rounded-full border border-primary/50 px-3 py-2 text-xs font-bold text-primary"
                  >
                    + Producto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`¿Eliminar la sección ${current.label}?`)) return;
                      setCatalog(categories.filter((_, i) => i !== cat));
                      setCat(0);
                    }}
                    className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-destructive"
                  >
                    Eliminar sección
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-5">
                {current.items.map((p, pi) => (
                  <div key={p.id} className="rounded-2xl border border-border/70 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs">
                        <span className="text-muted-foreground">Nombre</span>
                        <input
                          value={p.name}
                          onChange={(e) => patchProduct(cat, pi, { name: e.target.value })}
                          className={inputCls}
                        />
                      </label>
                      <label className="text-xs">
                        <span className="text-muted-foreground">Etiqueta</span>
                        <input
                          value={p.tag}
                          onChange={(e) => patchProduct(cat, pi, { tag: e.target.value })}
                          className={inputCls}
                        />
                      </label>
                    </div>

                    <div className="mt-3">
                      <span className="text-xs text-muted-foreground">Imagen del módulo</span>
                      <div className="mt-1">
                        <ImagePicker
                          value={p.image}
                          onChange={(v) => patchProduct(cat, pi, { image: v })}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!p.needsId}
                          onChange={(e) => patchProduct(cat, pi, { needsId: e.target.checked })}
                          className="size-4 accent-[hsl(var(--primary))]"
                        />
                        Pide ID de jugador
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!p.hot}
                          onChange={(e) => patchProduct(cat, pi, { hot: e.target.checked })}
                          className="size-4 accent-[hsl(var(--primary))]"
                        />
                        Destacado 🔥
                      </label>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs">
                        <span className="text-muted-foreground">ID del producto en proveedor</span>
                        <input
                          value={p.providerProductId ?? ""}
                          onChange={(e) => patchProduct(cat, pi, { providerProductId: e.target.value })}
                          placeholder="ej. freefire"
                          className={inputCls}
                        />
                      </label>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                      {p.packs.map((k, ki) => (
                        <div key={k.id} className="rounded-xl border border-border/60 p-2">
                          <input
                            value={k.label}
                            onChange={(e) => patchPack(cat, pi, ki, { label: e.target.value })}
                            placeholder="Nombre"
                            className={inputCls}
                          />
                          <input
                            type="number"
                            min={0}
                            value={k.price}
                            onChange={(e) =>
                              patchPack(cat, pi, ki, { price: Number(e.target.value) })
                            }
                            placeholder="Precio"
                            className={inputCls}
                          />
                          <input
                            value={k.sku ?? ""}
                            onChange={(e) => patchPack(cat, pi, ki, { sku: e.target.value })}
                            placeholder="SKU proveedor"
                            className={inputCls}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              patchProduct(cat, pi, {
                                packs: p.packs.filter((_, j) => j !== ki),
                              })
                            }
                            className="mt-1 text-[11px] font-semibold text-destructive"
                          >
                            Quitar paquete
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground">
                        {p.packs.length
                          ? `Desde ${formatC(Math.min(...p.packs.map((k) => k.price)))}`
                          : "Sin paquetes"}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            patchProduct(cat, pi, {
                              packs: [
                                ...p.packs,
                                {
                                  id: slugify(`paquete-${p.packs.length + 1}-${Date.now()}`),
                                  label: `Paquete ${p.packs.length + 1}`,
                                  price: 100,
                                  sku: "",
                                },
                              ],
                            })
                          }
                          className="rounded-full border border-primary/50 px-3 py-1.5 text-xs font-bold text-primary"
                        >
                          + Paquete
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!window.confirm(`¿Eliminar ${p.name}?`)) return;
                            patchCategory(cat, {
                              items: current.items.filter((_, j) => j !== pi),
                            });
                          }}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-destructive"
                        >
                          Eliminar producto
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </section>

        {tab === "saldos" ? <AdminWallets /> : null}

        {tab === "proveedor" ? <ProviderCatalog /> : null}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("¿Restablecer toda la tienda a los valores originales?")) return;
              setSettings(defaultSettings);
            }}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Restablecer todo
          </button>
          <span className="text-sm font-semibold text-primary">
            ✅ Cambios guardados automáticamente
          </span>
        </div>
      </main>
    </div>
  );
}
