import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { StoreHeader } from "@/components/store/StoreHeader";
import { findProduct } from "@/components/store/data";
import { formatC, useStore } from "@/lib/store-state";

export const Route = createFileRoute("/producto/$id")({
  head: ({ params }) => {
    const p = findProduct(params.id);
    const title = p ? `${p.name} — Recarga en córdobas | Recargas` : "Producto | Recargas";
    const description = p
      ? `Compra ${p.name} con entrega inmediata. Paquetes desde ${formatC(Math.min(...p.packs.map((k) => k.price)))} en córdobas.`
      : "Recargas de juegos, streaming y gift cards en córdobas.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  loader: ({ params }) => {
    if (!findProduct(params.id)) throw notFound();
    return null;
  },
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { settings, priceOf } = useStore();
  const base = findProduct(id)!;
  const packs = base.packs.map((k) => ({ ...k, price: priceOf(base.id, k.id, k.price) }));

  const [packId, setPackId] = useState(packs[0]!.id);
  const [playerId, setPlayerId] = useState("");
  const [method, setMethod] = useState("Transferencia bancaria");
  const [error, setError] = useState("");

  const pack = packs.find((p) => p.id === packId)!;
  const methods = ["Transferencia bancaria", "Tigo Money", "BAC / Efectivo", "USDT (Binance Pay)"];

  const order = () => {
    if (base.needsId && !playerId.trim()) {
      setError("Ingresa tu ID de jugador para continuar.");
      return;
    }
    setError("");
    const msg = `Hola ${settings.storeName}! Quiero comprar:%0A• Producto: ${base.name}%0A• Paquete: ${pack.label}%0A• Precio: ${formatC(pack.price)}${
      base.needsId ? `%0A• ID de jugador: ${playerId}` : ""
    }%0A• Pago: ${method}`;
    window.open(`https://wa.me/${settings.whatsapp}?text=${msg}`, "_blank");
  };

  return (
    <div className="min-h-screen">
      <StoreHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link to="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          ← Volver al catálogo
        </Link>

        <div className="mt-5 grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="overflow-hidden rounded-3xl border border-border glow-ring">
            <img
              src={base.image}
              alt={base.name}
              width={640}
              height={640}
              className="w-full object-cover"
            />
          </div>

          <div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
              {base.tag}
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{base.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Entrega inmediata y verificada. Precios en córdobas (C$).
            </p>

            <h2 className="mt-6 text-sm font-extrabold uppercase tracking-wide">
              1. Elige tu paquete
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {packs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPackId(p.id)}
                  className={`rounded-2xl border p-3 text-left transition-colors ${
                    p.id === packId
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card/70 hover:border-primary/50"
                  }`}
                >
                  <span className="block text-sm font-bold">{p.label}</span>
                  <span className="mt-1 block text-sm font-extrabold text-primary">
                    {formatC(p.price)}
                  </span>
                </button>
              ))}
            </div>

            {base.needsId ? (
              <>
                <h2 className="mt-6 text-sm font-extrabold uppercase tracking-wide">
                  2. Tu ID de jugador
                </h2>
                <input
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                  placeholder="Ej: 123456789"
                  className="mt-3 w-full rounded-xl border border-border bg-card/70 px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </>
            ) : null}

            <h2 className="mt-6 text-sm font-extrabold uppercase tracking-wide">
              {base.needsId ? "3." : "2."} Método de pago
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {methods.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    m === method
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {error ? <p className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card/70 p-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Total a pagar</p>
                <p className="text-2xl font-extrabold text-primary">{formatC(pack.price)}</p>
              </div>
              <button
                type="button"
                onClick={order}
                className="rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Comprar por WhatsApp
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
